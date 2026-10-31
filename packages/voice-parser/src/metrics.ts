import type { Split } from './corpus.js';
import type { AttemptRecord, Condition } from './results.js';
import { resolve } from './resolve.js';
import { percentile, wilson } from './stats.js';
import type { Resolution, ResolveOptions } from './types.js';

export type Mode = 'nbest' | 'top1';
export type SplitFilter = Split | 'all';

export interface Rate {
  count: number;
  total: number;
  /** 0..1, NaN when total is 0 */
  value: number;
  /** Wilson 95 % interval */
  interval: [number, number];
}

export interface LatencySummary {
  n: number;
  p50: number;
  p95: number;
}

export interface Report {
  split: SplitFilter;
  mode: Mode;
  /** Attempts in the valid set V (move expected, spoken in quiet or noisy). */
  valid: number;
  topOne: Rate;
  wrongAcceptance: Rate;
  ambiguity: Rate;
  nomatch: Rate;
  /** Valid attempts that came back as a command. Counts as a failure. */
  other: Rate;
  /** Attempts expected to give nothing (noise phrases, silence, noise) that gave a move or command. */
  falseAcceptance: Rate;
  /** Commands expected and recognized (informative only). */
  commands: Rate;
  latency: LatencySummary | undefined;
}

const rate = (count: number, total: number): Rate => ({
  count,
  total,
  value: total === 0 ? NaN : count / total,
  interval: wilson(count, total),
});

const isSpoken = (condition: Condition): boolean => condition === 'quiet' || condition === 'noisy';

export function resolveAttempt(
  attempt: AttemptRecord,
  mode: Mode,
  parser: ResolveOptions,
): Resolution {
  const alternatives = mode === 'top1' ? attempt.alternatives.slice(0, 1) : attempt.alternatives;
  return resolve(attempt.fen, alternatives, parser);
}

export function evaluate(
  attempts: AttemptRecord[],
  options: { split: SplitFilter; mode: Mode; parser?: ResolveOptions; condition?: Condition },
): Report {
  const parser = options.parser ?? {};
  const inSplit = (a: AttemptRecord): boolean => options.split === 'all' || a.split === options.split;
  const inCondition = (a: AttemptRecord): boolean =>
    options.condition === undefined || a.condition === options.condition;
  // silence / noise trials are not part of any split; they decide with `test` (and `all`)
  const nonSpeechCounts = options.split !== 'dev';

  const valid = attempts.filter(
    (a) => inSplit(a) && inCondition(a) && a.expectedOutcome === 'move' && isSpoken(a.condition),
  );
  const expectNothing = attempts.filter(
    (a) =>
      a.expectedOutcome === 'nomatch' &&
      inCondition(a) &&
      (inSplit(a) || (nonSpeechCounts && !isSpoken(a.condition))),
  );
  const commands = attempts.filter(
    (a) => inSplit(a) && inCondition(a) && a.expectedOutcome === 'command',
  );

  let correct = 0;
  let wrong = 0;
  let ambiguous = 0;
  let nomatch = 0;
  let other = 0;
  const latencies: number[] = [];
  for (const attempt of valid) {
    const result = resolveAttempt(attempt, options.mode, parser);
    if (result.kind === 'move') {
      if (result.uci === attempt.expectedUci) correct++;
      else wrong++;
    } else if (result.kind === 'ambiguous') ambiguous++;
    else if (result.kind === 'nomatch') nomatch++;
    else other++;
    if (attempt.latency !== undefined) latencies.push(attempt.latency.totalMs);
  }

  const falseAccepted = expectNothing.filter((attempt) => {
    const kind = resolveAttempt(attempt, options.mode, parser).kind;
    return kind === 'move' || kind === 'command';
  }).length;

  const commandsOk = commands.filter((attempt) => {
    const result = resolveAttempt(attempt, options.mode, parser);
    return result.kind === 'command' && result.command === attempt.expectedCommand;
  }).length;

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  return {
    split: options.split,
    mode: options.mode,
    valid: valid.length,
    topOne: rate(correct, valid.length),
    wrongAcceptance: rate(wrong, valid.length),
    ambiguity: rate(ambiguous, valid.length),
    nomatch: rate(nomatch, valid.length),
    other: rate(other, valid.length),
    falseAcceptance: rate(falseAccepted, expectNothing.length),
    commands: rate(commandsOk, commands.length),
    latency:
      p50 === undefined || p95 === undefined ? undefined : { n: latencies.length, p50, p95 },
  };
}

