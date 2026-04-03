import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type {
  AppConfig,
  AppState,
  FormatResult,
  FormatStatusFn,
  HookEvent,
  QuotaSnapshot,
  Runtime,
  SlackProfile,
  StoredQuotaSnapshot,
} from "./types.js";
import { APP_NAME } from "./constants.js";
import { ensureDir, appendLogLine } from "./utils.js";
import { acquireLock } from "./lock.js";
import { loadConfig } from "./config.js";
import { loadState, saveState, setLastError } from "./state.js";
import { toQuotaSnapshot, probeClaudeUsage } from "./claude-usage.js";
import {
  getSlackToken,
  getSlackProfile,
  setSlackProfile,
  profilesEqual,
  shouldThrottleSlackWrite,
  isHardSlackError,
} from "./slack.js";

const execFileAsync = promisify(execFileCb);

export interface RuntimeOptions {
  appHome?: string;
  settingsPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  execFile?: Runtime["execFile"];
  fetchImpl?: typeof globalThis.fetch;
}

export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const env = options.env ?? process.env;
  const homeDir = env.HOME ?? os.homedir();
  const appHome =
    options.appHome ??
    env.CC_SLACK_STATUS_HOME ??
    path.join(homeDir, ".claude", APP_NAME);
  const settingsPath =
    options.settingsPath ??
    path.join(homeDir, ".claude", "settings.json");

  return {
    env,
    homeDir,
    appHome,
    settingsPath,
    statePath: path.join(appHome, "state.json"),
    configPath: path.join(appHome, "config.json"),
    lockPath: path.join(appHome, "state.lock"),
    logDir: path.join(appHome, "logs"),
    logPath: path.join(appHome, "logs", "events.jsonl"),
    formatPath: path.join(appHome, "format.mjs"),
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    execFile:
      options.execFile ??
      (async (file: string, args: string[]) => {
        const result = await execFileAsync(file, args);
        return { stdout: result.stdout, stderr: result.stderr };
      }),
    now: options.now ?? (() => Date.now()),
  };
}

async function loadFormatFn(formatPath: string): Promise<FormatStatusFn> {
  const url = pathToFileURL(formatPath).href;
  const mod = (await import(url)) as { formatStatus?: FormatStatusFn };
  if (typeof mod.formatStatus !== "function") {
    throw new Error("format.mjs must export a formatStatus function");
  }
  return mod.formatStatus;
}

function computeExpiration(nowMs: number, leaseSeconds: number): number {
  return leaseSeconds > 0 ? Math.floor(nowMs / 1000) + leaseSeconds : 0;
}

function fallbackFormat(snapshot: QuotaSnapshot): FormatResult {
  const p5 = Math.round(snapshot.fiveHour.percentLeft);
  const p7 = Math.round(snapshot.sevenDay.percentLeft);
  return {
    statusText: `Claude 5h:${p5}% 7d:${p7}%`,
    statusEmoji:
      p5 < 10 || p7 < 10 ? ":red_circle:" : ":large_green_circle:",
  };
}

