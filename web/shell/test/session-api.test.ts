import { describe, expect, it, vi } from 'vitest';
import type { GuestAuthResponse } from '@chessspeak/shared';
import { ApiError, createGame, signIn } from '../src/api.js';
import { clearSession, loadSession, saveSession } from '../src/session.js';

const session: GuestAuthResponse = { token: 't', identity: { kind: 'guest', guestId: 'g', displayName: 'Ana' } };

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const answering = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('session', () => {
  it('survives a reload', () => {
    const store = memoryStore();
    saveSession(store, session);
    expect(loadSession(store)).toEqual(session);
  });

  it('is gone after clearing it', () => {
    const store = memoryStore();
    saveSession(store, session);
    clearSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it.each([['nothing stored', null], ['broken JSON', '{no'], ['another shape', '{"token":1}']])('is null with %s', (_case, value) => {
    const store = memoryStore();
    if (value !== null) store.setItem('cs-session', value);
    expect(loadSession(store)).toBeNull();
  });

  it('does not break when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSession(blocked)).toBeNull();
    expect(() => saveSession(blocked, session)).not.toThrow();
    expect(() => clearSession(blocked)).not.toThrow();
    expect(loadSession(undefined)).toBeNull();
  });
});

describe('api', () => {
  it('signs in with the name, and sends no token', async () => {
    const fetcher = answering(201, session);
    await expect(signIn('http://api', 'Ana', fetcher)).resolves.toEqual(session);
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('http://api/auth/guest');
    expect(init.body).toBe('{"displayName":"Ana"}');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('creates a game with the token', async () => {
    const fetcher = answering(201, { gameId: 'g1' });
    await expect(createGame('http://api', 'tok', 'black', fetcher)).resolves.toBe('g1');
    const [url, init] = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('http://api/games');
    expect(init.body).toBe('{"color":"black"}');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it.each([
    [400, 'entre 1 y 24'],
    [429, 'Espera un minuto'],
    [503, 'invitados'],
    [500, '500'],
  ])('explains a %i on sign-in', async (status, text) => {
    await expect(signIn('http://api', 'Ana', answering(status))).rejects.toThrow(text);
  });

  it('explains an expired session when creating a game', async () => {
    await expect(createGame('http://api', 'tok', 'white', answering(401))).rejects.toThrow('caducó');
  });

  it('explains a server that cannot be reached', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    }) as unknown as typeof fetch;
    const error = await signIn('http://api', 'Ana', down).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as Error).message).toContain('No se pudo conectar');
  });
});
