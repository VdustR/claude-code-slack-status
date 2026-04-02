import type { AppConfig } from "./types.js";
import { readJson, writeJsonAtomic } from "./utils.js";

export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    probeIntervalMs: 60_000,
    throttleIntervalMs: 30_000,
    statusLeaseSeconds: 900,
  };
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const raw = await readJson<Partial<AppConfig>>(configPath, {});
  return { ...createDefaultConfig(), ...raw };
}

export async function saveConfig(configPath: string, config: AppConfig): Promise<void> {
  await writeJsonAtomic(configPath, config);
}
