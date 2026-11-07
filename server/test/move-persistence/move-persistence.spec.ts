import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { GameMovesRepository, type AppendMoveResult } from '../../src/database/mongo/game-moves.repository';
import { GameMoves, type StoredMove } from '../../src/database/mongo/game-moves.schema';
import { PrismaService } from '../../src/database/prisma.service';
import { GamesModule } from '../../src/games/games.module';
import { DirectMovePersistence } from '../../src/games/move-persistence/direct-move-persistence';
import { MOVE_PERSISTENCE, type MovePersistence } from '../../src/games/move-persistence/move-persistence';
import { createMovePersistence, moveWorkers } from '../../src/games/move-persistence/move-persistence.factory';

const move = (ply: number): StoredMove => ({ ply, uci: 'e2e4', san: 'e4', fen: 'x', at: new Date() });
const repositoryAnswering = (result: AppendMoveResult) => ({ appendMove: jest.fn().mockResolvedValue(result) });

describe('moveWorkers', () => {
  it.each([[undefined], [''], ['   '], ['0']])('is 0 for %p', (value) => {
    expect(moveWorkers({ MOVE_WORKERS: value })).toBe(0);
  });

  it('reads a whole number', () => {
    expect(moveWorkers({ MOVE_WORKERS: ' 3 ' })).toBe(3);
  });

  it.each([['abc'], ['-1'], ['1.5'], ['2 workers']])('rejects %p', (value) => {
    expect(() => moveWorkers({ MOVE_WORKERS: value })).toThrow('MOVE_WORKERS must be a whole number');
  });
});

describe('createMovePersistence', () => {
  it.each([[{}], [{ MOVE_WORKERS: '0' }]])('writes directly with %j', (env) => {
    expect(createMovePersistence(repositoryAnswering({ outcome: 'applied' }), env)).toBeInstanceOf(DirectMovePersistence);
  });

  it('refuses a pool that does not exist yet instead of writing directly', () => {
    expect(() => createMovePersistence(repositoryAnswering({ outcome: 'applied' }), { MOVE_WORKERS: '3' })).toThrow('does not exist yet');
  });
});

describe('MOVE_WORKERS=0 (direct writes)', () => {
  const direct = (repository: Pick<GameMovesRepository, 'appendMove'>) => createMovePersistence(repository, { MOVE_WORKERS: '0' });

  it('saves through the idempotent appendMove of the real repository', async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    const repository = new GameMovesRepository({ updateOne } as unknown as Model<GameMoves>);
    const stored = move(3);

    await expect(direct(repository).save('g1', stored)).resolves.toEqual({ outcome: 'applied' });

    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ gameId: 'g1', plyCount: 2 });
    expect(update.$push).toEqual({ moves: stored });
  });

  it.each<[AppendMoveResult]>([[{ outcome: 'applied' }], [{ outcome: 'duplicate', plyCount: 3 }], [{ outcome: 'gap', plyCount: 1 }]])(
    'hands back %j unchanged, so the caller can act on it',
    async (result) => {
      await expect(direct(repositoryAnswering(result)).save('g1', move(3))).resolves.toEqual(result);
    },
  );

  it('does not hide a failed write', async () => {
    const repository = { appendMove: jest.fn().mockRejectedValue(new Error('mongo down')) };
    await expect(direct(repository).save('g1', move(1))).rejects.toThrow('mongo down');
  });
});

describe('GamesModule', () => {
  const appendMove = jest.fn().mockResolvedValue({ outcome: 'applied' });

  @Global()
  @Module({
    providers: [
      { provide: GameMovesRepository, useValue: { appendMove } },
      { provide: PrismaService, useValue: {} },
      { provide: getModelToken(GameMoves.name), useValue: {} },
    ],
    exports: [GameMovesRepository, PrismaService, getModelToken(GameMoves.name)],
  })
  class FakeInfraModule {}

  const original = process.env.MOVE_WORKERS;
  const originalSecret = process.env.GUEST_TOKEN_SECRET;
  beforeEach(() => {
    process.env.GUEST_TOKEN_SECRET = 'a'.repeat(64);
  });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
    else process.env.GUEST_TOKEN_SECRET = originalSecret;
    if (original === undefined) delete process.env.MOVE_WORKERS;
    else process.env.MOVE_WORKERS = original;
  });

  const compile = () => Test.createTestingModule({ imports: [FakeInfraModule, GamesModule] }).compile();

  it('provides direct writes when MOVE_WORKERS is not set', async () => {
    delete process.env.MOVE_WORKERS;
    const persistence = (await compile()).get<MovePersistence>(MOVE_PERSISTENCE);
    expect(persistence).toBeInstanceOf(DirectMovePersistence);

    const stored = move(1);
    await persistence.save('g1', stored);
    expect(appendMove).toHaveBeenCalledWith('g1', stored);
  });

  it('does not start with MOVE_WORKERS above 0', async () => {
    process.env.MOVE_WORKERS = '3';
    await expect(compile()).rejects.toThrow('does not exist yet');
  });
});
