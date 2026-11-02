/** Block sizes of the deciding measurement (docs/spike-criteria.md, section 3, rule 4). */
export const EXPECTED_BLOCKS: Record<string, number> = { 'test-quiet': 48, 'test-noisy': 48, silence: 10, noise: 10 };

/** The stop delay fixed for run B in docs/spike-run-b.md. */
export const RUN_B_DELAY_MS = 400;

interface CheckAttempt {
  id: string;
  run?: string;
  releaseDelayMs?: number;
  startupMs?: number;
  audioFile?: string;
}

export interface CheckFile {
  name: string;
  meta: { fake?: boolean; sessionId: string; userAgent?: string; run?: string; releaseDelayMs?: number; improvised?: boolean };
  attempts: CheckAttempt[];
}

export interface CheckReport {
  ok: boolean;
  run: string | undefined;
  errors: string[];
  warnings: string[];
  info: string[];
}

const blockOf = (id: string): string => id.split(':')[0] ?? id;

/** "Edge 156", "Chrome 156" or "Firefox 130" from a user agent. Edge goes first: its agent also says Chrome. */
export function browserOf(userAgent: string): string {
  const match = /Edg\/(\d+)/.exec(userAgent) ?? /(Chrome|Firefox)\/(\d+)/.exec(userAgent);
  if (match === null) return `desconocido («${userAgent}»)`;
  return match.length === 2 ? `Edge ${match[1]}` : `${match[1]} ${match[2]}`;
}

export interface CheckOptions {
  /** Blocks this check measures (e.g. `test-quiet`, `silence`); any other block is reported as not expected. Default: the 4 blocks of run B. */
  expect?: string[];
}

/**
 * Guards `pnpm metrics`: it accepts any mix of files and counts duplicated attempt ids twice,
 * so runs A and B must be passed to it in separate invocations.
 * Files from before the run label existed are run A with no delay.
 */
export function checkRunFiles(files: CheckFile[], options: CheckOptions = {}): CheckReport {
  const expected: Record<string, number> =
    options.expect === undefined ? EXPECTED_BLOCKS : Object.fromEntries(options.expect.map((block) => [block, EXPECTED_BLOCKS[block] ?? 0]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const runs = new Set<string>();
  const delays = new Set<number>();
  const agents = new Set<string>();
  const ids = new Map<string, string>();
  const blocks: Record<string, number> = {};
  const startups: number[] = [];
  let withWav = 0;
  let total = 0;

  for (const file of files) {
    if (file.meta.fake === true || /\.fake\./i.test(file.name) || file.meta.sessionId.startsWith('fake')) {
      errors.push(`${file.name}: datos sintéticos, no son evidencia`);
    }
    if (file.meta.improvised === true || file.attempts.some((a) => a.id.startsWith('imp:'))) {
      errors.push(`${file.name}: son las improvisadas; no se pasan a pnpm metrics junto a los de test`);
    }
    if (file.meta.userAgent !== undefined) agents.add(browserOf(file.meta.userAgent));
    for (const attempt of file.attempts) {
      total++;
      runs.add(attempt.run ?? file.meta.run ?? 'A');
      delays.add(attempt.releaseDelayMs ?? file.meta.releaseDelayMs ?? 0);
      const before = ids.get(attempt.id);
      if (before !== undefined) errors.push(`intento duplicado ${attempt.id} (en ${before} y en ${file.name})`);
      else ids.set(attempt.id, file.name);
      blocks[blockOf(attempt.id)] = (blocks[blockOf(attempt.id)] ?? 0) + 1;
      if (attempt.startupMs !== undefined) startups.push(attempt.startupMs);
      if (attempt.audioFile !== undefined) withWav++;
    }
  }

  const run = runs.size === 1 ? [...runs][0] : undefined;
  if (runs.size > 1) errors.push(`mezcla corridas (${[...runs].sort().join(' y ')}): hay que pasarlas a metrics por separado`);
  if (delays.size > 1) errors.push(`hay más de un retardo al soltar (${[...delays].sort((a, b) => a - b).join(', ')} ms)`);
  const delay = delays.size === 1 ? [...delays][0] : undefined;
  if (run === 'A' && delay !== undefined && delay !== 0) errors.push(`corrida A con retardo ${delay} ms: la corrida A no tiene retardo`);
  if (run === 'B' && delay !== undefined && delay !== RUN_B_DELAY_MS) {
    errors.push(`corrida B con retardo ${delay} ms: la corrida B se fijó en ${RUN_B_DELAY_MS} ms`);
  }
  if (agents.size > 1) warnings.push(`hay más de un navegador en los archivos (no los mezcles): ${[...agents].join(', ')}`);

  for (const [block, count] of Object.entries(expected)) {
    const got = blocks[block] ?? 0;
    if (got !== count) warnings.push(`bloque ${block}: ${got} intentos (se esperaban ${count})`);
  }
  for (const block of Object.keys(blocks)) {
    if (!(block in expected)) warnings.push(`bloque ${block} (${blocks[block]} intentos) no forma parte de la medición de test`);
  }

  info.push(`corrida: ${run ?? '?'} · retardo al soltar: ${delay ?? '?'} ms · ${total} intentos en ${files.length} archivos`);
  info.push(`navegador: ${agents.size === 0 ? 'sin dato' : [...agents].join(', ')}`);
  info.push(`intentos por bloque: ${Object.entries(blocks).map(([b, n]) => `${b} ${n}`).join(', ')}`);
  info.push(`intentos con WAV: ${withWav}/${total}`);
  if (startups.length > 0) {
    const sorted = [...startups].sort((a, b) => a - b);
    info.push(
      `arranque del micrófono (pulsar → onstart): n=${sorted.length}, mín ${sorted[0]} ms, mediana ${sorted[Math.floor(sorted.length / 2)]} ms, máx ${sorted[sorted.length - 1]} ms`,
    );
  } else {
    info.push('arranque del micrófono: sin datos en estos archivos');
  }
  if (run === 'B' && withWav === 0) warnings.push('corrida B sin ningún WAV: debía grabarse en paralelo');
  if (run === 'B' && startups.length === 0) warnings.push('corrida B sin tiempo de arranque del micrófono');

  return { ok: errors.length === 0, run, errors, warnings, info };
}
