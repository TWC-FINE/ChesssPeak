import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientToServerEvents, CsEventName, GameContext, GameSocket, GameState, ServerToClientEvents } from '@chessspeak/shared';
import { fensAfter, turnOf } from '../src/replay.js';

type GameElement = HTMLElement & { context?: GameContext; updateComplete: Promise<boolean> };

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

/** Records what is sent and lets the test play the server. */
function fakeSocket() {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const socket: GameSocket = {
    emit: (event: keyof ClientToServerEvents, ...args: unknown[]) => void sent.push([event, args[0]]),
    on: (event: keyof ServerToClientEvents, listener: (payload: never) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off: (event: keyof ServerToClientEvents, listener?: (payload: never) => void) => {
      if (listener !== undefined) listeners.get(event)?.delete(listener);
    },
  } as unknown as GameSocket;
  const receive = <E extends keyof ServerToClientEvents>(event: E, payload: Parameters<ServerToClientEvents[E]>[0]): void => {
    for (const listener of listeners.get(event) ?? []) listener(payload as never);
  };
  return { socket, sent, receive, count: (event: string) => listeners.get(event)?.size ?? 0 };
}

const state = (over: Partial<GameState> = {}): GameState => ({
  gameId: 'g1',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: [],
  plyCount: 0,
  status: 'active',
  turn: 'white',
  seats: { white: { displayName: 'Ana', connected: true }, black: { displayName: 'Luis', connected: true } },
  yourColor: 'white',
  ...over,
});

const elements: GameElement[] = [];

async function mountGame(socket: GameSocket | null, gameId: string | null = 'g1'): Promise<GameElement> {
  const element = document.createElement('mf-game') as GameElement;
  element.context = { v: 1, gameId, orientation: 'white', socket };
  document.body.append(element);
  elements.push(element);
  await element.updateComplete;
  return element;
}

function listen<K extends CsEventName>(name: K) {
  const seen: unknown[] = [];
  const listener = (event: Event): void => void seen.push((event as CustomEvent).detail);
  document.addEventListener(name, listener);
  cleanups.push(() => document.removeEventListener(name, listener));
  return seen;
}

const cleanups: Array<() => void> = [];

beforeAll(async () => {
  await import('../src/mf-game.js');
});

afterEach(() => {
  for (const element of elements.splice(0)) element.remove();
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe('<mf-game>', () => {
  it('registers its tag', () => {
    expect(customElements.get('mf-game')).toBeDefined();
  });

  it('receives its context through the context property and renders in light DOM', async () => {
    const element = document.createElement('mf-game') as HTMLElement & { context?: GameContext; updateComplete: Promise<boolean> };
    document.body.append(element);
    element.context = { v: 1, gameId: 'abc', orientation: 'black', socket: null };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('abc');
    expect(element.querySelector('.csg-board')).not.toBeNull();
    element.remove();
  });
});

describe('joining', () => {
  it('asks for the game as soon as it has a socket', async () => {
    const { socket, sent } = fakeSocket();
    await mountGame(socket);
    expect(sent).toEqual([['game:join', { gameId: 'g1' }]]);
  });

  it('does not join without a game or without a socket', async () => {
    const first = fakeSocket();
    await mountGame(first.socket, null);
    expect(first.sent).toEqual([]);
    const element = await mountGame(null);
    expect(element.textContent).toContain('Sin conexión');
  });

  it('asks again after a reconnection, with listeners attached only once', async () => {
    const { socket, sent, count } = fakeSocket();
    const element = await mountGame(socket);
    element.context = { v: 1, gameId: 'g1', orientation: 'white', socket: null };
    await element.updateComplete;
    expect(count('game:state')).toBe(0);
    element.context = { v: 1, gameId: 'g1', orientation: 'white', socket };
    await element.updateComplete;

    expect(sent).toEqual([['game:join', { gameId: 'g1' }], ['game:join', { gameId: 'g1' }]]);
    expect(count('game:state')).toBe(1);
  });

  it('stops listening when it leaves the page', async () => {
    const { socket, count } = fakeSocket();
    const element = await mountGame(socket);
    element.remove();
    expect(count('game:state')).toBe(0);
  });
});

describe('what the server says', () => {
  it('announces the position and shows whose turn it is', async () => {
    const positions = listen('cs:position');
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    await element.updateComplete;

    expect(positions).toEqual([{ v: 1, gameId: 'g1', fen: state().fen, plyCount: 0, turn: 'white', yourColor: 'white' }]);
    expect(element.textContent).toContain('Juegas con blancas');
    expect(element.textContent).toContain('Te toca');
    expect(element.textContent).toContain('negras: Luis');
  });

  it('shows the board from the side of the player', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ yourColor: 'black' }));
    await element.updateComplete;
    expect(element.textContent).toContain('orientación: black');
    expect(element.querySelector('.orientation-black')).not.toBeNull();
  });

  it('waits for the second player, and shows who is disconnected', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ status: 'waiting', seats: { white: { displayName: 'Ana', connected: true }, black: null } }));
    await element.updateComplete;
    expect(element.textContent).toContain('Esperando al otro jugador');
    expect(element.textContent).toContain('negras: libre');

    receive('game:state', state({ seats: { white: { displayName: 'Ana', connected: true }, black: { displayName: 'Luis', connected: false } } }));
    await element.updateComplete;
    expect(element.textContent).toContain('Luis (desconectado)');
  });

  it('announces each move of a state with its own FEN', async () => {
    const applied = listen('cs:move-applied');
    const { socket, receive } = fakeSocket();
    await mountGame(socket);
    receive('game:state', state({ fen: AFTER_E5, plyCount: 2, moves: [{ ply: 1, uci: 'e2e4', san: 'e4' }, { ply: 2, uci: 'e7e5', san: 'e5' }] }));
    expect(applied).toEqual([
      { v: 1, gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 },
      { v: 1, gameId: 'g1', ply: 2, uci: 'e7e5', san: 'e5', fen: AFTER_E5 },
    ]);
  });

  it('applies a move and passes the turn', async () => {
    const applied = listen('cs:move-applied');
    const positions = listen('cs:position');
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    receive('game:moved', { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    await element.updateComplete;

    expect(applied.at(-1)).toEqual({ v: 1, gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    expect(positions.at(-1)).toMatchObject({ fen: AFTER_E4, plyCount: 1, turn: 'black' });
    expect(element.textContent).toContain('Le toca a negras');
  });

  it('ignores a move it already has', async () => {
    const applied = listen('cs:move-applied');
    const { socket, receive } = fakeSocket();
    await mountGame(socket);
    receive('game:state', state({ fen: AFTER_E4, plyCount: 1, turn: 'black', moves: [{ ply: 1, uci: 'e2e4', san: 'e4' }] }));
    const before = applied.length;
    receive('game:moved', { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    expect(applied).toHaveLength(before);
  });

  it('asks for the whole state when it missed a move', async () => {
    const { socket, sent, receive } = fakeSocket();
    await mountGame(socket);
    receive('game:state', state());
    receive('game:moved', { gameId: 'g1', ply: 3, uci: 'g1f3', san: 'Nf3', fen: AFTER_E5 });
    expect(sent.at(-1)).toEqual(['game:join', { gameId: 'g1' }]);
  });

  it('ignores another game', async () => {
    const positions = listen('cs:position');
    const { socket, receive } = fakeSocket();
    await mountGame(socket);
    receive('game:state', state({ gameId: 'other' }));
    expect(positions).toEqual([]);
  });

  it('shows the result and announces the end', async () => {
    const ended = listen('cs:game-ended');
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    receive('game:end', { gameId: 'g1', result: '0-1', termination: 'checkmate' });
    await element.updateComplete;
    expect(ended).toEqual([{ v: 1, gameId: 'g1', result: '0-1', termination: 'checkmate' }]);
    expect(element.textContent).toContain('0-1 (jaque mate)');
  });

  it.each([
    ['not_your_turn', 'No es tu turno'],
    ['illegal', 'no es legal'],
    ['stale_ply', 'La posición cambió'],
    ['unauthorized', 'No puedes hacer eso'],
    ['not_found', 'No se encontró'],
  ] as const)('explains %s from the code, not from the message', async (code, text) => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:error', { code, message: 'debug text' });
    await element.updateComplete;
    expect(element.querySelector('[role=alert]')?.textContent).toContain(text);
    expect(element.textContent).not.toContain('debug text');
  });
});

describe('the confirmation flow', () => {
  const send = (name: CsEventName, detail: object): void => void document.dispatchEvent(new CustomEvent(name, { detail }));

  it('sends the move only when it is confirmed, never for a candidate', async () => {
    const { socket, sent, receive } = fakeSocket();
    await mountGame(socket);
    receive('game:state', state());
    send('cs:move-candidate', { v: 1, gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', source: 'text' });
    expect(sent.filter(([event]) => event === 'game:move')).toEqual([]);

    send('cs:move-confirmed', { v: 1, gameId: 'g1', ply: 1, uci: 'e2e4', source: 'text' });
    expect(sent.filter(([event]) => event === 'game:move')).toEqual([['game:move', { gameId: 'g1', uci: 'e2e4', ply: 1 }]]);
  });

  it('ignores a confirmation for another game', async () => {
    const { socket, sent } = fakeSocket();
    await mountGame(socket);
    send('cs:move-confirmed', { v: 1, gameId: 'other', ply: 1, uci: 'e2e4', source: 'text' });
    expect(sent.filter(([event]) => event === 'game:move')).toEqual([]);
  });

  it('says so when a confirmed move cannot be sent', async () => {
    const element = await mountGame(null);
    send('cs:move-confirmed', { v: 1, gameId: 'g1', ply: 1, uci: 'e2e4', source: 'text' });
    await element.updateComplete;
    expect(element.querySelector('[role=alert]')?.textContent).toContain('no se envió');
  });
});

describe('replay', () => {
  it('gives the FEN after each move, including castling', () => {
    const fens = fensAfter([{ uci: 'e2e4' }, { uci: 'e7e5' }, { uci: 'g1f3' }, { uci: 'b8c6' }, { uci: 'f1c4' }, { uci: 'f8c5' }, { uci: 'e1g1' }]);
    expect(fens[0]).toBe(AFTER_E4);
    expect(fens[1]).toBe(AFTER_E5);
    expect(fens).toHaveLength(7);
    expect(fens[6]?.split(' ')[0]).toBe('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1');
  });

  it('stops at a move that cannot be played', () => {
    expect(fensAfter([{ uci: 'e2e4' }, { uci: 'e2e4' }])).toHaveLength(1);
  });

  it('reads the turn from the FEN', () => {
    expect(turnOf(AFTER_E4)).toBe('black');
    expect(turnOf(AFTER_E5)).toBe('white');
  });
});