export async function handleHookEvent(
  runtime: Runtime,
  event: HookEvent,
): Promise<void> {
  await ensureDir(runtime.appHome);
  await ensureDir(runtime.logDir);

  const release = await acquireLock(runtime.lockPath);
  try {
    const state = await loadState(runtime.statePath);
    const config = await loadConfig(runtime.configPath);
    const now = runtime.now();
    const token = getSlackToken(runtime.env);

    await appendLogLine(runtime.logPath, {
      at: new Date(now).toISOString(),
      event: event.hook_event_name,
      session_id: event.session_id,
    });

    if (event.hook_event_name === "SessionStart") {
      state.activeSessions[event.session_id] = {
        cwd: event.cwd ?? "",
        startedAt: new Date(now).toISOString(),
        lastEventAt: new Date(now).toISOString(),
      };
      await updateSlackForSession(runtime, state, config, token, true);
    } else if (event.hook_event_name === "Stop") {
      const session = state.activeSessions[event.session_id];
      if (session) {
        session.lastEventAt = new Date(now).toISOString();
      }
      const shouldProbe =
        !state.lastQuotaProbeAt ||
        now - Date.parse(state.lastQuotaProbeAt) >= config.probeIntervalMs;
      await updateSlackForSession(
        runtime,
        state,
        config,
        token,
        shouldProbe,
      );
    } else if (event.hook_event_name === "StopFailure") {
      if (event.error === "rate_limit" && state.activeSessions[event.session_id]) {
        await ensureBaseline(runtime, state, token);
        const rlProfile: SlackProfile = {
          status_text: "Claude rate-limited",
          status_emoji: ":no_entry:",
          status_expiration: computeExpiration(now, config.statusLeaseSeconds),
        };
        await writeSlackProfile(runtime, state, config, token, rlProfile);
      }
    } else if (event.hook_event_name === "SessionEnd") {
      delete state.activeSessions[event.session_id];
      if (Object.keys(state.activeSessions).length === 0) {
        await restoreBaseline(runtime, state, token);
      }
    }

    await saveState(runtime.statePath, state);
  } catch (error: unknown) {
    const state = await loadState(runtime.statePath);
    setLastError(
      state,
      error as Error & { code?: string; details?: unknown },
      runtime.now(),
    );
    await saveState(runtime.statePath, state);
    await appendLogLine(runtime.logPath, {
      at: new Date(runtime.now()).toISOString(),
      kind: "hook_error",
      error: (error as Error).message,
    });
  } finally {
    await release();
  }
}

async function updateSlackForSession(
  runtime: Runtime,
  state: AppState,
  config: AppConfig,
  token: string | null,
  forceProbe: boolean,
): Promise<void> {
  if (
    !token ||
    state.disabledReason ||
    Object.keys(state.activeSessions).length === 0
  )
    return;

  await ensureBaseline(runtime, state, token);
  const stored = await probeQuota(runtime, state, forceProbe);
  if (!stored) return;

  const snapshot = toQuotaSnapshot(stored, runtime.now());
  let formatFn: FormatStatusFn;
  try {
    formatFn = await loadFormatFn(runtime.formatPath);
  } catch {
    formatFn = fallbackFormat;
  }

  const { statusText, statusEmoji } = formatFn(snapshot);
  const desiredProfile: SlackProfile = {
    status_text: statusText.slice(0, 100),
    status_emoji: statusEmoji,
    status_expiration: computeExpiration(runtime.now(), config.statusLeaseSeconds),
  };

  await writeSlackProfile(runtime, state, config, token, desiredProfile);
}

async function ensureBaseline(
  runtime: Runtime,
  state: AppState,
  token: string | null,
): Promise<void> {
  if (!token) return;
  if (Object.keys(state.activeSessions).length !== 1) return;

  const currentProfile = await getSlackProfile(runtime, token);
  if (
    state.savedBaselineProfile &&
    state.lastSlackSuccessPayload &&
    profilesEqual(currentProfile, state.lastSlackSuccessPayload)
  ) {
    return;
  }

  state.savedBaselineProfile = currentProfile;
  state.ownershipLost = false;
}

async function probeQuota(
  runtime: Runtime,
  state: AppState,
  forceProbe: boolean,
): Promise<StoredQuotaSnapshot | null> {
  if (!forceProbe && state.lastQuotaSnapshot) return state.lastQuotaSnapshot;

  try {
    const snapshot = await probeClaudeUsage(runtime);
    state.lastQuotaSnapshot = snapshot;
    state.lastQuotaProbeAt = snapshot.capturedAt;
    return snapshot;
  } catch (error: unknown) {
    setLastError(
      state,
      error as Error & { code?: string; details?: unknown },
      runtime.now(),
    );
    return state.lastQuotaSnapshot;
  }
}

