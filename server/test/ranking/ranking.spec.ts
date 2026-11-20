import 'reflect-metadata';
import { Global, Logger, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { rankingResponseSchema } from '@chessspeak/shared';
import request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { RankingModule } from '../../src/ranking/ranking.module';
import { RANKING_SIZE } from '../../src/ranking/ranking.service';

const findMany = jest.fn();

@Global()
@Module({ providers: [{ provide: PrismaService, useValue: { game: { findMany } } }], exports: [PrismaService] })
class FakeInfraModule {}

type Row = { whiteName: string | null; blackName: string | null; result: string | null };
const row = (whiteName: string | null, blackName: string | null, result: string | null): Row => ({ whiteName, blackName, result });

let app: NestExpressApplication;
const get = () => request(app.getHttpServer()).get('/ranking');

beforeEach(async () => {
  findMany.mockReset().mockResolvedValue([]);
  const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, RankingModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
});

afterEach(async () => {
  await app.close();
  jest.restoreAllMocks();
});

describe('GET /ranking', () => {
  it('answers what the shared contract says, with no token', async () => {
    findMany.mockResolvedValue([row('Ana', 'Luis', '1-0')]);
    const response = await get().expect(200);
    expect(rankingResponseSchema.parse(response.body)).toEqual({
      entries: [
        { rank: 1, displayName: 'Ana', rating: 1220, games: 1, wins: 1, draws: 0, losses: 0 },
        { rank: 2, displayName: 'Luis', rating: 1180, games: 1, wins: 0, draws: 0, losses: 1 },
      ],
      gamesRated: 1,
    });
  });

  it('is empty when no game has finished', async () => {
    const response = await get().expect(200);
    expect(response.body).toEqual({ entries: [], gamesRated: 0 });
  });

  it('asks Postgres only for finished, decisive games with both names, oldest first', async () => {
    await get().expect(200);
    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      status: 'finished',
      result: { in: ['1-0', '0-1', '1/2-1/2'] },
      whiteName: { not: null },
      blackName: { not: null },
    });
    expect(query.orderBy).toEqual([{ finishedAt: 'asc' }, { createdAt: 'asc' }]);
    expect(query.select).toEqual({ whiteName: true, blackName: true, result: true });
  });

  it('ignores rows that slip through without a name or with an aborted result', async () => {
    findMany.mockResolvedValue([row('Ana', null, '1-0'), row('Ana', 'Luis', '*'), row('Ana', 'Luis', null), row('Ana', 'Luis', '0-1')]);
    const response = await get().expect(200);
    expect(response.body.gamesRated).toBe(1);
    expect(response.body.entries[0].displayName).toBe('Luis');
  });

  it(`returns at most ${RANKING_SIZE} players`, async () => {
    const rows = Array.from({ length: RANKING_SIZE + 10 }, (_, index) => row(`Jugador ${index}`, `Rival ${index}`, '1-0'));
    findMany.mockResolvedValue(rows);
    const response = await get().expect(200);
    expect(response.body.entries).toHaveLength(RANKING_SIZE);
    expect(response.body.gamesRated).toBe(RANKING_SIZE + 10);
  });

  it('answers 503 and logs when the database fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    findMany.mockRejectedValue(new Error('connection refused'));
    await get().expect(503);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
  });
});
