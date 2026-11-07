type Env = Record<string, string | undefined>;

const LOCAL_ORIGINS = ['http://127.0.0.1:5500', 'http://localhost:5500'];
const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 1000;
const DEFAULT_GUEST_AUTH_LIMIT = 10;
const DEFAULT_ABANDON_TIMEOUT_MS = 60_000;

/** Origins allowed by CORS. A browser sends the origin without a trailing slash, so one pasted with it would never match. */
export function corsOrigins(env: Env = process.env): string[] {
  const origins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : LOCAL_ORIGINS;
}

/**
 * How long a database connection may take. Short by default so that a local database that is down is reported fast;
 * a managed one needs more (Neon wakes up on demand, Atlas adds DNS and TLS).
 */
export function dbConnectTimeoutMs(env: Env = process.env): number {
  const value = Number(env.DB_CONNECT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CONNECT_TIMEOUT_MS;
}

/** How long GET /health waits for each database before reporting it as down. A managed one that is waking up needs more than the default. */
export function healthProbeTimeoutMs(env: Env = process.env): number {
  const value = Number(env.HEALTH_PROBE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_HEALTH_PROBE_TIMEOUT_MS;
}

/** Requests per minute per IP allowed on POST /auth/guest. Anything but a whole number above 0 keeps the default. */
export function guestAuthLimitPerMinute(env: Env = process.env): number {
  const value = Number(env.GUEST_AUTH_LIMIT_PER_MINUTE);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_GUEST_AUTH_LIMIT;
}

/** How long a player may stay disconnected from an active game before losing by abandonment (docs/protocol.md §7). */
export function abandonTimeoutMs(env: Env = process.env): number {
  const value = Number(env.ABANDON_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_ABANDON_TIMEOUT_MS;
}
