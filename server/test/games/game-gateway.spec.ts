import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Global, Logger, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { gameEndSchema, gameErrorSchema, gameMovedSchema, gameStateSchema, type Color, type GameEnd, type GameState, type GuestAuthResponse } from '@chessspeak/shared';
import { io, type Socket } from 'socket.io-client';
import { GuestTokenService } from '../../src/auth/guest-token.service';
import { GameMovesRepository } from '../../src/database/mongo/game-moves.repository';
import { GameMoves, type StoredMove } from '../../src/database/mongo/game-moves.schema';
import { PrismaService } from '../../src/database/prisma.service';
import type { RoomPlayer, RoomSnapshot } from '../../src/games/game-room';
import { GameStore } from '../../src/games/game-store';
import { GamesModule } from '../../src/games/games.module';
import { MOVE_PERSISTENCE } from '../../src/games/move-persistence/move-persistence';
import { PerGameQueue } from '../../src/games/per-game-queue';

const SECRET = 'a'.repeat(64);
const originalEnv = { secret: process.env.GUEST_TOKEN_SECRET, abandon: process.env.ABANDON_TIMEOUT_MS };

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    { provide: GameMovesRepository, useValue: {} },
    { provide: getModelToken(GameMoves.name), useValue: {} },
  ],
  exports: [PrismaService, GameMovesRepository, getModelToken(GameMoves.name)],
})
class FakeInfraModule {}

/** What the stores would hold, kept between app restarts. */
class World {
  snapshots = new Map<string, RoomSnapshot>();
  saved: Array<{ gameId: string; move: StoredMove }> = [];
  ended: Array<{ end: GameEnd; status: string }> = [];
  activated: Array<{ gameId: string; color: Color; player: RoomPlayer }> = [];
  saveDelayMs = 0;
  failSaves = 0;

  store = {
    load: async (gameId: string): Promise<RoomSnapshot | null> => {
      const snapshot = this.snapshots.get(gameId);
      if (snapshot === undefined) return null;
      const moves = this.saved.filter((s) => s.gameId === gameId).map(({ move }) => ({ ply: move.ply, uci: move.uci }));
      const end = this.ended.find((e) => e.end.gameId === gameId)?.end;
      const joined = this.activated.find((a) => a.gameId === gameId);
      return {
        ...snapshot,
        seats: joined === undefined ? snapshot.seats : { ...snapshot.seats, [joined.color]: joined.player },
        moves,
        ...(end === undefined ? {} : { end }),
      };
    },
    activate: async (gameId: string, color: Color, player: RoomPlayer) => void this.activated.push({ gameId, color, player }),
    finish: async (end: GameEnd, status: string) => void this.ended.push({ end, status }),
  };

  persistence = {
    save: async (gameId: string, move: StoredMove) => {
      if (this.failSaves > 0) {
        this.failSaves--;
        throw new Error('mongo down');
      }
      if (this.saveDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.saveDelayMs));
      this.saved.push({ gameId, move });
      return { outcome: 'applied' as const };
    },
  };
}

interface Server {
  app: NestExpressApplication;
  url: string;
  guest(name: string): GuestAuthResponse;
  queue: PerGameQueue;
}

const apps: NestExpressApplication[] = [];
const sockets: Socket[] = [];
let world: World;

async function start(): Promise<Server> {
  const queue = new PerGameQueue({ initialDelayMs: 1, maxDelayMs: 2 });
  const moduleRef = await Test.createTestingModule({ imports: [FakeInfraModule, GamesModule] })
    .overrideProvider(GameStore)
    .useValue(world.store)
    .overrideProvider(MOVE_PERSISTENCE)
    .useValue(world.persistence)
    .overrideProvider(PerGameQueue)
    .useValue(queue)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  apps.push(app);
  const { port } = app.getHttpServer().address() as AddressInfo;
  const tokens = app.get(GuestTokenService, { strict: false });
  return { app, url: `http://127.0.0.1:${port}`, guest: (name) => tokens.issue(name), queue };
}

