import mongoose from 'mongoose';
import { GameMovesRepository } from '../../src/database/mongo/game-moves.repository';
import { GameMoves, GameMovesSchema, type StoredMove } from '../../src/database/mongo/game-moves.schema';
import { Logger } from '@nestjs/common';

// Runs against the local _test Mongo database (pnpm test:integration refuses anything else).
const move = (ply: number): StoredMove => ({ ply, uci: 'e2e4', san: `m${ply}`, fen: 'x', at: new Date() });

let connection: mongoose.Connection;
let repo: GameMovesRepository;
let model: mongoose.Model<GameMoves>;

beforeAll(async () => {
  connection = await mongoose.createConnection(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 3000 }).asPromise();
  model = connection.model(GameMoves.name, GameMovesSchema) as never;
  await model.syncIndexes();
  repo = new GameMovesRepository(model as never);
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

describe('appendMove (real MongoDB)', () => {
  it('appends in order and keeps plyCount equal to the number of moves', async () => {
    await repo.createGame('g1');
    for (const ply of [1, 2, 3]) expect(await repo.appendMove('g1', move(ply))).toEqual({ outcome: 'applied' });
    const stored = await model.findOne({ gameId: 'g1' }).lean();
    expect(stored?.plyCount).toBe(3);
    expect(stored?.moves.map((m) => m.ply)).toEqual([1, 2, 3]);
  });

  it('ignores a retried write: no duplicate move, no extra plyCount', async () => {
    await repo.createGame('g1');
    await repo.appendMove('g1', move(1));
    await repo.appendMove('g1', move(2));
    expect(await repo.appendMove('g1', move(2))).toEqual({ outcome: 'duplicate', plyCount: 2 });
    expect(await repo.appendMove('g1', move(1))).toEqual({ outcome: 'duplicate', plyCount: 2 });
    const stored = await model.findOne({ gameId: 'g1' }).lean();
    expect(stored?.plyCount).toBe(2);
    expect(stored?.moves).toHaveLength(2);
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('detects a gap, writes nothing and logs it', async () => {
    await repo.createGame('g1');
    await repo.appendMove('g1', move(1));
    expect(await repo.appendMove('g1', move(4))).toEqual({ outcome: 'gap', plyCount: 1 });
    const stored = await model.findOne({ gameId: 'g1' }).lean();
    expect(stored?.plyCount).toBe(1);
    expect(stored?.moves).toHaveLength(1);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('gap'));
  });

  it('applies exactly one of two simultaneous writes of the same ply', async () => {
    await repo.createGame('g1');
    const results = await Promise.all([repo.appendMove('g1', move(1)), repo.appendMove('g1', move(1))]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['applied', 'duplicate']);
    expect((await model.findOne({ gameId: 'g1' }).lean())?.moves).toHaveLength(1);
  });

  it('treats a game that was never created as a gap', async () => {
    expect(await repo.appendMove('nope', move(1))).toEqual({ outcome: 'gap', plyCount: 0 });
  });

  it('keeps gameId unique', async () => {
    await repo.createGame('g1');
    await expect(model.create({ gameId: 'g1' })).rejects.toThrow(/duplicate key|E11000/);
  });
});
