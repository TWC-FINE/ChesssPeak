type Env = Record<string, string | undefined>;

const LOCAL_ORIGINS = ['http://127.0.0.1:5500', 'http://localhost:5500'];
const DEFAULT_CONNECT_TIMEOUT_MS = 1000;

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
