import 'reflect-metadata';
import { Global, Logger, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { OPEN_GAME_MAX_AGE_MS, OPEN_GAMES_LIMIT, openGamesResponseSchema } from '@chessspeak/shared';
import request from 'supertest';
import { GameMovesRepository } from '../../src/database/mongo/game-moves.repository';
import { GameMoves } from '../../src/database/mongo/game-moves.schema';
import { PrismaService } from '../../src/database/prisma.service';
import { GamesModule } from '../../src/games/games.module';
import { openGameOf, type WaitingRow } from '../../src/games/games.service';

const SECRET = 'a'.repeat(64);
const originalSecret = process.env.GUEST_TOKEN_SECRET;
const findMany = jest.fn();

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: { game: { findMany } } },
    { provide: GameMovesRepository, useValue: {} },
    { provide: getModelToken(GameMoves.name), useValue: {} },
  ],
  exports: [PrismaService, GameMovesRepository, getModelToken(GameMoves.name)],
})
class FakeInfraModule {}

let app: NestExpressApplication;

const row = (over: Partial<WaitingRow> = {}): WaitingRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  whiteName: 'Ana',
  blackName: null,
  clockMs: null,
  createdAt: new Date('2026-11-20T10:00:00.000Z'),
  ...over,
});

beforeEach(async () => {
  process.env.GUEST_TOKEN_SECRET = SECRET;
  findMany.mockReset().mockResolvedValue([]);
  const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, GamesModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
});

afterEach(async () => {
  await app.close();
  if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalSecret;
  jest.restoreAllMocks();
});

describe('openGameOf', () => {
  it('names the creator and the seat they took', () => {
    expect(openGameOf(row())).toEqual({ gameId: row().id, creator: 'Ana', creatorColor: 'white', createdAt: '2026-11-20T10:00:00.000Z' });
    expect(openGameOf(row({ whiteName: null, blackName: 'Luis', clockMs: 180_000 }))).toMatchObject({ creator: 'Luis', creatorColor: 'black', clockMs: 180_000 });
  });

  it('leaves out a row with no creator', () => {
    expect(openGameOf(row({ whiteName: null }))).toBeUndefined();
  });
});

describe('GET /games/open', () => {
  it('needs no token, and answers what the contract says', async () => {
    findMany.mockResolvedValue([row(), row({ id: '22222222-2222-4222-8222-222222222222', whiteName: null, blackName: 'Luis', clockMs: 300_000 })]);
    const response = await request(app.getHttpServer()).get('/games/open').expect(200);
    const body = openGamesResponseSchema.parse(response.body);
    expect(body.games.map((game) => game.creator)).toEqual(['Ana', 'Luis']);
    expect(body.games[1]).toMatchObject({ creatorColor: 'black', clockMs: 300_000 });
  });

  it('asks Postgres only for recent waiting games, newest first and at most the limit', async () => {
    const before = Date.now();
    await request(app.getHttpServer()).get('/games/open').expect(200);
    const query = findMany.mock.calls[0][0];
    expect(query).toMatchObject({ where: { status: 'waiting' }, orderBy: { createdAt: 'desc' }, take: OPEN_GAMES_LIMIT });
    const since = (query.where.createdAt.gte as Date).getTime();
    expect(since).toBeGreaterThanOrEqual(before - OPEN_GAME_MAX_AGE_MS);
    expect(since).toBeLessThanOrEqual(Date.now() - OPEN_GAME_MAX_AGE_MS);
    // the ids of the seats never leave the server
    expect(Object.keys(query.select)).toEqual(['id', 'whiteName', 'blackName', 'clockMs', 'createdAt']);
  });

  it('answers 503 when Postgres fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    findMany.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/games/open').expect(503);
  });
});
