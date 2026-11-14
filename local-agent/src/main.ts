import { availableParallelism } from 'node:os';
import { basename } from 'node:path';
import { loadEnv } from './env.js';
import { createMonitor, readRss } from './monitor.js';
import { PoolError, WorkerPool, type PoolOptions } from './pool.js';
import { CHESS_PROMPT } from './prompt.js';
import { agentConfigFromEnv, BackendError, createAgent, type Backend } from './server.js';
import { strategyFromName } from './strategies.js';
import { connectUrlWorker, isLoopback, parseWorkerUrls } from './url-worker.js';
import { launchWhisperWorker, probeHealth, transcribeWith } from './whisper-process.js';

// Gateway on 127.0.0.1:8765 in front of a pool of whisper-server workers. Two modes:
// - processes (ADR 10): the agent starts LB_WORKERS whisper-server processes, ports from LB_BASE_PORT;
// - URLs: with WHISPER_URLS set, it connects to whisper-server instances already running (local containers,
//   or a tunnel to a cloud instance) and owns no process. Without it, nothing changes.
// The product always uses the small model with the chess prompt (ADR 5); WHISPER_PROMPT only overrides the text.

const env = { ...loadEnv(), ...pick(process.env, /^(LB_|WHISPER_URLS$)/) };
const config = agentConfigFromEnv(env);
const language = env.WHISPER_LANGUAGE || 'es';

let urls: string[] | undefined;
try {
  urls = env.WHISPER_URLS ? parseWorkerUrls(env.WHISPER_URLS) : undefined;
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const common = {
  strategy: strategyFromName(env.LB_STRATEGY),
  timeoutMs: integer(env.LB_TIMEOUT_MS, 15_000),
  healthIntervalMs: integer(env.LB_PROBE_INTERVAL_MS, 1000),
  probe: (url: string) => probeHealth(url, isLoopback(url) ? 800 : 5000),
};

let options: PoolOptions;
let threads: number | undefined;
let serverPath: string | undefined;
if (urls !== undefined) {
  const timeoutMs = common.timeoutMs;
  options = {
    ...common,
    size: urls.length,
    urls,
    queueMax: integer(env.LB_QUEUE_MAX, urls.length * 4),
    reconnectMax: integer(env.LB_RECONNECT_MAX, 10),
    connect: (url) => connectUrlWorker(url, { probe: common.probe, readyTimeoutMs: integer(env.LB_CONNECT_TIMEOUT_MS, 60_000) }),
    // twice the gateway timeout: the client already got its 504, this only frees the slot of a worker that hangs
    send: (url, wav) => transcribeWith(url, wav, '/inference', AbortSignal.timeout(timeoutMs * 2)),
  };
} else {
  const modelPath = env.WHISPER_MODEL_SMALL;
  if (!env.WHISPER_SERVER_PATH || !modelPath) {
    console.error('Faltan WHISPER_SERVER_PATH o WHISPER_MODEL_SMALL en .env. Ejecuta: pnpm --filter @chessspeak/spike-whisper-local download');
    console.error('O bien usa contenedores: WHISPER_URLS=http://127.0.0.1:18101,... (ver whisper-cloud/compose.local.yml)');
    process.exit(1);
  }
  serverPath = env.WHISPER_SERVER_PATH;
  const size = integer(env.LB_WORKERS, 1);
  // by default the cores are split between the workers, so 1 worker and N workers use the same CPU
  const workerThreads = integer(env.LB_THREADS_PER_WORKER, Math.max(1, Math.floor(availableParallelism() / size)));
  threads = workerThreads;
  const binary = serverPath;
  options = {
    ...common,
    size,
    basePort: integer(env.LB_BASE_PORT, 8801),
    queueMax: integer(env.LB_QUEUE_MAX, size * 4),
    launch: (port) =>
      launchWhisperWorker({ serverPath: binary, modelPath, language, prompt: env.WHISPER_PROMPT || CHESS_PROMPT, port, threads: workerThreads }),
    send: (url, wav) => transcribeWith(url, wav),
  };
}

const pool = new WorkerPool(options);
const imageName = serverPath === undefined ? undefined : basename(serverPath);
const monitor = createMonitor(pool, {
  // URL mode has no PIDs, so there is no memory to read
  readMemory: imageName === undefined ? async () => new Map() : (pids) => readRss(pids, imageName),
});

const server = createAgent(config, {
  info: () => ({
    recognizer: 'whisper',
    model: 'small',
    language,
    mode: urls === undefined ? 'process' : 'url',
    ...(threads === undefined ? {} : { threadsPerWorker: threads }),
    pool: pool.stats(),
  }),
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

console.log(
  urls === undefined
    ? `Arrancando ${options.size} worker(s) de whisper-server con ${threads} hilo(s) cada uno...`
    : `Conectando con ${urls.length} worker(s) por URL: ${urls.join(', ')}...`,
);
try {
  await pool.start();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

const workers = pool
  .stats()
  .workers.map((w) => (urls === undefined ? `${w.id}:${w.port}(${w.state}, pid ${w.pid ?? '-'})` : `${w.id}:${w.url}(${w.state}, sondeo cada ${w.probeIntervalMs / 1000} s)`));
console.log(`Agente local en http://${config.host}:${config.port} · modo ${urls === undefined ? 'procesos' : 'URLs'} · estrategia ${pool.strategyName}`);
console.log(`Workers: ${workers.join(' ')}`);
console.log(`Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
console.log(`Dashboard: http://${config.host}:${config.port}/lb/dashboard`);

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value === undefined || value === '' || !Number.isInteger(parsed) ? fallback : parsed;
}

/** loadEnv only lets the environment override keys present in .env; LB_* and WHISPER_URLS are read from the environment too. */
function pick(source: NodeJS.ProcessEnv, pattern: RegExp): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => pattern.test(entry[0]) && entry[1] !== undefined));
}
