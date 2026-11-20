import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ClientToServerEvents, Clock, CsEventName, GameContext, GameSocket, GameState, ServerToClientEvents } from '@chessspeak/shared';
import { fensAfter, turnOf } from '../src/replay.js';
import type { MoveSound } from '../src/sound.js';

type GameElement = HTMLElement & { context?: GameContext; updateComplete: Promise<boolean>; sound: MoveSound };

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

    expect(positions).toEqual([{ v: 1, gameId: 'g1', fen: state().fen, plyCount: 0, turn: 'white', yourColor: 'white', status: 'active' }]);
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

describe('board extras: turn, check, captures and flip', () => {
  // after 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qe5+: each side took a pawn, and white is in check
  const CHECK_FEN = 'rnb1kbnr/ppp1pppp/8/4q3/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 1 4';

  it('lists the pieces each side took, and whether the side to move is in check', async () => {
    const { capturedBy, inCheck } = await import('../src/mf-game.js');
    expect(capturedBy(state().fen)).toEqual({ white: [], black: [] });
    expect(capturedBy(CHECK_FEN)).toEqual({ white: ['pawn'], black: ['pawn'] });
    expect(inCheck(state().fen)).toBe(false);
    expect(inCheck(CHECK_FEN)).toBe(true);
    expect(inCheck('not a fen')).toBe(false);
  });

  it('shows the turn, the check and the captured pieces', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ fen: CHECK_FEN, plyCount: 6 }));
    await element.updateComplete;
    expect(element.querySelector('.csg-turn')?.textContent).toContain('Turno: Blancas');
    expect(element.querySelector('.csg-check')?.textContent).toBe('Jaque');
    expect(element.querySelectorAll('.csg-tray[data-by=white] piece.pawn.black')).toHaveLength(1);
    expect(element.querySelectorAll('.csg-tray[data-by=black] piece.pawn.white')).toHaveLength(1);
    expect(element.querySelectorAll('cg-board piece')).toHaveLength(30);
  });

  it('counts the material on the board, a promoted piece as what it became', async () => {
    const { materialBalance } = await import('../src/mf-game.js');
    expect(materialBalance(state().fen)).toBe(0);
    expect(materialBalance(CHECK_FEN)).toBe(0);
    // 1.e4 d5 2.exd5: white is a pawn up
    expect(materialBalance('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2')).toBe(1);
    // black has a rook and a knight more
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKB2 w kq - 0 1')).toBe(-13);
    // white promoted a pawn to a queen: 8 more than the pawn it was
    expect(materialBalance('Q3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(9);
  });

  it('shows the material advantage only on the side that is ahead', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ fen: CHECK_FEN, plyCount: 6 }));
    await element.updateComplete;
    expect(element.querySelector('.csg-material')).toBeNull();

    receive('game:state', state({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKB2 b kq - 0 1', plyCount: 6 }));
    await element.updateComplete;
    expect(element.querySelector('.csg-tray[data-by=white] .csg-material')).toBeNull();
    expect(element.querySelector('.csg-tray[data-by=black] .csg-material')?.textContent).toBe('+13');
  });

  it('turns the board for this browser only, and starts again unturned in another game', async () => {
    const { socket, sent } = fakeSocket();
    const element = await mountGame(socket);
    const before = sent.length;
    element.querySelector<HTMLButtonElement>('[data-action=flip]')!.click();
    await element.updateComplete;
    expect(element.querySelector('.orientation-black')).not.toBeNull();
    expect(element.querySelector('[data-action=flip]')?.getAttribute('aria-pressed')).toBe('true');
    expect([...element.querySelectorAll('.csg-file')].slice(0, 8).map((file) => file.textContent).join('')).toBe('hgfedcba');
    expect(sent.length).toBe(before);
    element.context = { v: 1, gameId: 'g2', orientation: 'white', socket };
    await element.updateComplete;
    expect(element.querySelector('.orientation-white')).not.toBeNull();
  });
});

