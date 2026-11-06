import { Logger } from '@nestjs/common';
import mongoose from 'mongoose';
import { GameMovesRepository } from '../../src/database/mongo/game-moves.repository';
import { GameMoves, GameMovesSchema, type StoredMove } from '../../src/database/mongo/game-moves.schema';
import type { MovePersistence } from '../../src/games/move-persistence/move-persistence';
import { createMovePersistence } from '../../src/games/move-persistence/move-persistence.factory';

// Runs against the local _test Mongo database (pnpm test:integration refuses anything else).
const move = (ply: number): StoredMove => ({ ply, uci: 'e2e4', san: `m${ply}`, fen: 'x', at: new Date() });

let connection: mongoose.Connection;
let model: mongoose.Model<GameMoves>;
let repository: GameMovesRepository;
let persistence: MovePersistence;

beforeAll(async () => {
  connection = await mongoose.createConnection(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 3000 }).asPromise();
  model = connection.model(GameMoves.name, GameMovesSchema) as never;
  await model.syncIndexes();
  repository = new GameMovesRepository(model as never);
  persistence = createMovePersistence(repository, { MOVE_WORKERS: '0' });
});

beforeEach(async () => {
  await model.deleteMany();
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await model.deleteMany();
  await connection.close();
});

const stored = (gameId: string) => model.findOne({ gameId }).lean();

describe('MovePersistence with MOVE_WORKERS=0 (real MongoDB)', () => {
  it('stores the moves in order, with plyCount equal to their number', async () => {
    await repository.createGame('g1');
    for (const ply of [1, 2, 3]) await expect(persistence.save('g1', move(ply))).resolves.toEqual({ outcome: 'applied' });

    const game = await stored('g1');
    expect(game?.plyCount).toBe(3);
    expect(game?.moves.map((m) => m.ply)).toEqual([1, 2, 3]);
  });

  it('does not duplicate a retried move', async () => {
    await repository.createGame('g1');
    await persistence.save('g1', move(1));
    await expect(persistence.save('g1', move(1))).resolves.toEqual({ outcome: 'duplicate', plyCount: 1 });

    const game = await stored('g1');
    expect(game?.plyCount).toBe(1);
    expect(game?.moves).toHaveLength(1);
  });

  it('reports a gap and writes nothing', async () => {
    await repository.createGame('g1');
    await persistence.save('g1', move(1));
    await expect(persistence.save('g1', move(3))).resolves.toEqual({ outcome: 'gap', plyCount: 1 });

    const game = await stored('g1');
    expect(game?.plyCount).toBe(1);
    expect(game?.moves.map((m) => m.ply)).toEqual([1]);
  });

  it('keeps two simultaneous games apart, with no gaps in either', async () => {
    await Promise.all([repository.createGame('g1'), repository.createGame('g2')]);
    const play = async (gameId: string) => {
      for (let ply = 1; ply <= 20; ply++) await expect(persistence.save(gameId, move(ply))).resolves.toEqual({ outcome: 'applied' });
    };
    await Promise.all([play('g1'), play('g2')]);

    for (const gameId of ['g1', 'g2']) {
      const game = await stored(gameId);
      expect(game?.plyCount).toBe(20);
      expect(game?.moves.map((m) => m.ply)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
  });
});
