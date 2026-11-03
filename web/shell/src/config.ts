export interface ShellConfig {
  PUBLIC_API_URL: string;
  PUBLIC_AGENT_URL: string;
  PUBLIC_MF_TIMEOUT_MS: string;
}

/** Public settings generated into config.js by the web build (no secrets). */
export function readConfig(source: unknown = (globalThis as { CS_CONFIG?: unknown }).CS_CONFIG): ShellConfig {
  const given = (typeof source === 'object' && source !== null ? source : {}) as Partial<ShellConfig>;
  return {
    PUBLIC_API_URL: given.PUBLIC_API_URL ?? '',
    PUBLIC_AGENT_URL: given.PUBLIC_AGENT_URL ?? '',
    PUBLIC_MF_TIMEOUT_MS: given.PUBLIC_MF_TIMEOUT_MS ?? '5000',
  };
}

export function timeoutMs(config: ShellConfig): number {
  const value = Number(config.PUBLIC_MF_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}
