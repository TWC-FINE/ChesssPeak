import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, availableParallelism, cpus, freemem, platform, release, totalmem } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { repoRoot } from '../src/env.js';
import { runLoad, type StepResult } from '../src/load.js';

const USAGE = `Uso: pnpm --filter @chessspeak/local-agent load [opciones]

  --url <url>            Endpoint a atacar (por defecto http://127.0.0.1:8765/transcribe)
  --wav <archivo>        WAV que se envía en cada petición (por defecto spike/recordings/p05-01_quiet_r1_runB.wav)
  --steps <lista>        Concurrencia de cada escalón (por defecto 1,2,4,8,16)
  --requests <n>         Peticiones por escalón (por defecto 20; nunca menos que la concurrencia del escalón)
  --max-error-rate <x>   Proporción de respuestas distintas de 200 que marca el punto de quiebre (por defecto 0.05)
  --timeout <ms>         Límite por petición en el cliente (por defecto 60000)
  --warmup <n>           Peticiones de calentamiento que no cuentan (por defecto: una por worker)
  --label <texto>        Etiqueta de la corrida, por ejemplo monolito o balanceado
  --out-dir <carpeta>    Dónde guardar el JSON (por defecto local-agent/results)`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const root = repoRoot();
const resolvePath = (path: string): string => (isAbsolute(path) ? path : resolve(invokedFrom, path));
/** Repo-relative path with forward slashes, the same on every OS. */
const fromRoot = (path: string): string => relative(root, path).split(sep).join('/');

const args = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--help' || arg === '-h') fail(USAGE);
  if (!arg.startsWith('--')) fail(USAGE);
  const value = args[++i];
  if (value === undefined) fail(`${arg} necesita un valor\n\n${USAGE}`);
  flags.set(arg, value);
}
const known = new Set(['--url', '--wav', '--steps', '--requests', '--max-error-rate', '--timeout', '--warmup', '--label', '--out-dir']);
for (const flag of flags.keys()) if (!known.has(flag)) fail(`Opción desconocida: ${flag}\n\n${USAGE}`);
const num = (flag: string, fallback: number, check: (n: number) => boolean = (n) => n >= 0): number => {
  const raw = flags.get(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !check(value)) fail(`${flag}: valor no válido «${raw}»`);
  return value;
};

const url = flags.get('--url') ?? 'http://127.0.0.1:8765/transcribe';
const wavPath = flags.has('--wav') ? resolvePath(flags.get('--wav')!) : join(root, 'spike/recordings/p05-01_quiet_r1_runB.wav');
if (!existsSync(wavPath)) fail(`No existe el WAV ${wavPath}. Los WAV del spike no están en git: pasa otro con --wav.`);
const steps = (flags.get('--steps') ?? '1,2,4,8,16').split(',').map((s) => Number(s.trim()));
if (steps.length === 0 || steps.some((n) => !Number.isInteger(n) || n < 1)) fail('--steps: enteros ≥ 1 separados por comas, por ejemplo 1,2,4,8');
const requestsPerStep = num('--requests', 20, (n) => Number.isInteger(n) && n >= 1);
const maxErrorRate = num('--max-error-rate', 0.05, (n) => n >= 0 && n <= 1);
const requestTimeoutMs = num('--timeout', 60_000, (n) => n > 0);
const label = flags.get('--label') ?? null;
const outDir = flags.has('--out-dir') ? resolvePath(flags.get('--out-dir')!) : join(root, 'local-agent/results');

const statsUrl = new URL('/lb/stats', url).toString();
const healthUrl = new URL('/health', url).toString();

async function getJson(target: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(3000) });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface PoolSnapshot {
  strategy: string;
  queued: number;
  queueMax: number;
  timeoutMs: number;
  workerConcurrency: number;
  totals: Record<string, number>;
  workers: Array<{ id: string; state: string; active: number; restarts: number }>;
}

const stats = async (): Promise<PoolSnapshot | null> => (await getJson(statsUrl)) as PoolSnapshot | null;