describe('draw offers', () => {
  const button = (element: GameElement, action: string) => element.querySelector<HTMLButtonElement>(`[data-action=${action}]`);

  it('offers a draw from the button', async () => {
    const { socket, sent, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    await element.updateComplete;
    button(element, 'offer-draw')!.click();
    expect(sent.at(-1)).toEqual(['game:draw-offer', { gameId: 'g1' }]);
  });

  it('waits for the answer after offering, and says when the rival declined', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    receive('game:draw', { gameId: 'g1', offeredBy: 'white' });
    await element.updateComplete;
    expect(element.textContent).toContain('Esperando respuesta');
    expect(button(element, 'offer-draw')).toBeNull();

    receive('game:draw', { gameId: 'g1', offeredBy: null });
    await element.updateComplete;
    expect(element.textContent).toContain('Tu rival rechazó las tablas');
    expect(button(element, 'offer-draw')).not.toBeNull();
  });

  it('lets the rival accept or decline', async () => {
    const { socket, sent, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ yourColor: 'black', drawOffer: 'white' }));
    await element.updateComplete;
    expect(element.textContent).toContain('Tu rival ofrece tablas');
    button(element, 'accept-draw')!.click();
    expect(sent.at(-1)).toEqual(['game:draw-answer', { gameId: 'g1', accept: true }]);
    button(element, 'decline-draw')!.click();
    expect(sent.at(-1)).toEqual(['game:draw-answer', { gameId: 'g1', accept: false }]);
  });

  it('drops the offer when a move arrives', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ yourColor: 'black', drawOffer: 'white' }));
    receive('game:moved', { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    await element.updateComplete;
    expect(element.textContent).not.toContain('Tu rival ofrece tablas');
    expect(button(element, 'offer-draw')).not.toBeNull();
  });

  it('hides the draw controls once the game ends, and names the agreement', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ drawOffer: 'black' }));
    receive('game:end', { gameId: 'g1', result: '1/2-1/2', termination: 'agreement' });
    await element.updateComplete;
    expect(element.querySelector('.csg-draw')).toBeNull();
    expect(element.textContent).toContain('1/2-1/2 (tablas de mutuo acuerdo)');
  });

  it('does not offer a draw while waiting for the second player', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ status: 'waiting', seats: { white: { displayName: 'Ana', connected: true }, black: null } }));
    await element.updateComplete;
    expect(element.querySelector('.csg-draw')).toBeNull();
  });
});

