import { describe, expect, it } from 'vitest';
import type { GameSocket } from '@chessspeak/shared';
import { readConfig, timeoutMs } from '../src/config.js';
import { contextFor } from '../src/contexts.js';
import { gameIdOf, parseRoute } from '../src/router.js';

describe('parseRoute', () => {
  it('parses the home and game routes', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/game/abc-1')).toEqual({ name: 'game', id: 'abc-1' });
    expect(gameIdOf(parseRoute('#/game/abc-1'))).toBe('abc-1');
    expect(gameIdOf(parseRoute('#/'))).toBeNull();
  });

  it('parses the ranking route, which has no game', () => {
    expect(parseRoute('#/ranking')).toEqual({ name: 'ranking' });
    expect(parseRoute('#/ranking/')).toEqual({ name: 'ranking' });
    expect(gameIdOf(parseRoute('#/ranking'))).toBeNull();
    expect(parseRoute('#/ranking/ana')).toMatchObject({ name: 'not-found' });
  });

  it('flags anything else as not found', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', hash: '#/nope' });
    expect(parseRoute('#/game/')).toMatchObject({ name: 'not-found' });
  });
});

describe('contexts and config', () => {
  const socket = {} as GameSocket;

  it('gives each microfrontend a versioned context', () => {
    expect(contextFor('mf-game', 'x', null, null)).toEqual({ v: 1, gameId: 'x', orientation: 'white', socket: null });
    // no releaseDelayMs: <mf-voice-input> takes DEFAULT_RELEASE_DELAY_MS from shared
    expect(contextFor('mf-voice-input', null, 'http://127.0.0.1:8765', null)).toEqual({ v: 1, gameId: null, lang: 'es-CO', recognizer: 'webspeech', agentUrl: 'http://127.0.0.1:8765' });
    expect(contextFor('mf-history', 'x', null, null)).toEqual({ v: 1, gameId: 'x' });
    expect(contextFor('other', null, null, null)).toBeUndefined();
  });

  it('gives the socket only to <mf-game> (least privilege)', () => {
    expect(contextFor('mf-game', 'x', null, socket)).toMatchObject({ socket });
    expect(contextFor('mf-voice-input', 'x', null, socket)).not.toHaveProperty('socket');
    expect(contextFor('mf-history', 'x', null, socket)).not.toHaveProperty('socket');
    expect(contextFor('mf-ranking', 'x', null, socket, { apiUrl: 'http://127.0.0.1:3000', active: true })).not.toHaveProperty('socket');
  });

  it('tells <mf-ranking> where the server is and whether its route is on screen, and nothing else', () => {
    expect(contextFor('mf-ranking', 'x', 'http://127.0.0.1:8765', null, { apiUrl: 'http://127.0.0.1:3000', active: true })).toEqual({
      v: 1,
      apiUrl: 'http://127.0.0.1:3000',
      active: true,
    });
    // without a ranking view the element stays idle and asks nothing
    expect(contextFor('mf-ranking', null, null, null)).toEqual({ v: 1, apiUrl: null, active: false });
  });

  it('reads the public config with safe defaults', () => {
    expect(timeoutMs(readConfig(undefined))).toBe(5000);
    expect(timeoutMs(readConfig({ PUBLIC_MF_TIMEOUT_MS: '800' }))).toBe(800);
    expect(timeoutMs(readConfig({ PUBLIC_MF_TIMEOUT_MS: 'x' }))).toBe(5000);
  });
});
