import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { GameState, GuestAuthResponse } from '@chessspeak/shared';
import type { Connection } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { PerGameQueue } from '../../src/games/per-game-queue';

// Runs against the local _test databases (pnpm test:integration refuses anything else).
const originalSecret = process.env.GUEST_TOKEN_SECRET;
const sockets: Socket[] = [];
let app: NestExpressApplication | undefined;
let url: string;

async function start(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
}

async function stop(): Promise<void> {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await app?.close();
  app = undefined;
}

const http = () => request(app!.getHttpServer());
const prisma = () => app!.get(PrismaService, { strict: false });
const mongo = () => app!.get<Connection>(getConnectionToken(), { strict: false }).collection('game_moves');
const drained = (gameId: string) => app!.get(PerGameQueue, { strict: false }).drained(gameId);

const signIn = async (displayName: string) => (await http().post('/auth/guest').set('X-Forwarded-For', displayName).send({ displayName }).expect(201)).body as GuestAuthResponse;
const createGame = async (token: string, color: string) => (await http().post('/games').set('Authorization', `Bearer ${token}`).send({ color }).expect(201)).body.gameId as string;

function connect(token: string): Promise<Socket> {
  const socket = io(url, { auth: { token, v: 1 }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function next<T>(socket: Socket, event: string, check: (payload: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event}`)), 5000);
    const listener = (payload: T): void => {
      if (!check(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

async function join(socket: Socket, gameId: string, check: (s: GameState) => boolean = () => true): Promise<GameState> {
  const state = next<GameState>(socket, 'game:state', check);
  socket.emit('game:join', { gameId });
  return state;
}

async function play(gameId: string, mover: Socket, observer: Socket, uci: string, ply: number): Promise<void> {
  const moved = next<{ ply: number }>(observer, 'game:moved', (m) => m.ply === ply);
  mover.emit('game:move', { gameId, uci, ply });
  await moved;
}

async function twoPlayers() {
  const ana = await signIn('Ana');
  const luis = await signIn('Luis');
  const gameId = await createGame(ana.token, 'white');
  const white = await connect(ana.token);
  await join(white, gameId);
  const black = await connect(luis.token);
  const active = next<GameState>(white, 'game:state', (s) => s.status === 'active');
  await join(black, gameId);
  await active;
  return { gameId, ana, luis, white, black };
}

/** The test of ADR 11: all the moves, with no gaps. */
async function expectMovesStored(gameId: string, plies: number[]): Promise<void> {
  const stored = await mongo().findOne({ gameId });
  expect(stored?.plyCount).toBe(plies.length);
  expect((stored?.moves as Array<{ ply: number }>).map((m) => m.ply)).toEqual(plies);
}

beforeEach(async () => {
  process.env.GUEST_TOKEN_SECRET = 'a'.repeat(64);
  await start();
  await prisma().game.deleteMany();
  await mongo().deleteMany({});
});

afterEach(async () => {
  await stop();
  if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalSecret;
});

describe('a whole game (real Postgres and MongoDB)', () => {
  it('stores the seats, every move and the result of a game that ends in checkmate', async () => {
    const { gameId, white, black, luis } = await twoPlayers();
    await drained(gameId);
    expect(await prisma().game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      status: 'active',
      blackGuestId: (luis.identity as { guestId: string }).guestId,
      blackName: 'Luis',
    });

    await play(gameId, white, black, 'f2f3', 1);
    await play(gameId, black, white, 'e7e5', 2);
    await play(gameId, white, black, 'g2g4', 3);
    const end = next(white, 'game:end');
    black.emit('game:move', { gameId, uci: 'd8h4', ply: 4 });
    expect(await end).toEqual({ gameId, result: '0-1', termination: 'checkmate' });
    await drained(gameId);

    await expectMovesStored(gameId, [1, 2, 3, 4]);
    expect(await mongo().findOne({ gameId })).toMatchObject({ status: 'finished' });
    expect(await prisma().game.findUniqueOrThrow({ where: { id: gameId } })).toMatchObject({
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      finishedAt: expect.any(Date),
    });
  });

  it('keeps moves sent in a burst in order, with no gaps', async () => {
    const { gameId, white, black } = await twoPlayers();
    const script = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'];
    for (const [index, uci] of script.entries()) {
      const ply = index + 1;
      const [mover, observer] = ply % 2 === 1 ? [white, black] : [black, white];
      await play(gameId, mover!, observer!, uci, ply);
    }
    await drained(gameId);
    await expectMovesStored(gameId, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('survives a server restart: same seats and moves, and the game goes on', async () => {
    const { gameId, ana, luis, white, black } = await twoPlayers();
    await play(gameId, white, black, 'e2e4', 1);
    await play(gameId, black, white, 'e7e5', 2);
    await drained(gameId);

    await stop();
    await start();

    const whiteBack = await connect(ana.token);
    expect(await join(whiteBack, gameId)).toMatchObject({ status: 'active', yourColor: 'white', plyCount: 2 });
    const blackBack = await connect(luis.token);
    const blackState = await join(blackBack, gameId, (s) => s.yourColor === 'black');
    expect(blackState.moves.map((m) => m.uci)).toEqual(['e2e4', 'e7e5']);

    await play(gameId, whiteBack, blackBack, 'g1f3', 3);
    await drained(gameId);
    await expectMovesStored(gameId, [1, 2, 3]);
  });

  it('serves a finished game after a restart, and it stays finished', async () => {
    const { gameId, ana, white, black } = await twoPlayers();
    const end = next(black, 'game:end');
    white.emit('game:resign', { gameId });
    await end;
    await drained(gameId);

    await stop();
    await start();

    const back = await connect(ana.token);
    expect(await join(back, gameId)).toMatchObject({ status: 'finished', yourColor: 'white' });
    const error = next<{ code: string }>(back, 'game:error');
    back.emit('game:move', { gameId, uci: 'e2e4', ply: 1 });
    expect((await error).code).toBe('unauthorized');
  });
});
