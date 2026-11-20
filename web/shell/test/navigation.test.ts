import { describe, expect, it } from 'vitest';
import { followGameRequests } from '../src/navigation.js';
import { gameHash } from '../src/router.js';

const ask = (target: EventTarget, detail: unknown) => target.dispatchEvent(new CustomEvent('cs:open-game', { detail }));

describe('followGameRequests', () => {
  it('opens the route of the game a microfrontend asks for', () => {
    const target = new EventTarget();
    const went: string[] = [];
    followGameRequests(target, (hash) => went.push(hash));
    ask(target, { v: 1, gameId: '3f1c9e2a-7b1d-4c55-9a0e-1f2d3c4b5a69' });
    expect(went).toEqual(['#/game/3f1c9e2a-7b1d-4c55-9a0e-1f2d3c4b5a69']);
  });

  it('ignores a request that breaks the contract or that the router would not open', () => {
    const target = new EventTarget();
    const went: string[] = [];
    followGameRequests(target, (hash) => went.push(hash));
    ask(target, { v: 2, gameId: 'g2' });
    ask(target, { v: 1 });
    ask(target, { v: 1, gameId: '../ranking' });
    ask(target, null);
    expect(went).toEqual([]);
  });

  it('builds the hash of a game', () => {
    expect(gameHash('abc-1')).toBe('#/game/abc-1');
  });
});
