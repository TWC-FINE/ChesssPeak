import { availableParallelism } from 'node:os';
import { basename } from 'node:path';
import { loadEnv } from './env.js';
import { createMonitor, readRss } from './monitor.js';
import { PoolError, WorkerPool } from './pool.js';
import { CHESS_PROMPT } from './prompt.js';
import { agentConfigFromEnv, BackendError, createAgent, type Backend } from './server.js';
import { strategyFromName } from './strategies.js';
import { launchWhisperWorker, probeHealth, transcribeWith } from './whisper-process.js';

// Gateway on 127.0.0.1:8765 in front of a pool of whisper-server processes (LB_WORKERS, ports from LB_BASE_PORT).
// The product always uses the small model with the chess prompt (ADR 5); WHISPER_PROMPT only overrides the text.

const env = { ...loadEnv(), ...pick(process.env, /^LB_/) };
const config = agentConfigFromEnv(env);
const modelPath = env.WHISPER_MODEL_SMALL;
if (!env.WHISPER_SERVER_PATH || !modelPath) {
  console.error('Faltan WHISPER_SERVER_PATH o WHISPER_MODEL_SMALL en .env. Ejecuta: pnpm --filter @chessspeak/spike-whisper-local download');
  process.exit(1);
}
const serverPath = env.WHISPER_SERVER_PATH;
const language = env.WHISPER_LANGUAGE || 'es';
const size = integer(env.LB_WORKERS, 1);
// by default the cores are split between the workers, so 1 worker and N workers use the same CPU
const threads = integer(env.LB_THREADS_PER_WORKER, Math.max(1, Math.floor(availableParallelism() / size)));

const pool = new WorkerPool({
  size,
  basePort: integer(env.LB_BASE_PORT, 8801),
  strategy: strategyFromName(env.LB_STRATEGY),
  queueMax: integer(env.LB_QUEUE_MAX, size * 4),
  timeoutMs: integer(env.LB_TIMEOUT_MS, 15_000),
  launch: (port) =>
    launchWhisperWorker({ serverPath, modelPath, language, prompt: env.WHISPER_PROMPT || CHESS_PROMPT, port, threads }),
  probe: (url) => probeHealth(url),
  send: (url, wav) => transcribeWith(url, wav),
});

const monitor = createMonitor(pool, { readMemory: (pids) => readRss(pids, basename(serverPath)) });

const server = createAgent(config, {
  info: () => ({ recognizer: 'whisper', model: 'small', language, threadsPerWorker: threads, pool: pool.stats() }),
  transcribe: async (wav) => {
    try {
      return await pool.transcribe(wav);
    } catch (error) {
      if (error instanceof PoolError) {
        const headers: Record<string, string> = error.retryAfterSeconds === undefined ? {} : { 'retry-after': String(error.retryAfterSeconds) };
        throw new BackendError(error.status, error.message, headers);
      }
      throw error;
    }
  },
} satisfies Backend, monitor.routes);

pool.installShutdownHooks(() => {
  monitor.close();
  server.close();
});

// take the gateway port first: if it is busy there is no point in loading N models
server.once('error', (error: NodeJS.ErrnoException) => {
  const hint = error.code === 'EADDRINUSE' ? ' (¿otro agente encendido?)' : '';
  console.error(`No pude escuchar en ${config.host}:${config.port}: ${error.message}${hint}`);
  process.exit(1);
});
await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));

console.log(`Arrancando ${size} worker(s) de whisper-server con ${threads} hilo(s) cada uno...`);
try {
  await pool.start();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const workers = pool.stats().workers.map((w) => `${w.id}:${w.port}(${w.state}, pid ${w.pid ?? '-'})`);
console.log(`Agente local en http://${config.host}:${config.port} · estrategia ${pool.strategyName}`);
console.log(`Workers: ${workers.join(' ')}`);
console.log(`Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
console.log(`Dashboard: http://${config.host}:${config.port}/lb/dashboard`);

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value === undefined || value === '' || !Number.isInteger(parsed) ? fallback : parsed;
}

/** loadEnv only lets the environment override keys present in .env; the LB_* knobs are read from the environment too. */
function pick(source: NodeJS.ProcessEnv, pattern: RegExp): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => pattern.test(entry[0]) && entry[1] !== undefined));
}