export interface NBestVerdict {
  adopt: boolean;
  /** Percentage points gained by the N-best over the first alternative only. */
  gainPoints: number;
  reason: string;
}

/** docs/spike-criteria.md section 4. */
export function nbestVerdict(nbest: Report, top1: Report): NBestVerdict {
  if (nbest.valid === 0) return { adopt: false, gainPoints: NaN, reason: 'sin datos' };
  const gainPoints = (nbest.topOne.value - top1.topOne.value) * 100;
  const worseWrong = nbest.wrongAcceptance.count > top1.wrongAcceptance.count;
  const adopt = gainPoints >= 5 && !worseWrong;
  const reason = adopt
    ? 'sube el acierto ≥ 5 puntos sin subir la aceptación errónea'
    : gainPoints < 5
      ? 'el acierto sube menos de 5 puntos'
      : 'sube la aceptación errónea';
  return { adopt, gainPoints, reason };
}

export type Status = 'cumple' | 'no cumple' | 'sin datos';

export interface CriterionCheck {
  name: string;
  threshold: string;
  measured: string;
  status: Status;
}

const pct = (r: Rate): string =>
  Number.isNaN(r.value)
    ? 'n/d'
    : `${(r.value * 100).toFixed(1)} % (${r.count}/${r.total}; IC95 ${(r.interval[0] * 100).toFixed(0)}–${(r.interval[1] * 100).toFixed(0)} %)`;

/** docs/spike-criteria.md sections 1 and 2, applied to one report. */
export function checkCriteria(report: Report): CriterionCheck[] {
  const noData = report.valid === 0;
  const status = (ok: boolean): Status => (noData ? 'sin datos' : ok ? 'cumple' : 'no cumple');
  const latency = report.latency;
  return [
    {
      name: 'Acierto top-1',
      threshold: '≥ 85 %',
      measured: pct(report.topOne),
      status: status(report.topOne.value >= 0.85),
    },
    {
      name: 'Aceptación errónea',
      threshold: '≤ 2 %',
      measured: pct(report.wrongAcceptance),
      status: status(report.wrongAcceptance.value <= 0.02),
    },
    {
      name: 'Ambigüedad',
      threshold: '≤ 10 %',
      measured: pct(report.ambiguity),
      status: status(report.ambiguity.value <= 0.1),
    },
    {
      name: 'Latencia p50',
      threshold: '≤ 1,5 s',
      measured: latency ? `${(latency.p50 / 1000).toFixed(2)} s (n=${latency.n})` : 'n/d',
      status: latency ? (latency.p50 <= 1500 ? 'cumple' : 'no cumple') : 'sin datos',
    },
    {
      name: 'Latencia p95',
      threshold: '≤ 3 s',
      measured: latency ? `${(latency.p95 / 1000).toFixed(2)} s (n=${latency.n})` : 'n/d',
      status: latency ? (latency.p95 <= 3000 ? 'cumple' : 'no cumple') : 'sin datos',
    },
    {
      name: 'Silencio / ruido',
      threshold: '0 aceptadas',
      measured: `${report.falseAcceptance.count}/${report.falseAcceptance.total}`,
      status:
        report.falseAcceptance.total === 0
          ? 'sin datos'
          : report.falseAcceptance.count === 0
            ? 'cumple'
            : 'no cumple',
    },
  ];
}

export { pct as formatRate };
