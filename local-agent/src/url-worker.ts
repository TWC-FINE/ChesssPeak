import type { WorkerHandle } from './pool.js';

// URL mode (WHISPER_URLS): the workers are whisper-server instances already running elsewhere, such as local
// containers or a tunnel to a cloud instance. "Launching" one means waiting until its /health answers; there is
// no process to own, so there is nothing to kill either.

/** Probes and reconnections to anything that is not this machine never run more often than this. */
export const REMOTE_MIN_INTERVAL_MS = 15_000;

/** True for localhost, 127.0.0.0/8 and ::1. A tunnel to a remote machine also counts as loopback. */
export function isLoopback(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** The configured interval for loopback URLs; at least REMOTE_MIN_INTERVAL_MS for any other. */
export function intervalFor(url: string, configuredMs: number): number {
  return isLoopback(url) ? configuredMs : Math.max(configuredMs, REMOTE_MIN_INTERVAL_MS);
}

/**
 * Parses WHISPER_URLS: comma-separated base URLs, one per worker. Plain http only on loopback; anything that
 * leaves the machine must be https. No credentials, paths, queries or duplicates.
 */
export function parseWorkerUrls(value: string): string[] {
  const urls = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      let url: URL;
      try {
        url = new URL(item);
      } catch {
        throw new Error(`WHISPER_URLS: «${item}» no es una URL válida`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`WHISPER_URLS: «${item}» debe empezar por http:// o https://`);
      if (url.username !== '' || url.password !== '') throw new Error(`WHISPER_URLS: «${item}» no puede llevar usuario ni contraseña`);
      if (url.pathname !== '/' || url.search !== '' || url.hash !== '') throw new Error(`WHISPER_URLS: «${item}» debe ser solo esquema, host y puerto`);
      if (url.protocol === 'http:' && !isLoopback(url.href)) throw new Error(`WHISPER_URLS: «${item}» sale del equipo y debe usar https://`);
      return url.origin;
    });
  if (urls.length === 0) throw new Error('WHISPER_URLS está vacía');
  const repeated = urls.find((url, i) => urls.indexOf(url) !== i);
  if (repeated !== undefined) throw new Error(`WHISPER_URLS: «${repeated}» está repetida`);
  return urls;
}

/** The port shown for a worker URL: the explicit one, or the scheme's default. */
export function portOf(url: string): number {
  const parsed = new URL(url);
  return parsed.port === '' ? (parsed.protocol === 'https:' ? 443 : 80) : Number(parsed.port);
}

export interface ConnectOptions {
  probe(url: string): Promise<boolean>;
  /** Gives up after this long without a healthy answer. */
  readyTimeoutMs?: number;
  /** Between probes while waiting; raised to REMOTE_MIN_INTERVAL_MS for non-loopback URLs. */
  intervalMs?: number;
}

/** Waits until <url>/health answers, with a deadline, and returns a handle with no process behind it. */
export async function connectUrlWorker(url: string, options: ConnectOptions): Promise<WorkerHandle> {
  const deadline = Date.now() + (options.readyTimeoutMs ?? 60_000);
  const interval = intervalFor(url, options.intervalMs ?? 500);
  while (!(await options.probe(url))) {
    if (Date.now() + interval > deadline) throw new Error(`${url} no respondió a /health en ${Math.round((options.readyTimeoutMs ?? 60_000) / 1000)} s`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return {
    url,
    pid: undefined,
    // nothing exits: a worker that goes away is found by the health probes or by a failed request
    exited: new Promise<void>(() => undefined),
    stop: async () => undefined,
    killNow: () => undefined,
  };
}
