export interface QuotaWindow {
  percentLeft: number;
  percentUsed: number;
  resetAt: Date;
  resetIn: number; // ms until reset
}

export interface QuotaSnapshot {
  fiveHour: QuotaWindow;
  sevenDay: QuotaWindow;
  capturedAt: Date;
}

export interface StoredQuotaWindow {
  percentLeft: number;
  percentUsed: number;
  resetAt: string; // ISO
}

export interface StoredQuotaSnapshot {
  fiveHour: StoredQuotaWindow;
  sevenDay: StoredQuotaWindow;
  capturedAt: string; // ISO
}

export interface FormatResult {
  statusText: string;
  statusEmoji: string;
}

export type FormatStatusFn = (snapshot: QuotaSnapshot) => FormatResult;

export interface SlackProfile {
  status_text: string;
  status_emoji: string;
  status_expiration: number;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  subscriptionType: string | null;
}

export interface ClaudeCredentials {
  source: "file" | "keychain";
  filePath?: string;
  service?: string;
  account?: string;
  rawJson: Record<string, unknown>;
  oauth: OAuthCredentials;
}

export interface SessionInfo {
  cwd: string;
  startedAt: string; // ISO
  lastEventAt: string; // ISO
}

export interface AppState {
  version: number;
  activeSessions: Record<string, SessionInfo>;
  lastQuotaSnapshot: StoredQuotaSnapshot | null;
  lastQuotaProbeAt: string | null; // ISO
  lastSlackDesiredPayload: SlackProfile | null;
  lastSlackSuccessPayload: SlackProfile | null;
  lastSlackSuccessAt: string | null;
  lastSlackAttempt: SlackProfile | null;
  lastSlackAttemptAt: string | null;
  savedBaselineProfile: SlackProfile | null;
  ownershipLost: boolean;
  disabledReason: string | null;
  teamId: string | null;
  userId: string | null;
  lastError: ErrorRecord | null;
  circuitOpenUntil: string | null; // ISO
  consecutiveSlackFailures: number;
}

export interface ErrorRecord {
  at: string;
  message: string;
  code: string | null;
  details: unknown;
}

export interface AppConfig {
  version: number;
  probeIntervalMs: number;
  throttleIntervalMs: number;
  statusLeaseSeconds: number;
}

export interface HookEvent {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  error?: string;
  error_details?: unknown;
}

export interface Runtime {
  env: NodeJS.ProcessEnv;
  homeDir: string;
  appHome: string;
  settingsPath: string;
  statePath: string;
  configPath: string;
  lockPath: string;
  logDir: string;
  logPath: string;
  formatPath: string;
  fetchImpl: typeof globalThis.fetch;
  execFile: (
    file: string,
    args: string[],
  ) => Promise<{ stdout: string; stderr: string }>;
  now: () => number;
}
