import { Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import { GameMovesRepository } from '../src/database/mongo/game-moves.repository';
import type { GameMoves, StoredMove } from '../src/database/mongo/game-moves.schema';

const move = (ply: number): StoredMove => ({ ply, uci: 'e2e4', san: 'e4', fen: 'x', at: new Date() });

function repoWith(matchedCount: number, stored: { plyCount: number } | null) {
  const updateOne = jest.fn().mockResolvedValue({ matchedCount });
  const lean = jest.fn().mockResolvedValue(stored);
  const findOne = jest.fn().mockReturnValue({ lean });
  const repo = new GameMovesRepository({ updateOne, findOne } as unknown as Model<GameMoves>);
  return { repo, updateOne, findOne };
}

describe('appendMove (unit, mocked model)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('filters on plyCount = ply - 1 and pushes, increments and stamps updatedAt', async () => {
    const { repo, updateOne } = repoWith(1, null);
    const m = move(3);
    expect(await repo.appendMove('g1', m)).toEqual({ outcome: 'applied' });
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ gameId: 'g1', plyCount: 2 });
    expect(update.$push).toEqual({ moves: m });
    expect(update.$inc).toEqual({ plyCount: 1 });
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });

  it('ignores a retry when the stored plyCount already reached the ply', async () => {
    const { repo } = repoWith(0, { plyCount: 3 });
    expect(await repo.appendMove('g1', move(3))).toEqual({ outcome: 'duplicate', plyCount: 3 });
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('reports and logs a gap when an earlier write is missing', async () => {
    const { repo } = repoWith(0, { plyCount: 1 });
    expect(await repo.appendMove('g1', move(4))).toEqual({ outcome: 'gap', plyCount: 1 });
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('gap'));
  });

  it('treats an unknown game as a gap, not as a duplicate', async () => {
    const { repo } = repoWith(0, null);
    expect(await repo.appendMove('nope', move(1))).toEqual({ outcome: 'gap', plyCount: 0 });
  });
});
