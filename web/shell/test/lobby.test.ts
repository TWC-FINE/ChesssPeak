import { describe, expect, it, vi } from 'vitest';
import type { OpenGame } from '@chessspeak/shared';
import { ApiError } from '../src/api.js';
import { ageText, describeOpenGame, fetchOpenGames } from '../src/lobby.js';

const NOW = Date.parse('2026-11-20T10:30:00.000Z');
const game = (over: Partial<OpenGame> = {}): OpenGame => ({ gameId: 'g1', creator: 'Ana', creatorColor: 'white', createdAt: '2026-11-20T10:18:00.000Z', ...over });

const answering = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

describe('fetchOpenGames', () => {
  it('reads GET /games/open without a token', async () => {
    const fetcher = answering(200, { games: [game()] });
    await expect(fetchOpenGames('http://api', fetcher)).resolves.toEqual([game()]);
    expect((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual(['http://api/games/open']);
  });

  it('turns a failure, a server error and a reply outside the contract into a message', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    await expect(fetchOpenGames('http://api', down)).rejects.toThrow('No se pudo conectar');
    await expect(fetchOpenGames('http://api', answering(503))).rejects.toThrow('No se pudieron leer');
    await expect(fetchOpenGames('http://api', answering(200, { games: [{ gameId: 'g1' }] }))).rejects.toBeInstanceOf(ApiError);
  });
});

describe('describeOpenGame', () => {
  it('says who waits, the color of whoever joins, the clock and the age', () => {
    expect(describeOpenGame(game(), NOW)).toBe('Ana · juegas con negras · sin reloj · hace 12 min');
    expect(describeOpenGame(game({ creatorColor: 'black', clockMs: 180_000 }), NOW)).toBe('Ana · juegas con blancas · 3 min · hace 12 min');
    expect(describeOpenGame(game({ clockMs: 180_000, incrementMs: 2_000 }), NOW)).toContain('· 3 min + 2 s ·');
  });

  it('says "hace un momento" during the first minute', () => {
    expect(ageText('2026-11-20T10:29:30.000Z', NOW)).toBe('hace un momento');
    expect(ageText('2026-11-20T10:29:00.000Z', NOW)).toBe('hace 1 min');
  });
});