describe('rematch', () => {
  const button = (element: GameElement, action: string) => element.querySelector<HTMLButtonElement>(`[data-action=${action}]`);
  const finished = async (over: Partial<GameState> = {}) => {
    const { socket, sent, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ status: 'finished', ...over }));
    receive('game:end', { gameId: 'g1', result: '1-0', termination: 'resignation' });
    await element.updateComplete;
    return { element, sent, receive };
  };
  const opened = (element: GameElement) => {
    const ids: string[] = [];
    element.addEventListener('cs:open-game', (event) => ids.push((event as CustomEvent<{ gameId: string }>).detail.gameId));
    return ids;
  };

  it('offers a rematch once the game is finished, and not before', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    await element.updateComplete;
    expect(button(element, 'offer-rematch')).toBeNull();

    const { element: done, sent } = await finished();
    button(done, 'offer-rematch')!.click();
    expect(sent.at(-1)).toEqual(['game:rematch-offer', { gameId: 'g1' }]);
  });

  it('waits after offering, and says when the rival declined', async () => {
    const { element, receive } = await finished();
    receive('game:rematch', { gameId: 'g1', offeredBy: 'white' });
    await element.updateComplete;
    expect(element.textContent).toContain('Pediste la revancha. Esperando respuesta.');
    receive('game:rematch', { gameId: 'g1', offeredBy: null });
    await element.updateComplete;
    expect(element.textContent).toContain('Tu rival rechazó la revancha.');
    expect(button(element, 'offer-rematch')).not.toBeNull();
  });

  it('lets the rival accept or decline', async () => {
    const { element, sent } = await finished({ yourColor: 'black', rematchOffer: 'white' });
    expect(element.textContent).toContain('Tu rival quiere la revancha');
    button(element, 'accept-rematch')!.click();
    expect(sent.at(-1)).toEqual(['game:rematch-answer', { gameId: 'g1', accept: true }]);
    button(element, 'decline-rematch')!.click();
    expect(sent.at(-1)).toEqual(['game:rematch-answer', { gameId: 'g1', accept: false }]);
  });

  it('asks the shell to open the new game as soon as both accepted', async () => {
    const { element, receive } = await finished({ rematchOffer: 'white' });
    const ids = opened(element);
    receive('game:rematch', { gameId: 'g1', offeredBy: null, nextGameId: 'g2' });
    await element.updateComplete;
    expect(ids).toEqual(['g2']);
    expect(element.textContent).not.toContain('Tu rival rechazó la revancha.');
  });

  it('only shows a button to a rematch it finds when coming back', async () => {
    const { element } = await finished({ nextGameId: 'g2' });
    const ids = opened(element);
    expect(ids).toEqual([]);
    button(element, 'open-rematch')!.click();
    expect(ids).toEqual(['g2']);
    expect(button(element, 'offer-rematch')).toBeNull();
  });

  it('shows nothing to a spectator, after a cancelled game, or for another game', async () => {
    const { element } = await finished({ yourColor: 'spectator' });
    expect(element.querySelector('.csg-rematch')).toBeNull();

    const { socket, receive } = fakeSocket();
    const aborted = await mountGame(socket);
    receive('game:state', state({ status: 'waiting' }));
    receive('game:end', { gameId: 'g1', result: '*', termination: 'aborted' });
    await aborted.updateComplete;
    expect(aborted.querySelector('.csg-rematch')).toBeNull();

    const { element: other, receive: hear } = await finished();
    const ids = opened(other);
    hear('game:rematch', { gameId: 'other', offeredBy: null, nextGameId: 'g9' });
    expect(ids).toEqual([]);
  });
});

describe('clock', () => {
  const clock = (over: Partial<Clock> = {}): Clock => ({ initialMs: 300_000, whiteMs: 300_000, blackMs: 300_000, running: null, ...over });
  const shown = (element: GameElement) => [...element.querySelectorAll('.csg-clock b')].map((chip) => chip.textContent);

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the time left, rounding up, and marks low time', async () => {
    const { formatClock, LOW_TIME_MS } = await import('../src/mf-game.js');
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(9_100)).toBe('0:10');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-50)).toBe('0:00');
    expect(LOW_TIME_MS).toBe(20_000);
  });

  it('shows no clock in a game without one', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state());
    await element.updateComplete;
    expect(element.querySelector('.csg-clocks')).toBeNull();
  });

  it('counts the running clock down between messages, and follows each move', async () => {
    vi.useFakeTimers();
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ clock: clock({ running: 'black' }) }));
    await element.updateComplete;
    expect(shown(element)).toEqual(['5:00', '5:00']);
    expect(element.querySelector('.csg-clock[data-color=black]')?.hasAttribute('data-running')).toBe(true);

    await vi.advanceTimersByTimeAsync(3_000);
    await element.updateComplete;
    expect(shown(element)).toEqual(['5:00', '4:57']);

    receive('game:moved', { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4, clock: clock({ blackMs: 15_000, running: 'white' }) });
    await element.updateComplete;
    expect(shown(element)).toEqual(['5:00', '0:15']);
    expect(element.querySelector('.csg-clock[data-color=black]')?.hasAttribute('data-low')).toBe(true);
    expect(element.querySelector('.csg-clock[data-color=white]')?.hasAttribute('data-running')).toBe(true);
  });

  it('stops the clocks when the game ends, at zero for the one who ran out', async () => {
    vi.useFakeTimers();
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ clock: clock({ blackMs: 2_000, running: 'black' }) }));
    receive('game:end', { gameId: 'g1', result: '1-0', termination: 'timeout' });
    await element.updateComplete;
    expect(shown(element)).toEqual(['5:00', '0:00']);
    expect(element.querySelector('[data-running]')).toBeNull();
    expect(element.textContent).toContain('1-0 (se acabó el tiempo)');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(shown(element)).toEqual(['5:00', '0:00']);
  });

  it('forgets the clock with the game', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ clock: clock() }));
    await element.updateComplete;
    element.context = { v: 1, gameId: 'g2', orientation: 'white', socket };
    await element.updateComplete;
    expect(element.querySelector('.csg-clocks')).toBeNull();
  });
});

