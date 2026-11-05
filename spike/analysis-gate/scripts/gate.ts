import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { arch, cpus, freemem, platform, release, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decide, DIFFERENCE_CP, median, percentile, type ConfigId, type Runs, type RunSummary } from '../src/decision.js';
import { Engine, type EngineResult } from '../src/engine.js';
import { positionsFromPgn, type GamePosition } from '../src/positions.js';
import { parseTasklist } from '../src/uci.js';

// Runs the protocol of docs/analysis-criteria.md. Each section number below refers to that document.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const fixtures = join(here, '../fixtures');
const resultsDir = join(here, '../results');
const calibrationFile = join(resultsDir, 'calibration.json');

interface Config {
  id: ConfigId;
  processes: number;
  threads: number;
  hashMb: number;
}

// section 3
const CONFIGS: Record<ConfigId, Config> = {
  C0: { id: 'C0', processes: 1, threads: 12, hashMb: 768 },
  C1: { id: 'C1', processes: 3, threads: 4, hashMb: 256 },
  C2: { id: 'C2', processes: 6, threads: 2, hashMb: 128 },
};
// section 6
const ORDER: ConfigId[][] = [
  ['C0', 'C1', 'C2'],
  ['C1', 'C2', 'C0'],
  ['C2', 'C0', 'C1'],
];
const PAUSE_MS = 10_000;
// section 5
const START_DEPTH = 14;
const DEPTH_STEP = 2;
const MIN_CALIBRATION_MS = 60_000;
const MAX_DEPTH = 40;

interface PositionResult extends GamePosition, EngineResult {
  engine: number;
  ms: number;
}

interface RunFile extends RunSummary {
  config: Config;
  rep: number;
  depth: number;
  startedAt: string;
  positionP50Ms: number;
  positionP95Ms: number;
  rssBytes: Array<number | null>;
  environment: ReturnType<typeof environment>;
  positions: PositionResult[];
}

