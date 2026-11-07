import { Logger } from '@nestjs/common';
import { PerGameQueue } from '../../src/games/per-game-queue';

const queue = () => new PerGameQueue({ initialDelayMs: 1, maxDelayMs: 2 });

beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('PerGameQueue', () => {
  it('runs the writes of a game one after another, even when an early one is slow', async () => {
    const q = queue();
    const done: number[] = [];
    let running = 0;
    let most = 0;
    const write = (n: number, ms: number) => async () => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      done.push(n);
      running--;
    };
    q.push('g1', 'first', write(1, 20));
    q.push('g1', 'second', write(2, 1));
    q.push('g1', 'third', write(3, 1));
    await q.drained('g1');

    expect(done).toEqual([1, 2, 3]);
    expect(most).toBe(1);
  });

  it('retries a failed write before the next one, keeping the order', async () => {
    const q = queue();
    const done: string[] = [];
    let attempts = 0;
    q.push('g1', 'first', async () => {
      if (++attempts < 3) throw new Error('mongo down');
      done.push('first');
    });
    q.push('g1', 'second', async () => void done.push('second'));
    await q.drained('g1');

    expect(attempts).toBe(3);
    expect(done).toEqual(['first', 'second']);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('mongo down'));
  });

  it('does not make one game wait for another', async () => {
    const q = queue();
    let release: () => void = () => undefined;
    q.push('slow', 'stuck', () => new Promise<void>((resolve) => (release = resolve)));
    const done = jest.fn();
    q.push('fast', 'write', async () => done());
    await q.drained('fast');

    expect(done).toHaveBeenCalled();
    release();
    await q.drained('slow');
  });

  it('stops retrying when the module is destroyed', async () => {
    const q = queue();
    let attempts = 0;
    q.push('g1', 'always fails', async () => {
      attempts++;
      q.onModuleDestroy();
      throw new Error('mongo down');
    });
    await q.drained('g1');
    expect(attempts).toBe(1);
  });

  it('is drained at once for a game with no writes', async () => {
    await expect(queue().drained('none')).resolves.toBeUndefined();
  });
});
