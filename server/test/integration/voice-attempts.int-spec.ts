import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { GameState, GuestAuthResponse, VoiceAttemptPayload } from '@chessspeak/shared';
import type { Connection } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

// Runs against the local _test databases (pnpm test:integration refuses anything else).
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const saved = { ...process.env };
const sockets: Socket[] = [];
let app: NestExpressApplication | undefined;
let url: string;

const http = () => request(app!.getHttpServer());
const collection = () => app!.get<Connection>(getConnectionToken(), { strict: false }).collection('voice_attempts');

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

function connect(token: string): Promise<Socket> {
  const socket = io(url, { auth: { token, v: 1 }, transports: ['websocket'], reconnection: false, forceNew: true });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** A signed-in guest whose socket joined a new game of their own. */
async function playerInGame() {
  const { token, identity } = (await http().post('/auth/guest').set('X-Forwarded-For', `voice-${Math.random()}`).send({ displayName: 'Ana' }).expect(201)).body as GuestAuthResponse;
  const { gameId } = (await http().post('/games').set('Authorization', `Bearer ${token}`).send({ color: 'white' }).expect(201)).body as { gameId: string };
  const socket = await connect(token);
  const state = new Promise<GameState>((resolve) => socket.once('game:state', resolve));
  socket.emit('game:join', { gameId });
  await state;
  return { socket, gameId, guestId: (identity as { guestId: string }).guestId };
}

const attempt = (gameId: string, overrides: Partial<VoiceAttemptPayload> = {}): VoiceAttemptPayload => ({
  gameId,
  ply: 1,
  fen: START_FEN,
  lang: 'es-CO',
  recognizer: 'webspeech',
  alternatives: [{ transcript: 'peón e cuatro', confidence: 0.9 }],
  transcript: 'peón e cuatro',
  normalized: 'peon e cuatro',
  candidates: [{ uci: 'e2e4', score: 0 }],
  resolvedUci: 'e2e4',
  outcome: 'move',
  accepted: true,
  tryIndex: 1,
  latency: { recognitionMs: 500, resolveMs: 2, totalMs: 502 },
  session: 'play',
  ...overrides,
});

/** Messages of one socket are handled in order: when the marker arrives, whatever was sent before it has been decided. */
async function documentsUpTo(gameId: string, tryIndex: number) {
  for (let attemptNumber = 0; attemptNumber < 100; attemptNumber++) {
    const documents = await collection().find({ gameId }).toArray();
    if (documents.some((document) => document.tryIndex === tryIndex)) return documents;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no document with tryIndex ${tryIndex}`);
}

describe('voice:attempt (real MongoDB and a real socket)', () => {
  beforeEach(start);

  afterEach(async () => {
    await stop();
    process.env = { ...saved };
  });

  it('stores the attempt with the player of the token, a server date and no audio', async () => {
    const { socket, gameId, guestId } = await playerInGame();
    socket.emit('voice:attempt', attempt(gameId));
    const [document] = await documentsUpTo(gameId, 1);
    expect(document).toMatchObject({ gameId, player: guestId, transcript: 'peón e cuatro', accepted: true, recognizer: 'webspeech' });
    expect(document!.createdAt).toBeInstanceOf(Date);
    expect(document).not.toHaveProperty('audio');
  });

  it('stores a silence, with an empty transcript', async () => {
    const { socket, gameId } = await playerInGame();
    socket.emit('voice:attempt', attempt(gameId, { transcript: '', normalized: '', alternatives: [], candidates: [], resolvedUci: null, outcome: 'nomatch', accepted: false }));
    const [document] = await documentsUpTo(gameId, 1);
    expect(document).toMatchObject({ transcript: '', normalized: '', outcome: 'nomatch', accepted: false, resolvedUci: null });
  });

  it('drops what it must refuse, without a game:error, and the game goes on', async () => {
    const { socket, gameId, guestId } = await playerInGame();
    const errors: unknown[] = [];
    socket.on('game:error', (error) => errors.push(error));

    socket.emit('voice:attempt', { ...attempt(gameId, { tryIndex: 2 }), player: 'someone-else' });
    socket.emit('voice:attempt', { ...attempt(gameId, { tryIndex: 3 }), audio: 'UklGRg==' });
    socket.emit('voice:attempt', attempt(gameId, { tryIndex: 4, transcript: 'x'.repeat(9000) }));
    socket.emit('voice:attempt', attempt('22222222-2222-4222-8222-222222222222', { tryIndex: 5 }));
    socket.emit('voice:attempt', attempt(gameId, { tryIndex: 1 }));

    const documents = await documentsUpTo(gameId, 1);
    expect(documents.map((document) => document.tryIndex)).toEqual([1]);
    expect(documents[0]).toMatchObject({ player: guestId });
    expect(await collection().countDocuments({ tryIndex: 5, session: 'play', gameId: '22222222-2222-4222-8222-222222222222' })).toBe(0);
    expect(errors).toEqual([]);

    // a game needs its second player before anyone can move
    const rival = (await http().post('/auth/guest').set('X-Forwarded-For', `voice-${Math.random()}`).send({ displayName: 'Luis' }).expect(201)).body as GuestAuthResponse;
    const black = await connect(rival.token);
    const joined = new Promise<GameState>((resolve) => black.once('game:state', resolve));
    black.emit('game:join', { gameId });
    await joined;

    const moved = new Promise<{ ply: number }>((resolve) => socket.once('game:moved', resolve));
    socket.emit('game:move', { gameId, uci: 'e2e4', ply: 1 });
    expect(await moved).toMatchObject({ ply: 1 });
    expect(errors).toEqual([]);
  });

  it('applies the limit per connection from VOICE_ATTEMPT_LIMIT_PER_MINUTE', async () => {
    await stop();
    process.env.VOICE_ATTEMPT_LIMIT_PER_MINUTE = '2';
    await start();
    const { socket, gameId } = await playerInGame();
    for (const tryIndex of [1, 2, 3, 4]) socket.emit('voice:attempt', attempt(gameId, { tryIndex }));
    await documentsUpTo(gameId, 2);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const documents = await collection().find({ gameId }).toArray();
    expect(documents.map((document) => document.tryIndex).sort()).toEqual([1, 2]);
  });
});