function stockfishPath(): string {
  const dir = join(root, 'stockfish/sf_19');
  const walk = (current: string): string[] =>
    readdirSync(current).flatMap((name) => {
      const path = join(current, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  if (!existsSync(dir)) throw new Error('Falta Stockfish: pnpm --filter @chessspeak/spike-analysis-gate download');
  const binaries = walk(dir).filter((path) => /stockfish[^/\\]*\.exe$/i.test(path));
  if (binaries.length !== 1) throw new Error(`Esperaba un solo ejecutable de Stockfish y encontré: ${binaries.join(', ') || 'ninguno'}`);
  return binaries[0]!;
}

function environment() {
  return {
    cpu: cpus()[0]?.model ?? 'desconocida',
    logicalCores: cpus().length,
    totalRamMb: Math.round(totalmem() / 2 ** 20),
    freeRamMb: Math.round(freemem() / 2 ** 20),
    os: `${platform()} ${release()} ${arch()}`,
    node: process.version,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readRss(path: string, pids: Array<number | undefined>): Array<number | null> {
  try {
    const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH', '/FI', `IMAGENAME eq ${basename(path)}`], { encoding: 'utf8', windowsHide: true });
    const rss = parseTasklist(output);
    return pids.map((pid) => (pid === undefined ? null : (rss.get(pid) ?? null)));
  } catch {
    return pids.map(() => null);
  }
}

/** Section 6: fresh processes, a shared queue in ply order, startup not counted. */
async function runBatch(path: string, config: Config, positions: GamePosition[], depth: number) {
  const engines = Array.from({ length: config.processes }, () => new Engine(path));
  try {
    await Promise.all(engines.map((engine) => engine.init(config.threads, config.hashMb)));
    const results: PositionResult[] = new Array(positions.length);
    let next = 0;
    const started = performance.now();
    await Promise.all(
      engines.map(async (engine, index) => {
        for (;;) {
          const position = positions[next];
          if (position === undefined) return;
          const slot = next++;
          const positionStart = performance.now();
          const result = await engine.analyse(position.fen, depth);
          results[slot] = { ...position, ...result, engine: index, ms: performance.now() - positionStart };
        }
      }),
    );
    const totalMs = performance.now() - started;
    return { totalMs, results, rssBytes: readRss(path, engines.map((engine) => engine.pid)) };
  } finally {
    await Promise.all(engines.map((engine) => engine.quit().catch(() => undefined)));
  }
}

function loadGame(file: string): GamePosition[] {
  return positionsFromPgn(readFileSync(join(fixtures, file), 'utf8'));
}

async function idleShare(ms = 3000): Promise<number> {
  const sample = () => cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
  const before = sample();
  await sleep(ms);
  const after = sample();
  return (after.idle - before.idle) / (after.total - before.total);
}

/** Section 6, conditions: reports what could disturb the measurement. Whisper or an engine running stops it outright. */
async function preflight(): Promise<boolean> {
  const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
  const images = new Set(output.split(/\r?\n/).map((line) => /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase()).filter((name) => name !== undefined));
  const blocking = ['whisper-server.exe'].filter((name) => images.has(name));
  const running = [...images].filter((name) => /^stockfish/.test(name!));
  const heavy = ['chrome.exe', 'msedge.exe', 'firefox.exe', 'docker desktop.exe', 'obs64.exe', 'discord.exe', 'teams.exe', 'spotify.exe'].filter((name) => images.has(name));
  const idle = await idleShare();
  console.log(`CPU en reposo: ${(idle * 100).toFixed(1)} %`);
  console.log(`Programas pesados abiertos: ${heavy.join(', ') || 'ninguno detectado'}`);
  if (blocking.length > 0 || running.length > 0) {
    console.error(`No se puede medir con esto en marcha: ${[...blocking, ...running].join(', ')}`);
    return false;
  }
  return true;
}

async function calibrate(): Promise<void> {
  if (existsSync(calibrationFile)) {
    console.log(`La profundidad ya está elegida: ${readFileSync(calibrationFile, 'utf8')}`);
    return;
  }
  if (!(await preflight())) process.exit(1);
  const path = stockfishPath();
  const positions = loadGame('calibration-byrne-fischer-1956.pgn');
  const attempts: Array<{ depth: number; totalMs: number }> = [];
  for (let depth = START_DEPTH; depth <= MAX_DEPTH; depth += DEPTH_STEP) {
    const { totalMs } = await runBatch(path, CONFIGS.C0, positions, depth);
    attempts.push({ depth, totalMs });
    console.log(`Profundidad ${depth}: ${(totalMs / 1000).toFixed(1)} s`);
    if (totalMs >= MIN_CALIBRATION_MS) {
      mkdirSync(resultsDir, { recursive: true });
      writeFileSync(calibrationFile, `${JSON.stringify({ depth, attempts, positions: positions.length, at: new Date().toISOString(), environment: environment() }, null, 2)}\n`);
      console.log(`Profundidad elegida: ${depth}`);
      return;
    }
  }
  throw new Error(`Ninguna profundidad hasta ${MAX_DEPTH} llegó a ${MIN_CALIBRATION_MS / 1000} s`);
}

function runFile(rep: number, id: ConfigId): string {
  return join(resultsDir, `run-r${rep}-${id}.json`);
}

async function measure(): Promise<void> {
  if (!existsSync(calibrationFile)) throw new Error('Falta calibrar primero');
  if (!(await preflight())) process.exit(1);
  const { depth } = JSON.parse(readFileSync(calibrationFile, 'utf8')) as { depth: number };
  const path = stockfishPath();
  const positions = loadGame('measurement-fischer-spassky-1972-g6.pgn');
  console.log(`Profundidad ${depth} · ${positions.length} posiciones · ${path}`);
  for (const [repIndex, order] of ORDER.entries()) {
    const rep = repIndex + 1;
    for (const id of order) {
      const file = runFile(rep, id);
      // section 8: a finished run is never measured again, so a result cannot be replaced by a better one
      if (existsSync(file)) {
        console.log(`r${rep} ${id}: ya medida`);
        continue;
      }
      const config = CONFIGS[id];
      const startedAt = new Date().toISOString();
      try {
        const { totalMs, results, rssBytes } = await runBatch(path, config, positions, depth);
        const times = results.map((result) => result.ms);
        const run: RunFile = {
          config,
          rep,
          depth,
          startedAt,
          totalMs,
          positionP50Ms: percentile(times, 50),
          positionP95Ms: percentile(times, 95),
          evals: results.map((result) => result.evalWhite),
          rssBytes,
          environment: environment(),
          positions: results,
        };
        writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
        console.log(`r${rep} ${id}: ${(totalMs / 1000).toFixed(1)} s`);
      } catch (error) {
        // section 8: the failed attempt stays on record
        const failed = join(resultsDir, `failed-r${rep}-${id}-${Date.now()}.json`);
        writeFileSync(failed, `${JSON.stringify({ config, rep, depth, startedAt, error: (error as Error).message }, null, 2)}\n`);
        throw error;
      }
      await sleep(PAUSE_MS);
    }
  }
  console.log('Medición completa.');
}

function report(): void {
  const load = (id: ConfigId): RunFile[] =>
    ORDER.flatMap((_, index) => {
      const file = runFile(index + 1, id);
      return existsSync(file) ? [JSON.parse(readFileSync(file, 'utf8')) as RunFile] : [];
    });
  const all: Record<ConfigId, RunFile[]> = { C0: load('C0'), C1: load('C1'), C2: load('C2') };
  for (const [id, runs] of Object.entries(all)) if (runs.length !== ORDER.length) throw new Error(`Faltan corridas de ${id}: ${runs.length} de ${ORDER.length}`);

  const seconds = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',');
  const percent = (share: number) => `${(share * 100).toFixed(1).replace('.', ',')} %`;
  const runs: Runs = all;
  const decision = decide(runs);

  console.log('| Config. | Procesos × hilos | r1 | r2 | r3 | Mediana | p50 pos. | p95 pos. | RSS total máx. |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const id of ['C0', 'C1', 'C2'] as const) {
    const list = all[id];
    const { processes, threads } = list[0]!.config;
    const byRep = [...list].sort((a, b) => a.rep - b.rep);
    const rss = Math.max(...list.map((run) => run.rssBytes.reduce<number>((sum, value) => sum + (value ?? 0), 0)));
    console.log(
      `| ${id} | ${processes} × ${threads} | ${byRep.map((run) => `${seconds(run.totalMs)} s`).join(' | ')} | **${seconds(median(list.map((run) => run.totalMs)))} s** | ${seconds(median(list.map((run) => run.positionP50Ms)))} s | ${seconds(median(list.map((run) => run.positionP95Ms)))} s | ${Math.round(rss / 2 ** 20)} MB |`,
    );
  }
  console.log('');
  console.log(`Mejor pool: ${decision.best}`);
  console.log(`Reducción: ${percent(decision.reduction)} (umbral ≥ 30 %) → ${decision.passes.reduction ? 'cumple' : 'no cumple'}`);
  console.log(`Sin solape: ${decision.passes.noOverlap ? 'cumple' : 'no cumple'}`);
  console.log(`Calidad: ${decision.differing} de ${decision.comparable} posiciones difieren en más de ${DIFFERENCE_CP} cp (${percent(decision.differingShare)}; umbral ≤ 5 %) → ${decision.passes.quality ? 'cumple' : 'no cumple'}`);
  console.log(`\nDECISIÓN: ${decision.passed ? 'PASA' : 'NO PASA'}`);
}

const command = process.argv[2];
if (command === 'preflight') process.exit((await preflight()) ? 0 : 1);
else if (command === 'calibrate') await calibrate();
else if (command === 'measure') await measure();
else if (command === 'report') report();
else throw new Error('Uso: gate.ts preflight | calibrate | measure | report');
