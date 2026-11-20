import { describe, expect, it } from 'vitest';
import { BASE_TITLE, followTurn, titleFor } from '../src/turn-title.js';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const position = (over: object = {}) => ({ v: 1 as const, gameId: 'g1', fen: FEN, plyCount: 0, turn: 'white' as const, yourColor: 'white' as const, status: 'active' as const, ...over });

describe('titleFor', () => {
  it('tells a seated player whose turn it is', () => {
    expect(titleFor(position(), false)).toBe(`● Te toca · ${BASE_TITLE}`);
    expect(titleFor(position({ yourColor: 'black' }), false)).toBe(`Turno del rival · ${BASE_TITLE}`);
  });

  it('keeps the plain title without a game, for a spectator, and when the game is not live', () => {
    expect(titleFor(undefined, false)).toBe(BASE_TITLE);
    expect(titleFor(position({ yourColor: 'spectator' }), false)).toBe(BASE_TITLE);
    expect(titleFor(position({ status: 'waiting' }), false)).toBe(BASE_TITLE);
    expect(titleFor(position({ status: 'finished' }), false)).toBe(BASE_TITLE);
    expect(titleFor(position(), true)).toBe(BASE_TITLE);
  });

  it('trusts an older mf-game that does not send the status', () => {
    const { status: _status, ...withoutStatus } = position();
    expect(titleFor(withoutStatus, false)).toBe(`● Te toca · ${BASE_TITLE}`);
  });
});

describe('followTurn', () => {
  const send = (target: EventTarget, name: string, detail: unknown) => target.dispatchEvent(new CustomEvent(name, { detail }));

  it('follows the game on screen, its end and the route', () => {
    const target = new EventTarget();
    const titles: string[] = [];
    let route: string | null = 'g1';
    const update = followTurn(target, () => route, (title) => titles.push(title));
    send(target, 'cs:position', position());
    send(target, 'cs:position', position({ turn: 'black', plyCount: 1 }));
    send(target, 'cs:game-ended', { v: 1, gameId: 'g1', result: '0-1', termination: 'resignation' });
    expect(titles).toEqual([`● Te toca · ${BASE_TITLE}`, `Turno del rival · ${BASE_TITLE}`, BASE_TITLE]);
    route = null;
    update();
    expect(titles.at(-1)).toBe(BASE_TITLE);
  });

  it('ignores another game and events that break the contract', () => {
    const target = new EventTarget();
    const titles: string[] = [];
    followTurn(target, () => 'g2', (title) => titles.push(title));
    send(target, 'cs:position', position());
    send(target, 'cs:position', { v: 2 });
    send(target, 'cs:game-ended', null);
    expect(titles).toEqual([BASE_TITLE]);
  });
});
