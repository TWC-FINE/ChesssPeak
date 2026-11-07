import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { GuestAuthResponse } from '@chessspeak/shared';
import request from 'supertest';
import { GuestTokenService } from '../../src/auth/guest-token.service';
import { MongoModule } from '../../src/database/mongo/mongo.module';
import { PrismaModule } from '../../src/database/prisma.module';
import { PrismaService } from '../../src/database/prisma.service';
import { GamesModule } from '../../src/games/games.module';

// Runs against the local _test Postgres database (pnpm test:integration refuses anything else).
const originalSecret = process.env.GUEST_TOKEN_SECRET;
let app: NestExpressApplication;
let prisma: PrismaService;
let guest: GuestAuthResponse;
let guestId: string;

const createGame = (body: object, token = guest.token) => request(app.getHttpServer()).post('/games').set('Authorization', `Bearer ${token}`).send(body);

beforeAll(async () => {
  process.env.GUEST_TOKEN_SECRET = 'a'.repeat(64);
  const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, MongoModule, GamesModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  prisma = app.get(PrismaService, { strict: false });
  guest = app.get(GuestTokenService, { strict: false }).issue('Ana');
  guestId = (guest.identity as { guestId: string }).guestId;
});

beforeEach(async () => {
  await prisma.game.deleteMany();
});

afterAll(async () => {
  await prisma.game.deleteMany();
  await app.close();
  if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalSecret;
});

describe('POST /games (real Postgres)', () => {
  it('stores a waiting game with the creator in the white seat', async () => {
    const response = await createGame({ color: 'white' }).expect(201);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: response.body.gameId } });

    expect(game).toMatchObject({ status: 'waiting', whiteGuestId: guestId, whiteName: 'Ana', blackGuestId: null, blackName: null, result: null, termination: null });
  });

  it('stores the black seat when asked', async () => {
    const response = await createGame({ color: 'black' }).expect(201);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: response.body.gameId } });

    expect(game).toMatchObject({ blackGuestId: guestId, blackName: 'Ana', whiteGuestId: null, whiteName: null });
  });

  it('stores exactly one seat when the color is drawn, and passes the CHECK constraints', async () => {
    const response = await createGame({}).expect(201);
    const game = await prisma.game.findUniqueOrThrow({ where: { id: response.body.gameId } });

    expect([game.whiteGuestId, game.blackGuestId].filter(Boolean)).toEqual([guestId]);
    expect(game.status).toBe('waiting');
  });

  it('creates a different game each time', async () => {
    const first = await createGame({ color: 'white' }).expect(201);
    const second = await createGame({ color: 'white' }).expect(201);

    expect(first.body.gameId).not.toBe(second.body.gameId);
    await expect(prisma.game.count()).resolves.toBe(2);
  });

  it('stores nothing without a valid token', async () => {
    await createGame({ color: 'white' }, 'not-a-token').expect(401);
    await expect(prisma.game.count()).resolves.toBe(0);
  });
});
