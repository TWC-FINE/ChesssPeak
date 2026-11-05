// The decision rule of docs/analysis-criteria.md, section 2. Pure, so it is tested without running the engine.

export const MIN_REDUCTION = 0.3;
export const MAX_DIFFERING_SHARE = 0.05;
export const DIFFERENCE_CP = 50;
export const DECIDED_CP = 1000;

export type PoolId = 'C1' | 'C2';
export type ConfigId = 'C0' | PoolId;

export interface RunSummary {
  totalMs: number;
  /** One evaluation per position, in ply order, from White's point of view. */
  evals: number[];
}

export type Runs = Record<ConfigId, RunSummary[]>;

export interface Decision {
  medians: Record<ConfigId, number>;
  best: PoolId;
  reduction: number;
  noOverlap: boolean;
  comparable: number;
  differing: number;
  differingShare: number;
  passes: { reduction: boolean; noOverlap: boolean; quality: boolean };
  passed: boolean;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of nothing');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Nearest-rank percentile, the one the spike and the load test use. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of nothing');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function evalsByPosition(runs: readonly RunSummary[]): number[] {
  const count = runs[0]?.evals.length ?? 0;
  if (runs.some((run) => run.evals.length !== count)) throw new Error('Las corridas tienen distinto número de posiciones');
  return Array.from({ length: count }, (_, i) => median(runs.map((run) => run.evals[i]!)));
}

export function decide(runs: Runs): Decision {
  const total = (id: ConfigId): number[] => runs[id].map((run) => run.totalMs);
  const medians: Record<ConfigId, number> = { C0: median(total('C0')), C1: median(total('C1')), C2: median(total('C2')) };
  // only the fastest pool is evaluated: picking whichever one passes would widen the selection bias
  const best: PoolId = medians.C1 <= medians.C2 ? 'C1' : 'C2';
  const reduction = (medians.C0 - medians[best]) / medians.C0;
  const noOverlap = Math.max(...total(best)) < Math.min(...total('C0'));

  const reference = evalsByPosition(runs.C0);
  const candidate = evalsByPosition(runs[best]);
  if (reference.length !== candidate.length) throw new Error('Las configuraciones tienen distinto número de posiciones');
  let comparable = 0;
  let differing = 0;
  reference.forEach((value, i) => {
    const other = candidate[i]!;
    if (Math.abs(value) >= DECIDED_CP && Math.abs(other) >= DECIDED_CP) return;
    comparable++;
    if (Math.abs(value - other) > DIFFERENCE_CP) differing++;
  });
  const differingShare = comparable === 0 ? 0 : differing / comparable;

  const passes = { reduction: reduction >= MIN_REDUCTION, noOverlap, quality: differingShare <= MAX_DIFFERING_SHARE };
  return { medians, best, reduction, noOverlap, comparable, differing, differingShare, passes, passed: passes.reduction && passes.noOverlap && passes.quality };
}
