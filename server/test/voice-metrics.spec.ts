import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { VoiceAttemptPayload } from '@chessspeak/shared';
import type { VoiceAttemptsRepository } from '../src/database/mongo/voice-attempts.repository';
import { voiceAttemptLimitPerMinute, voiceAttemptMaxBytes } from '../src/deploy-config';
import type { GameSocket } from '../src/games/game.gateway';
import { VoiceMetricsGateway } from '../src/voice-metrics/voice-metrics.gateway';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const attempt = (overrides: Partial<VoiceAttemptPayload> = {}): VoiceAttemptPayload => ({
  gameId: GAME_ID,
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

function socketIn(games: string[] = [GAME_ID]) {
  const emit = jest.fn();
  const socket = { data: { identity: { kind: 'guest', guestId: 'guest-1', displayName: 'Ana' }, games: new Set(games) }, emit } as unknown as GameSocket;
  return { socket, emit };
}

function gatewayWith(save: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  return { gateway: new VoiceMetricsGateway({ save } as unknown as VoiceAttemptsRepository), save };
}

describe('voice:attempt', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('saves the attempt with the player of the token', async () => {
    const { gateway, save } = gatewayWith();
    await gateway.record(socketIn().socket, attempt());
    expect(save).toHaveBeenCalledWith(attempt(), 'guest-1');
  });

  it('keeps an attempt with an empty transcript: a silence is still an attempt', async () => {
    const { gateway, save } = gatewayWith();
    await gateway.record(socketIn().socket, attempt({ transcript: '', normalized: '', alternatives: [], candidates: [], resolvedUci: null, outcome: 'nomatch', accepted: false }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a player sent by the client', { player: 'someone-else' }],
    ['audio', { audio: 'UklGRg==' }],
  ])('drops a message with %s', async (_name, extra) => {
    const { gateway, save } = gatewayWith();
    await gateway.record(socketIn().socket, { ...attempt(), ...extra });
    expect(save).not.toHaveBeenCalled();
  });

  it('drops an attempt for a game the socket did not join', async () => {
    const { gateway, save } = gatewayWith();
    await gateway.record(socketIn([]).socket, attempt());
    expect(save).not.toHaveBeenCalled();
  });

  it('drops a message above VOICE_ATTEMPT_MAX_BYTES, checking bytes and not characters', async () => {
    process.env.VOICE_ATTEMPT_MAX_BYTES = String(Buffer.byteLength(JSON.stringify(attempt())) + 10);
    const { gateway, save } = gatewayWith();
    await gateway.record(socketIn().socket, attempt({ transcript: 'ñ'.repeat(30) }));
    expect(save).not.toHaveBeenCalled();
    await gateway.record(socketIn().socket, attempt());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps VOICE_ATTEMPT_LIMIT_PER_MINUTE per connection and starts again in the next minute', async () => {
    process.env.VOICE_ATTEMPT_LIMIT_PER_MINUTE = '2';
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { gateway, save } = gatewayWith();
    const first = socketIn().socket;
    for (let i = 0; i < 4; i++) await gateway.record(first, attempt());
    expect(save).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);

    await gateway.record(socketIn().socket, attempt());
    expect(save).toHaveBeenCalledTimes(3);

    now.mockReturnValue(1_060_000);
    await gateway.record(first, attempt());
    expect(save).toHaveBeenCalledTimes(4);
  });

  it('logs and goes on when the database fails', async () => {
    const { gateway } = gatewayWith(jest.fn().mockRejectedValue(new Error('mongo down')));
    await expect(gateway.record(socketIn().socket, attempt())).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith('voice:attempt not saved: mongo down');
  });

  it.each([
    ['saved', attempt()],
    ['invalid', { nonsense: true }],
    ['not an object', 'text'],
    ['missing', undefined],
  ])('never answers the client: %s', async (_name, payload) => {
    const { gateway } = gatewayWith();
    const { socket, emit } = socketIn();
    await gateway.record(socket, payload);
    expect(emit).not.toHaveBeenCalled();
  });

  it('never logs what the player said', async () => {
    const { gateway } = gatewayWith();
    await gateway.record(socketIn([]).socket, attempt({ transcript: 'frase privada' }));
    const logged = JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls);
    expect(logged).not.toContain('frase privada');
  });
});

describe('voice:attempt limits', () => {
  it('read the variables and keep the defaults otherwise', () => {
    expect(voiceAttemptMaxBytes({ VOICE_ATTEMPT_MAX_BYTES: '100' })).toBe(100);
    expect(voiceAttemptMaxBytes({})).toBe(8192);
    expect(voiceAttemptMaxBytes({ VOICE_ATTEMPT_MAX_BYTES: '0' })).toBe(8192);
    expect(voiceAttemptMaxBytes({ VOICE_ATTEMPT_MAX_BYTES: '1.5' })).toBe(8192);
    expect(voiceAttemptLimitPerMinute({ VOICE_ATTEMPT_LIMIT_PER_MINUTE: '5' })).toBe(5);
    expect(voiceAttemptLimitPerMinute({})).toBe(30);
    expect(voiceAttemptLimitPerMinute({ VOICE_ATTEMPT_LIMIT_PER_MINUTE: 'nope' })).toBe(30);
  });
});
