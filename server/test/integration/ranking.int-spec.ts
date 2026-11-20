import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { rankingResponseSchema } from '@chessspeak/shared';
import request from 'supertest';
import { PrismaModule } from '../../src/database/prisma.module';
import { PrismaService } from '../../src/database/prisma.service';
import { RankingModule } from '../../src/ranking/ranking.module';

// Runs against the local _test Postgres database (pnpm test:integration refuses anything else).
let app: NestExpressApplication;
let prisma: PrismaService;
let minute = 0;

/** A finished game between two guests, `minute` minutes apart from the previous one so the order is clear. */
const finished = (whiteName: string, blackName: string, result: '1-0' | '0-1' | '1/2-1/2') => {
  minute += 1;
  return prisma.game.create({
    data: {
      status: 'finished',
      result,
      termination: result === '1/2-1/2' ? 'stalemate' : 'checkmate',
      whiteGuestId: randomUUID(),
      whiteName,
      blackGuestId: randomUUID(),
      blackName,
      finishedAt: new Date(Date.UTC(2026, 10, 20, 12, minute)),
    },
  });
};

const ranking = async () => rankingResponseSchema.parse((await request(app.getHttpServer()).get('/ranking').expect(200)).body);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, RankingModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  prisma = app.get(PrismaService, { strict: false });
});

beforeEach(async () => {
  await prisma.game.deleteMany();
  minute = 0;
});

afterAll(async () => {
  await prisma.game.deleteMany();
  await app.close();
});

describe('GET /ranking (real Postgres)', () => {
  it('is empty with no finished games', async () => {
    await prisma.game.create({ data: { status: 'waiting', whiteGuestId: randomUUID(), whiteName: 'Ana' } });
    await expect(ranking()).resolves.toEqual({ entries: [], gamesRated: 0 });
  });

  it('rates the finished games and leaves out the aborted and the unfinished ones', async () => {
    await finished('Ana', 'Luis', '1-0');
    await prisma.game.create({
      data: { status: 'aborted', result: '*', termination: 'aborted', whiteGuestId: randomUUID(), whiteName: 'Luis', blackGuestId: randomUUID(), blackName: 'Ana' },
    });
    await prisma.game.create({
      data: { status: 'active', whiteGuestId: randomUUID(), whiteName: 'Luis', blackGuestId: randomUUID(), blackName: 'Ana' },
    });

    const { entries, gamesRated } = await ranking();
    expect(gamesRated).toBe(1);
    expect(entries.map((entry) => [entry.displayName, entry.rating])).toEqual([
      ['Ana', 1220],
      ['Luis', 1180],
    ]);
  });

  it('replays the games in the order they finished', async () => {
    // inserted out of order: the ratings must follow finished_at, not the insertion
    const later = await finished('Marta', 'Ana', '1-0');
    const earlier = await finished('Ana', 'Luis', '1-0');
    await prisma.game.update({ where: { id: later.id }, data: { finishedAt: new Date(Date.UTC(2026, 10, 20, 13, 0)) } });
    await prisma.game.update({ where: { id: earlier.id }, data: { finishedAt: new Date(Date.UTC(2026, 10, 20, 12, 0)) } });

    const { entries } = await ranking();
    const rating = (name: string) => entries.find((entry) => entry.displayName === name)?.rating;
    // Ana beat Luis first (1220), then lost to Marta (1200): in the insertion order Ana would end on 1202
    expect(rating('Ana')).toBe(1199);
    expect(rating('Marta')).toBe(1221);
    expect(rating('Luis')).toBe(1180);
  });

  it('joins the games of a player who signed in again with the same name', async () => {
    await finished('Ana', 'Luis', '1-0');
    await finished('luis', 'ana', '1/2-1/2');

    const { entries } = await ranking();
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.displayName === 'ana')).toMatchObject({ games: 2, wins: 1, draws: 1 });
  });
});
