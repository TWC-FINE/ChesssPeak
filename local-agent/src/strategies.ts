/** What a strategy may look at to choose a worker. */
export interface WorkerLoad {
  readonly id: string;
  /** Requests in flight on this worker right now. */
  readonly active: number;
}

/** Load balancing algorithm: picks one of the workers that can take a request now. */
export interface BalancingStrategy {
  readonly name: string;
  pick<T extends WorkerLoad>(candidates: readonly T[]): T | undefined;
}

/** The worker with the fewest requests in flight; ties rotate so idle workers share the load. */
export class LeastConnections implements BalancingStrategy {
  readonly name = 'least-connections';
  private offset = 0;

  pick<T extends WorkerLoad>(candidates: readonly T[]): T | undefined {
    if (candidates.length === 0) return undefined;
    const start = this.offset++ % candidates.length;
    let best: T | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(start + i) % candidates.length]!;
      if (best === undefined || candidate.active < best.active) best = candidate;
    }
    return best;
  }
}

/** Each request to the next worker in turn, whatever its load (kept for the comparison runs). */
export class RoundRobin implements BalancingStrategy {
  readonly name = 'round-robin';
  private next = 0;

  pick<T extends WorkerLoad>(candidates: readonly T[]): T | undefined {
    if (candidates.length === 0) return undefined;
    return candidates[this.next++ % candidates.length];
  }
}

export function strategyFromName(name: string | undefined): BalancingStrategy {
  if (name === undefined || name === '' || name === 'least-connections') return new LeastConnections();
  if (name === 'round-robin') return new RoundRobin();
  throw new Error(`LB_STRATEGY desconocida: «${name}» (usa least-connections o round-robin)`);
}
