import 'reflect-metadata';
import { Global, Logger, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createGameResponseSchema } from '@chessspeak/shared';
import request from 'supertest';
import { GuestTokenService } from '../../src/auth/guest-token.service';
import { GameMovesRepository } from '../../src/database/mongo/game-moves.repository';
import { GameMoves } from '../../src/database/mongo/game-moves.schema';
import { PrismaService } from '../../src/database/prisma.service';
import { GamesModule } from '../../src/games/games.module';
import { pickColor } from '../../src/games/games.service';

const SECRET = 'a'.repeat(64);
const GAME_ID = '11111111-1111-4111-8111-111111111111';
const originalSecret = process.env.GUEST_TOKEN_SECRET;
const create = jest.fn();

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: { game: { create } } },
    { provide: GameMovesRepository, useValue: {} },
    { provide: getModelToken(GameMoves.name), useValue: {} },
  ],
  exports: [PrismaService, GameMovesRepository, getModelToken(GameMoves.name)],
})
class FakeInfraModule {}

let app: NestExpressApplication;
let token: string;
let guestId: string;

const post = (body?: object, authorization: string | null = `Bearer ${token}`) => {
  const call = request(app.getHttpServer()).post('/games');
  if (authorization !== null) void call.set('Authorization', authorization);
  return body === undefined ? call : call.send(body);
};
const savedData = () => create.mock.calls[0][0].data as Record<string, unknown>;

beforeEach(async () => {
  process.env.GUEST_TOKEN_SECRET = SECRET;
  create.mockReset().mockResolvedValue({ id: GAME_ID });
  const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, GamesModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  const issued = app.get(GuestTokenService, { strict: false }).issue('Ana');
  token = issued.token;
  guestId = (issued.identity as { guestId: string }).guestId;
});

afterEach(async () => {
  await app.close();
  if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalSecret;
  jest.restoreAllMocks();
});

describe('POST /games', () => {
  it('answers what the shared contract says', async () => {
    const response = await post({ color: 'white' }).expect(201);
    expect(createGameResponseSchema.parse(response.body)).toEqual({ gameId: GAME_ID });
  });

  it.each([
    ['white', { whiteGuestId: 'id', whiteName: 'Ana' }],
    ['black', { blackGuestId: 'id', blackName: 'Ana' }],
  ])('reserves the %s seat for the creator, and only that one', async (color, expected) => {
    await post({ color }).expect(201);
    const data = savedData();
    expect(Object.entries(data).filter(([, value]) => value !== undefined)).toEqual(
      Object.entries(expected).map(([key, value]) => [key, value === 'id' ? guestId : value]),
    );
  });

  it.each([['with no body', undefined], ['with an empty body', {}], ['with random', { color: 'random' }]])(
    'draws a color %s',
    async (_case, body) => {
      await post(body).expect(201);
      const data = savedData();
      const seat = data.whiteGuestId ?? data.blackGuestId;
      expect(seat).toBe(guestId);
      expect(data.whiteGuestId === undefined || data.blackGuestId === undefined).toBe(true);
    },
  );

  it.each([
    ['an unknown color', { color: 'green' }],
    ['an identity sent by the client', { color: 'white', guestId: 'someone-else' }],
    ['a user id sent by the client', { userId: 'someone-else' }],
  ])('rejects %s with 400 and saves nothing', async (_case, body) => {
    await post(body).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 503 when the database fails, without showing the error', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    create.mockRejectedValue(new Error('connection to secret-host failed'));
    const response = await post({ color: 'white' }).expect(503);
    expect(JSON.stringify(response.body)).not.toContain('secret-host');
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('secret-host'));
  });
});

describe('POST /games without a valid token', () => {
  const jwt = new JwtService({});
  const signed = (secret: string, expiresIn: string | number) => jwt.sign({ kind: 'guest', name: 'Ana' }, { secret, subject: GAME_ID, expiresIn: expiresIn as never });

  it.each<[string, () => string | null]>([
    ['no header', () => null],
    ['an empty header', () => ''],
    ['another scheme', () => `Basic ${token}`],
    ['a scheme with no token', () => 'Bearer'],
    ['extra parts', () => `Bearer ${token} extra`],
    ['garbage', () => 'Bearer not-a-token'],
    ['another secret', () => `Bearer ${signed('b'.repeat(64), '1h')}`],
    ['an expired token', () => `Bearer ${signed(SECRET, -1)}`],
  ])('answers 401 with %s and saves nothing', async (_case, header) => {
    await post({ color: 'white' }, header()).expect(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('checks the token before the body', async () => {
    await post({ color: 'green' }, 'Bearer not-a-token').expect(401);
  });
});

describe('pickColor', () => {
  it.each([['white'], ['black']] as const)('keeps %s', (color) => {
    expect(pickColor(color, () => 1 - (color === 'white' ? 1 : 0))).toBe(color);
  });

  it.each([[undefined], ['random']] as const)('draws for %p', (requested) => {
    expect(pickColor(requested, () => 0)).toBe('white');
    expect(pickColor(requested, () => 1)).toBe('black');
  });

  it('can draw both colors with the real generator', () => {
    const colors = new Set(Array.from({ length: 100 }, () => pickColor('random')));
    expect(colors).toEqual(new Set(['white', 'black']));
  });
});
