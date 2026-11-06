import { describe, expect, it } from 'vitest';
import { readConfig, timeoutMs } from '../src/config.js';
import { mockContext } from '../src/mocks.js';
import { gameIdOf, parseRoute } from '../src/router.js';

describe('parseRoute', () => {
  it('parses the home and game routes', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/game/abc-1')).toEqual({ name: 'game', id: 'abc-1' });
    expect(gameIdOf(parseRoute('#/game/abc-1'))).toBe('abc-1');
    expect(gameIdOf(parseRoute('#/'))).toBeNull();
  });

  it('flags anything else as not found', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', hash: '#/nope' });
    expect(parseRoute('#/game/')).toMatchObject({ name: 'not-found' });
  });
});

describe('simulated contexts and config', () => {
  it('gives each microfrontend a versioned context', () => {
    expect(mockContext('mf-game', 'x')).toEqual({ v: 1, gameId: 'x', orientation: 'white', socket: null });
    // no releaseDelayMs: <mf-voice-input> takes DEFAULT_RELEASE_DELAY_MS from shared
    expect(mockContext('mf-voice-input', null, 'http://127.0.0.1:8765')).toEqual({ v: 1, gameId: null, lang: 'es-CO', recognizer: 'webspeech', agentUrl: 'http://127.0.0.1:8765' });
    expect(mockContext('mf-history', 'x')).toEqual({ v: 1, gameId: 'x' });
    expect(mockContext('other', null)).toBeUndefined();
  });

  it('reads the public config with safe defaults', () => {
    expect(timeoutMs(readConfig(undefined))).toBe(5000);
    expect(timeoutMs(readConfig({ PUBLIC_MF_TIMEOUT_MS: '800' }))).toBe(800);
    expect(timeoutMs(readConfig({ PUBLIC_MF_TIMEOUT_MS: 'x' }))).toBe(5000);
  });
});