const connectWith = (url: string, auth: object): Socket => {
  const socket = io(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return socket;
};

function connected(url: string, token: string): Promise<Socket> {
  const socket = connectWith(url, { token, v: 1 });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** The next event of that name that passes the check. */
function next<T>(socket: Socket, event: string, check: (payload: T) => boolean = () => true, ms = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    const listener = (payload: T): void => {
      if (!check(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

const stateOf = async (socket: Socket, check: (state: GameState) => boolean = () => true) => gameStateSchema.parse(await next<GameState>(socket, 'game:state', check));
const errorOf = async (socket: Socket) => gameErrorSchema.parse(await next(socket, 'game:error'));

function seedGame(creator: GuestAuthResponse, color: Color = 'white'): string {
  const gameId = randomUUID();
  const identity = creator.identity as { guestId: string; displayName: string };
  const seat = { id: identity.guestId, displayName: identity.displayName };
  world.snapshots.set(gameId, { gameId, seats: { white: color === 'white' ? seat : null, black: color === 'black' ? seat : null }, moves: [] });
  return gameId;
}

/** Two players joined, with white being the creator. */
async function activeGame(server: Server) {
  const ana = server.guest('Ana');
  const luis = server.guest('Luis');
  const gameId = seedGame(ana);
  const white = await connected(server.url, ana.token);
  const firstState = stateOf(white, (s) => s.status === 'waiting');
  white.emit('game:join', { gameId });
  await firstState;
  const black = await connected(server.url, luis.token);
  const active = stateOf(black, (s) => s.status === 'active');
  const whiteActive = stateOf(white, (s) => s.status === 'active');
  black.emit('game:join', { gameId });
  await Promise.all([active, whiteActive]);
  return { gameId, ana, luis, white, black };
}

async function play(gameId: string, socket: Socket, observer: Socket, uci: string, ply: number) {
  const moved = next<{ ply: number }>(observer, 'game:moved', (m) => m.ply === ply);
  socket.emit('game:move', { gameId, uci, ply });
  return gameMovedSchema.parse(await moved);
}

beforeEach(() => {
  process.env.GUEST_TOKEN_SECRET = SECRET;
  delete process.env.ABANDON_TIMEOUT_MS;
  world = new World();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (originalEnv.secret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalEnv.secret;
  if (originalEnv.abandon === undefined) delete process.env.ABANDON_TIMEOUT_MS;
  else process.env.ABANDON_TIMEOUT_MS = originalEnv.abandon;
  jest.restoreAllMocks();
});

describe('handshake', () => {
  it.each<[string, (token: string) => object]>([
    ['no auth', () => ({})],
    ['an invalid token', () => ({ token: 'not-a-token', v: 1 })],
    ['another protocol version', (token) => ({ token, v: 2 })],
    ['an extra field', (token) => ({ token, v: 1, color: 'white' })],
  ])('rejects %s', async (_case, auth) => {
    const server = await start();
    const socket = connectWith(server.url, auth(server.guest('Ana').token));
    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('accepts a valid token', async () => {
    const server = await start();
    await expect(connected(server.url, server.guest('Ana').token)).resolves.toBeDefined();
  });
});

describe('game:join', () => {
  it('gives the creator the reserved seat, and the game waits', async () => {
    const server = await start();
    const ana = server.guest('Ana');
    const gameId = seedGame(ana, 'black');
    const socket = await connected(server.url, ana.token);
    const state = stateOf(socket);
    socket.emit('game:join', { gameId });

    expect(await state).toMatchObject({ gameId, status: 'waiting', yourColor: 'black', plyCount: 0, seats: { white: null, black: { displayName: 'Ana', connected: true } } });
    expect(world.activated).toEqual([]);
  });

  it('gives the second identity the free seat, activates the game and tells each player their color', async () => {
    const server = await start();
    const { gameId, white, black, luis } = await activeGame(server);
    const again = stateOf(white);
    const blackAgain = stateOf(black);
    white.emit('game:join', { gameId });
    black.emit('game:join', { gameId });

    expect((await again).yourColor).toBe('white');
    expect((await blackAgain).yourColor).toBe('black');
    await server.queue.drained(gameId);
    expect(world.activated).toEqual([{ gameId, color: 'black', player: { id: (luis.identity as { guestId: string }).guestId, displayName: 'Luis' } }]);
  });

  it('refuses a third identity', async () => {
    const server = await start();
    const { gameId } = await activeGame(server);
    const third = await connected(server.url, server.guest('Eva').token);
    const error = errorOf(third);
    third.emit('game:join', { gameId });
    expect((await error).code).toBe('unauthorized');
  });

  it.each([['an unknown game', randomUUID()], ['an id that is not a game', 'nope']])('answers not_found for %s', async (_case, gameId) => {
    const server = await start();
    const socket = await connected(server.url, server.guest('Ana').token);
    const error = errorOf(socket);
    socket.emit('game:join', { gameId });
    expect((await error).code).toBe('not_found');
  });

  it('answers not_found when the stores fail, and tries again on the next join', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const server = await start();
    const ana = server.guest('Ana');
    const gameId = seedGame(ana);
    const load = world.store.load;
    world.store.load = async () => {
      throw new Error('postgres down');
    };
    const socket = await connected(server.url, ana.token);
    const error = errorOf(socket);
    socket.emit('game:join', { gameId });
    expect((await error).code).toBe('not_found');

    world.store.load = load;
    const state = stateOf(socket);
    socket.emit('game:join', { gameId });
    expect((await state).status).toBe('waiting');
  });

  it('rejects a client that sends its own color', async () => {
    const server = await start();
    const ana = server.guest('Ana');
    const socket = await connected(server.url, ana.token);
    const error = errorOf(socket);
    socket.emit('game:join', { gameId: seedGame(ana), color: 'white' });
    expect((await error).code).toBe('unauthorized');
  });
});

describe('game:move', () => {
  it('tells both players, and saves what GameRoom produced', async () => {
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    const seenByWhite = next<{ ply: number; san: string }>(white, 'game:moved');
    const moved = await play(gameId, white, black, 'e2e4', 1);

    expect(moved).toMatchObject({ gameId, ply: 1, uci: 'e2e4', san: 'e4' });
    expect(await seenByWhite).toEqual(moved);
    await server.queue.drained(gameId);
    expect(world.saved).toEqual([{ gameId, move: { ply: 1, uci: 'e2e4', san: 'e4', fen: moved.fen, at: expect.any(Date) } }]);
  });

  it.each<[string, (g: string) => object, string]>([
    ['a repeated ply', (gameId) => ({ gameId, uci: 'e2e4', ply: 2 }), 'stale_ply'],
    ['an illegal move', (gameId) => ({ gameId, uci: 'e2e5', ply: 1 }), 'illegal'],
    ['a malformed move', (gameId) => ({ gameId, uci: 'hello', ply: 1 }), 'unauthorized'],
    ['an extra field', (gameId) => ({ gameId, uci: 'e2e4', ply: 1, player: 'someone' }), 'unauthorized'],
  ])('refuses %s, and saves nothing', async (_case, payload, code) => {
    const server = await start();
    const { gameId, white } = await activeGame(server);
    const error = errorOf(white);
    white.emit('game:move', payload(gameId));
    expect((await error).code).toBe(code);
    await server.queue.drained(gameId);
    expect(world.saved).toEqual([]);
  });

  it('refuses a move out of turn', async () => {
    const server = await start();
    const { gameId, black } = await activeGame(server);
    const error = errorOf(black);
    black.emit('game:move', { gameId, uci: 'e7e5', ply: 1 });
    expect((await error).code).toBe('not_your_turn');
  });

  it('refuses a move before joining', async () => {
    const server = await start();
    const { gameId, ana } = await activeGame(server);
    const otherTab = await connected(server.url, ana.token);
    const error = errorOf(otherTab);
    otherTab.emit('game:move', { gameId, uci: 'e2e4', ply: 1 });
    expect((await error).code).toBe('unauthorized');
  });

  it('refuses a move while the game waits for the second player', async () => {
    const server = await start();
    const ana = server.guest('Ana');
    const gameId = seedGame(ana);
    const socket = await connected(server.url, ana.token);
    const state = stateOf(socket);
    socket.emit('game:join', { gameId });
    await state;
    const error = errorOf(socket);
    socket.emit('game:move', { gameId, uci: 'e2e4', ply: 1 });
    expect((await error).code).toBe('unauthorized');
  });

  it('saves in order even when the first write is slow, and retries a failed one', async () => {
    const server = await start();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { gameId, white, black } = await activeGame(server);
    world.saveDelayMs = 30;
    world.failSaves = 2;
    await play(gameId, white, black, 'e2e4', 1);
    await play(gameId, black, white, 'e7e5', 2);
    await play(gameId, white, black, 'g1f3', 3);
    await server.queue.drained(gameId);

    expect(world.saved.map(({ move }) => move.ply)).toEqual([1, 2, 3]);
  });
});

describe('end of the game', () => {
  it('ends in checkmate for both players and stores it after the last move', async () => {
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    await play(gameId, white, black, 'f2f3', 1);
    await play(gameId, black, white, 'e7e5', 2);
    await play(gameId, white, black, 'g2g4', 3);
    const whiteEnd = next(white, 'game:end');
    const blackEnd = next(black, 'game:end');
    black.emit('game:move', { gameId, uci: 'd8h4', ply: 4 });

    const end = { gameId, result: '0-1', termination: 'checkmate' };
    expect(gameEndSchema.parse(await whiteEnd)).toEqual(end);
    expect(gameEndSchema.parse(await blackEnd)).toEqual(end);
    await server.queue.drained(gameId);
    expect(world.saved.map(({ move }) => move.ply)).toEqual([1, 2, 3, 4]);
    expect(world.ended).toEqual([{ end, status: 'finished' }]);
  });

  it('ends when a player resigns', async () => {
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    const end = next(black, 'game:end');
    white.emit('game:resign', { gameId });
    expect(await end).toEqual({ gameId, result: '0-1', termination: 'resignation' });
  });

  it('refuses a move after the end', async () => {
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    const end = next(black, 'game:end');
    white.emit('game:resign', { gameId });
    await end;
    const error = errorOf(black);
    black.emit('game:move', { gameId, uci: 'e7e5', ply: 1 });
    expect((await error).code).toBe('unauthorized');
  });
});

describe('reconnection', () => {
  it('shows the other player as disconnected, then gives the same seat and every move back', async () => {
    const server = await start();
    const { gameId, luis, white, black } = await activeGame(server);
    await play(gameId, white, black, 'e2e4', 1);

    const gone = stateOf(white, (s) => s.seats.black?.connected === false);
    black.disconnect();
    await gone;

    const back = await connected(server.url, luis.token);
    const state = stateOf(back);
    const seenByWhite = stateOf(white, (s) => s.seats.black?.connected === true);
    back.emit('game:join', { gameId });

    expect(await state).toMatchObject({ yourColor: 'black', plyCount: 1, status: 'active', moves: [{ ply: 1, uci: 'e2e4', san: 'e4' }] });
    await seenByWhite;
    await play(gameId, back, white, 'e7e5', 2);
  });

  it('does not treat closing one of two tabs as leaving', async () => {
    process.env.ABANDON_TIMEOUT_MS = '30';
    const server = await start();
    const { gameId, ana, white, black } = await activeGame(server);
    const secondTab = await connected(server.url, ana.token);
    const state = stateOf(secondTab);
    secondTab.emit('game:join', { gameId });
    await state;
    secondTab.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 80));

    await play(gameId, white, black, 'e2e4', 1);
    expect(world.ended).toEqual([]);
  });

  it('a second join from the same socket is not a second connection', async () => {
    process.env.ABANDON_TIMEOUT_MS = '30';
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    const again = stateOf(black);
    black.emit('game:join', { gameId });
    await again;
    const end = next(white, 'game:end');
    black.disconnect();
    expect(await end).toEqual({ gameId, result: '1-0', termination: 'abandonment' });
  });
});

describe('abandonment', () => {
  it('the absent player loses when the time runs out', async () => {
    process.env.ABANDON_TIMEOUT_MS = '30';
    const server = await start();
    const { gameId, white, black } = await activeGame(server);
    const end = next(white, 'game:end');
    black.disconnect();

    expect(await end).toEqual({ gameId, result: '1-0', termination: 'abandonment' });
    await server.queue.drained(gameId);
    expect(world.ended).toEqual([{ end: { gameId, result: '1-0', termination: 'abandonment' }, status: 'finished' }]);
  });

  it('coming back in time cancels it', async () => {
    process.env.ABANDON_TIMEOUT_MS = '150';
    const server = await start();
    const { gameId, luis, white, black } = await activeGame(server);
    const gone = stateOf(white, (s) => s.seats.black?.connected === false);
    black.disconnect();
    await gone;
    const back = await connected(server.url, luis.token);
    const state = stateOf(back);
    back.emit('game:join', { gameId });
    await state;
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(world.ended).toEqual([]);
    await play(gameId, white, back, 'e2e4', 1);
  });

  it('does not end a game that is still waiting for the second player', async () => {
    process.env.ABANDON_TIMEOUT_MS = '20';
    const server = await start();
    const ana = server.guest('Ana');
    const gameId = seedGame(ana);
    const socket = await connected(server.url, ana.token);
    const state = stateOf(socket);
    socket.emit('game:join', { gameId });
    await state;
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(world.ended).toEqual([]);
  });
});

describe('a server restart', () => {
  it('starts the time of a rival who does not come back', async () => {
    process.env.ABANDON_TIMEOUT_MS = '40';
    const first = await start();
    const { gameId, ana, white, black } = await activeGame(first);
    await play(gameId, white, black, 'e2e4', 1);
    await first.queue.drained(gameId);
    await apps.pop()?.close();

    const second = await start();
    const whiteBack = await connected(second.url, ana.token);
    const end = next(whiteBack, 'game:end');
    whiteBack.emit('game:join', { gameId });
    expect(await end).toEqual({ gameId, result: '1-0', termination: 'abandonment' });
  });

  it('tells the result to whoever comes back to a finished game', async () => {
    const first = await start();
    const { gameId, luis, white, black } = await activeGame(first);
    const ended = next(black, 'game:end');
    white.emit('game:resign', { gameId });
    await ended;
    await first.queue.drained(gameId);
    await apps.pop()?.close();

    const second = await start();
    const back = await connected(second.url, luis.token);
    const state = stateOf(back);
    const end = next(back, 'game:end');
    back.emit('game:join', { gameId });
    expect((await state).status).toBe('finished');
    expect(await end).toEqual({ gameId, result: '0-1', termination: 'resignation' });
  });

  it('rebuilds the game from the stores: same seats, same moves, and it can go on', async () => {
    const first = await start();
    const { gameId, ana, luis, white, black } = await activeGame(first);
    await play(gameId, white, black, 'e2e4', 1);
    await play(gameId, black, white, 'e7e5', 2);
    await first.queue.drained(gameId);
    await apps.pop()?.close();

    const second = await start();
    const whiteBack = await connected(second.url, ana.token);
    const blackBack = await connected(second.url, luis.token);
    const whiteState = stateOf(whiteBack);
    whiteBack.emit('game:join', { gameId });
    expect(await whiteState).toMatchObject({ status: 'active', yourColor: 'white', plyCount: 2 });
    const blackState = stateOf(blackBack, (s) => s.yourColor === 'black');
    blackBack.emit('game:join', { gameId });
    expect((await blackState).moves.map((m) => m.uci)).toEqual(['e2e4', 'e7e5']);

    await play(gameId, whiteBack, blackBack, 'g1f3', 3);
    await second.queue.drained(gameId);
    expect(world.saved.map(({ move }) => move.ply)).toEqual([1, 2, 3]);
  });
});