/** Waits until the agent has no queued or in-flight requests (up to 60 s), so one step does not spill into the next. */
async function waitIdle(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const snapshot = await stats();
    if (snapshot === null) {
      await new Promise((r) => setTimeout(r, 2000));
      return;
    }
    if (snapshot.queued === 0 && snapshot.workers.every((w) => w.active === 0)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn('Aviso: el agente no quedó libre en 60 s; el siguiente escalón empieza igualmente.');
}

const health = await getJson(healthUrl);
if (health === null) fail(`El agente no responde en ${healthUrl}. Arráncalo con: pnpm --filter @chessspeak/local-agent start`);
const before = await stats();
const workerCount = before?.workers.length ?? 1;
const warmup = num('--warmup', workerCount, (n) => Number.isInteger(n) && n >= 0);
const wav = new Uint8Array(readFileSync(wavPath));

const cpu = cpus()[0];
const environment = {
  platform: platform(),
  release: release(),
  arch: arch(),
  cpu: cpu?.model.trim() ?? 'desconocida',
  logicalCores: availableParallelism(),
  totalMemoryMB: Math.round(totalmem() / 1048576),
  freeMemoryMBAtStart: Math.round(freemem() / 1048576),
  node: process.version,
};
const agent = {
  url,
  strategy: before?.strategy ?? null,
  workers: workerCount,
  threadsPerWorker: (health.threadsPerWorker as number | undefined) ?? null,
  workerConcurrency: before?.workerConcurrency ?? null,
  queueMax: before?.queueMax ?? null,
  timeoutMs: before?.timeoutMs ?? null,
  model: (health.model as string | undefined) ?? null,
};

console.log(`Carga contra ${url}${label === null ? '' : ` · ${label}`}`);
console.log(`Agente: ${agent.workers} worker(s), ${agent.threadsPerWorker ?? '?'} hilo(s) cada uno, estrategia ${agent.strategy ?? '?'}`);
console.log(`Equipo: ${environment.cpu}, ${environment.logicalCores} hilos, ${environment.totalMemoryMB} MB de RAM`);
console.log(`WAV: ${fromRoot(wavPath)} (${wav.length} bytes) · ${requestsPerStep} peticiones por escalón · quiebre si error > ${maxErrorRate * 100} %`);
if (warmup > 0) console.log(`Calentamiento: ${warmup} petición(es) que no cuentan…`);
console.log('');
console.log('conc   rps  ok/s   p50 ms   p95 ms    200  503  504 otro  red  error  reparto');

const pad = (value: unknown, width: number): string => String(value ?? '—').padStart(width);
const startedAt = new Date();
const report = await runLoad({
  url,
  wav,
  steps,
  requestsPerStep,
  maxErrorRate,
  requestTimeoutMs,
  warmup,
  waitIdle,
  onStep: (step: StepResult) => {
    const share = Object.entries(step.workers)
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([id, n]) => `${id}:${n}`)
      .join(' ');
    console.log(
      [
        pad(step.concurrency, 4),
        pad(step.rps, 5),
        pad(step.okRps, 5),
        pad(step.latencyMs.p50, 8),
        pad(step.latencyMs.p95, 8),
        pad(step.counts['200'], 6),
        pad(step.counts['503'], 4),
        pad(step.counts['504'], 4),
        pad(step.counts.other, 4),
        pad(step.counts.error, 4),
        pad(`${(step.errorRate * 100).toFixed(1)} %`, 6),
        ` ${share}${step.broken ? '  ← CAÍDO' : ''}`,
      ].join(' '),
    );
  },
});
const after = await stats();

const finishedAt = new Date();
mkdirSync(outDir, { recursive: true });
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const file = join(outDir, `load-${stamp}${label === null ? '' : `-${label.replace(/[^\w-]+/g, '_')}`}.json`);
writeFileSync(
  file,
  `${JSON.stringify(
    {
      label,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      environment,
      agent,
      config: { wav: fromRoot(wavPath), wavBytes: wav.length, steps, requestsPerStep, maxErrorRate, requestTimeoutMs, warmup },
      result: { breakingPoint: report.breakingPoint, maxStableConcurrency: report.maxStableConcurrency },
      steps: report.steps,
      // the agent's own counters around the run (includes the warm-up), to cross-check the client figures
      agentTotals: { before: before?.totals ?? null, after: after?.totals ?? null },
      workerRestarts: after?.workers.map((w) => ({ id: w.id, restarts: w.restarts })) ?? null,
    },
    null,
    2,
  )}\n`,
);

console.log('');
console.log(
  report.breakingPoint === null
    ? `Aguantó todos los escalones (máximo estable: ${report.maxStableConcurrency} simultáneas).`
    : `Punto de quiebre: ${report.breakingPoint} simultáneas · máximo estable: ${report.maxStableConcurrency ?? 'ninguno'}.`,
);
console.log(`Reporte: ${relative(invokedFrom, file)}`);