describe('spectator', () => {
  it('says the receiver is watching, and offers nothing', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ yourColor: 'spectator', spectators: 1 }));
    await element.updateComplete;
    expect(element.querySelector('.csg-status')?.textContent).toContain('Miras la partida. Le toca a blancas.');
    expect(element.querySelector('.csg-draw')).toBeNull();
    expect(element.querySelector('.csg-players')?.textContent).toContain('1 espectador');
  });

  it('shows the players how many watch, and nothing when nobody does', async () => {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    receive('game:state', state({ spectators: 3 }));
    await element.updateComplete;
    expect(element.querySelector('.csg-players')?.textContent).toContain('3 espectadores');
    receive('game:state', state());
    await element.updateComplete;
    expect(element.querySelector('.csg-players')?.textContent).not.toContain('espectador');
  });
});

describe('sound', () => {
  async function withSound() {
    const { socket, receive } = fakeSocket();
    const element = await mountGame(socket);
    const play = vi.fn();
    element.sound = { play };
    return { element, receive, play };
  }

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // no storage in this environment
    }
  });

  it('sounds a live move, lower for a capture, and not the moves of a state', async () => {
    const { element, receive, play } = await withSound();
    receive('game:state', state({ fen: AFTER_E4, plyCount: 1, turn: 'black', moves: [{ ply: 1, uci: 'e2e4', san: 'e4' }] }));
    expect(play).not.toHaveBeenCalled();
    receive('game:moved', { gameId: 'g1', ply: 2, uci: 'd7d5', san: 'd5', fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' });
    receive('game:moved', { gameId: 'g1', ply: 3, uci: 'e4d5', san: 'exd5', fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2' });
    expect(play.mock.calls).toEqual([['move'], ['capture']]);
    await element.updateComplete;
  });

  it('sounds the end of a live game, but not a result learned on coming back', async () => {
    const { receive, play } = await withSound();
    receive('game:state', state());
    receive('game:end', { gameId: 'g1', result: '0-1', termination: 'resignation' });
    expect(play.mock.calls).toEqual([['end']]);
    const again = await withSound();
    again.receive('game:state', state({ status: 'finished' }));
    again.receive('game:end', { gameId: 'g1', result: '0-1', termination: 'resignation' });
    expect(again.play).not.toHaveBeenCalled();
  });

  it('can be turned off, and the choice is kept', async () => {
    const { element, receive, play } = await withSound();
    receive('game:state', state());
    await element.updateComplete;
    const toggle = element.querySelector<HTMLButtonElement>('[data-action=toggle-sound]')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    await element.updateComplete;
    expect(toggle.textContent).toContain('Sonido: no');
    receive('game:moved', { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: AFTER_E4 });
    expect(play).not.toHaveBeenCalled();
    const next = await withSound();
    await next.element.updateComplete;
    expect(next.element.querySelector('[data-action=toggle-sound]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('tells the page the status with the position', async () => {
    const positions = listen('cs:position');
    const { receive } = await withSound();
    receive('game:state', state({ status: 'waiting' }));
    expect(positions.at(-1)).toMatchObject({ status: 'waiting' });
  });
});
