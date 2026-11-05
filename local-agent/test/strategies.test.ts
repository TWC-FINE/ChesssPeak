import { describe, expect, it } from 'vitest';
import { LeastConnections, RoundRobin, strategyFromName } from '../src/strategies.js';

const workers = (...active: number[]) => active.map((n, i) => ({ id: `w${i + 1}`, active: n }));

describe('balancing strategies', () => {
  it('least connections picks the worker with fewest requests in flight', () => {
    const strategy = new LeastConnections();
    for (let i = 0; i < 5; i++) expect(strategy.pick(workers(3, 1, 2))?.id).toBe('w2');
  });

  it('least connections rotates between tied workers', () => {
    const strategy = new LeastConnections();
    const picked = Array.from({ length: 3 }, () => strategy.pick(workers(0, 0, 0))?.id);
    expect(new Set(picked)).toEqual(new Set(['w1', 'w2', 'w3']));
  });

  it('round robin takes each worker in turn, whatever its load', () => {
    const strategy = new RoundRobin();
    expect(Array.from({ length: 4 }, () => strategy.pick(workers(5, 0, 0))?.id)).toEqual(['w1', 'w2', 'w3', 'w1']);
  });

  it('both return undefined when no worker can take the request', () => {
    expect(new LeastConnections().pick([])).toBeUndefined();
    expect(new RoundRobin().pick([])).toBeUndefined();
  });

  it('is chosen by name, least connections by default', () => {
    expect(strategyFromName(undefined).name).toBe('least-connections');
    expect(strategyFromName('round-robin').name).toBe('round-robin');
    expect(() => strategyFromName('random')).toThrow(/LB_STRATEGY/);
  });
});