async function writeSlackProfile(
  runtime: Runtime,
  state: AppState,
  config: AppConfig,
  token: string | null,
  desiredProfile: SlackProfile,
): Promise<void> {
  if (!token || state.disabledReason) return;

  const now = runtime.now();
  state.lastSlackDesiredPayload = desiredProfile;

  if (state.circuitOpenUntil && now < Date.parse(state.circuitOpenUntil))
    return;
  if (
    shouldThrottleSlackWrite(state, desiredProfile, now, config.throttleIntervalMs)
  )
    return;

  state.lastSlackAttempt = desiredProfile;
  state.lastSlackAttemptAt = new Date(now).toISOString();

  try {
    const written = await setSlackProfile(runtime, token, desiredProfile);
    state.lastSlackSuccessPayload = written;
    state.lastSlackSuccessAt = new Date(now).toISOString();
    state.lastError = null;
    state.circuitOpenUntil = null;
    state.consecutiveSlackFailures = 0;
  } catch (error: unknown) {
    const err = error as Error & {
      code?: string;
      retryAfterMs?: number;
    };
    state.consecutiveSlackFailures++;
    setLastError(state, err, now);
    if (err.code && isHardSlackError(err.code)) {
      state.disabledReason = err.code;
    } else if (err.code === "slack_rate_limited") {
      state.circuitOpenUntil = new Date(
        now + (err.retryAfterMs ?? 60_000),
      ).toISOString();
    } else if (err.code === "slack_server_error") {
      state.circuitOpenUntil = new Date(
        now +
          Math.min(300_000, state.consecutiveSlackFailures * 30_000),
      ).toISOString();
    }
  }
}

async function restoreBaseline(
  runtime: Runtime,
  state: AppState,
  token: string | null,
): Promise<void> {
  if (!token || !state.savedBaselineProfile || state.ownershipLost) return;

  try {
    // If we never successfully wrote a status, just restore baseline directly
    if (state.lastSlackSuccessPayload) {
      const current = await getSlackProfile(runtime, token);
      if (!profilesEqual(current, state.lastSlackSuccessPayload)) {
        state.ownershipLost = true;
        return;
      }
    }
    await setSlackProfile(runtime, token, state.savedBaselineProfile);
    state.savedBaselineProfile = null;
    state.ownershipLost = false;
  } catch (error: unknown) {
    setLastError(
      state,
      error as Error & { code?: string; details?: unknown },
      runtime.now(),
    );
  }
}

// --- CLI entry point ---

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "hook";

  if (command === "--validate") {
    const runtime = createRuntime();
    const formatFn = await loadFormatFn(runtime.formatPath);
    const sample: QuotaSnapshot = {
      fiveHour: {
        percentLeft: 42,
        percentUsed: 58,
        resetAt: new Date(),
        resetIn: 7200000,
      },
      sevenDay: {
        percentLeft: 78,
        percentUsed: 22,
        resetAt: new Date(),
        resetIn: 172800000,
      },
      capturedAt: new Date(),
    };
    const result = formatFn(sample);
    if (
      typeof result.statusText !== "string" ||
      typeof result.statusEmoji !== "string"
    ) {
      throw new Error(
        "formatStatus must return {statusText: string, statusEmoji: string}",
      );
    }
    process.stdout.write(JSON.stringify({ ok: true, preview: result }) + "\n");
    return;
  }

  if (command === "hook") {
    const input = await readStdin();
    const event = JSON.parse(input) as HookEvent;
    if (!event.hook_event_name || !event.session_id) {
      throw new Error("Hook input missing hook_event_name or session_id");
    }
    const runtime = createRuntime();
    await handleHookEvent(runtime, event);
    return;
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  process.exitCode = 1;
}

// Only run main() when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1]?.endsWith("/hook.mjs") ||
  process.argv[1]?.endsWith("/hook.js");
if (isDirectRun) {
  main().catch((error: Error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
