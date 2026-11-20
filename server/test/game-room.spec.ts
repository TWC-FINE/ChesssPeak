import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gameEndSchema, gameMovedSchema, gameStateSchema, type Color } from '@chessspeak/shared';
import { Chess, castlingSide } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci, parseSquare, squareFile, squareRank } from 'chessops/util';
import { GameRoom, terminationOf, type RoomPlayer } from '../src/games/game-room';

const ana: RoomPlayer = { id: 'guest:ana', displayName: 'Ana' };
const beto: RoomPlayer = { id: 'guest:beto', displayName: 'Beto' };
const carla: RoomPlayer = { id: 'guest:carla', displayName: 'Carla' };

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A game with Ana as White and Beto as Black, both connected. */
function activeRoom(): GameRoom {
  const room = new GameRoom('g1', ana, 'white');
  room.join(ana);
  room.join(beto);
  return room;
}

/** Plays a line of moves in UCI, each by whoever has the turn, and fails the test on the first refusal. */
function play(room: GameRoom, line: string) {
  let last;
  for (const uci of line.split(' ')) {
    const player = room.stateFor(ana.id).turn === room.colorOf(ana.id) ? ana : beto;
    last = room.move(player.id, uci, room.plyCount + 1);
    if (!last.ok) throw new Error(`${uci}: ${last.code} (${last.message})`);
  }
  return last!;
}

const refusal = (code: string) => expect.objectContaining({ ok: false, code });

const FOOLS_MATE = 'f2f3 e7e5 g2g4 d8h4';
// Sam Loyd's shortest stalemate
const STALEMATE = 'e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6';

describe('seats (docs/protocol.md §2)', () => {
  it('reserves the seat of the creator, who keeps it when joining', () => {
    const room = new GameRoom('g1', ana, 'black');
    expect(room.status).toBe('waiting');
    expect(room.stateFor(ana.id).seats.black).toEqual({ displayName: 'Ana', connected: false });
    expect(room.join(ana)).toEqual({ ok: true, color: 'black', activated: false });
    expect(room.stateFor(ana.id).seats.black?.connected).toBe(true);
    expect(room.status).toBe('waiting');
  });

  it('gives the rival the free seat, not the reserved one, and starts the game', () => {
    const room = new GameRoom('g1', ana, 'white');
    expect(room.join(beto)).toEqual({ ok: true, color: 'black', activated: true });
    expect(room.status).toBe('active');
  });

  it('gives white first when the creator took black', () => {
    const room = new GameRoom('g1', ana, 'black');
    expect(room.join(beto)).toEqual({ ok: true, color: 'white', activated: true });
  });

  it('refuses a third identity', () => {
    expect(activeRoom().join(carla)).toEqual(refusal('unauthorized'));
  });

  it('refuses a newcomer in a game that was aborted with a free seat', () => {
    const room = new GameRoom('g1', ana, 'white');
    room.abort();
    expect(room.join(beto)).toEqual(refusal('unauthorized'));
  });

  it('gives the same seat back on reconnection, even once the game is over', () => {
    const room = activeRoom();
    room.resign(beto.id);
    expect(room.join(beto)).toEqual({ ok: true, color: 'black', activated: false });
  });
});

describe('move', () => {
  it('applies a legal move and reports it as the contract says', () => {
    const room = activeRoom();
    const result = room.move(ana.id, 'e2e4', 1);
    expect(result).toEqual({
      ok: true,
      moved: { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
    });
    expect(room.plyCount).toBe(1);
  });

  it('matches the worked example of docs/protocol.md §3', () => {
    const room = activeRoom();
    play(room, 'e2e4 e7e5');
    expect(room.stateFor(ana.id)).toMatchObject({ plyCount: 2, turn: 'white' });
    const result = room.move(ana.id, 'g1f3', 3);
    expect(result).toMatchObject({ ok: true, moved: { ply: 3, uci: 'g1f3', san: 'Nf3' } });
    expect(room.stateFor(ana.id).plyCount).toBe(3);
  });

  it('refuses whoever has no seat', () => {
    expect(activeRoom().move(carla.id, 'e2e4', 1)).toEqual(refusal('unauthorized'));
  });

  it('refuses moves before the game starts and after it ends', () => {
    const waiting = new GameRoom('g1', ana, 'white');
    expect(waiting.move(ana.id, 'e2e4', 1)).toEqual(refusal('unauthorized'));
    const finished = activeRoom();
    finished.resign(beto.id);
    expect(finished.move(ana.id, 'e2e4', 1)).toEqual(refusal('unauthorized'));
  });

  it('answers not_your_turn to a move out of turn with the right ply', () => {
    expect(activeRoom().move(beto.id, 'e7e5', 1)).toEqual(refusal('not_your_turn'));
  });

  it('answers stale_ply to a repeated send, not not_your_turn', () => {
    const room = activeRoom();
    room.move(ana.id, 'e2e4', 1);
    expect(room.move(ana.id, 'e2e4', 1)).toEqual(refusal('stale_ply'));
    expect(room.plyCount).toBe(1);
  });

  it('answers stale_ply to a ply from the future', () => {
    expect(activeRoom().move(ana.id, 'e2e4', 3)).toEqual(refusal('stale_ply'));
  });

  it('answers illegal to an illegal move', () => {
    expect(activeRoom().move(ana.id, 'e2e5', 1)).toEqual(refusal('illegal'));
  });

  it('answers illegal to a move of the rival piece and to moving from an empty square', () => {
    const room = activeRoom();
    expect(room.move(ana.id, 'e7e5', 1)).toEqual(refusal('illegal'));
    expect(room.move(ana.id, 'e4e5', 1)).toEqual(refusal('illegal'));
  });

  it('answers illegal to a move that leaves the own king in check', () => {
    const room = activeRoom();
    play(room, 'e2e4 e7e5 d1h5 b8c6 h5f7'); // Black's king is in check from the queen
    expect(room.move(beto.id, 'a7a6', 6)).toEqual(refusal('illegal'));
  });

  it('leaves the state untouched after any refusal', () => {
    const room = activeRoom();
    play(room, 'e2e4');
    const before = room.stateFor(ana.id);
    room.move(carla.id, 'e7e5', 2);
    room.move(ana.id, 'd2d4', 2);
    room.move(beto.id, 'e7e5', 7);
    room.move(beto.id, 'e7e2', 2);
    expect(room.stateFor(ana.id)).toEqual(before);
  });
});

describe('special moves', () => {
  const CASTLE_READY = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5';

  it('castles with the UCI of the contract and reports O-O', () => {
    const room = activeRoom();
    play(room, CASTLE_READY);
    expect(room.move(ana.id, 'e1g1', 7)).toMatchObject({ ok: true, moved: { uci: 'e1g1', san: 'O-O', fen: expect.stringContaining('RNBQ1RK1') } });
  });

  it('refuses king-takes-rook, the internal encoding of chessops', () => {
    const room = activeRoom();
    play(room, CASTLE_READY);
    expect(room.move(ana.id, 'e1h1', 7)).toEqual(refusal('illegal'));
  });

  it('castles long', () => {
    const room = activeRoom();
    play(room, 'd2d4 d7d5 c1f4 c8f5 b1c3 b8c6 d1d2 d8d7');
    expect(room.move(ana.id, 'e1c1', 9)).toMatchObject({ ok: true, moved: { uci: 'e1c1', san: 'O-O-O' } });
  });

  it('captures en passant', () => {
    const room = activeRoom();
    play(room, 'e2e4 a7a6 e4e5 d7d5');
    expect(room.move(ana.id, 'e5d6', 5)).toMatchObject({ ok: true, moved: { san: 'exd6' } });
  });

  it('promotes with the piece asked for, and requires one', () => {
    const line = 'a2a4 b7b5 a4b5 a7a6 b5a6 c8b7 a6b7 b8c6';
    const room = activeRoom();
    play(room, line);
    expect(room.move(ana.id, 'b7a8', 9)).toEqual(refusal('illegal'));
    expect(room.move(ana.id, 'b7a8k', 9)).toEqual(refusal('illegal'));
    expect(room.move(ana.id, 'b7a8n', 9)).toMatchObject({ ok: true, moved: { uci: 'b7a8n', san: 'bxa8=N' } });
  });

  it('refuses a promotion suffix on a move that does not promote', () => {
    expect(activeRoom().move(ana.id, 'e2e4q', 1)).toEqual(refusal('illegal'));
  });
});

describe('end of the game', () => {
  it('ends in checkmate with the winner', () => {
    const room = activeRoom();
    const last = play(room, FOOLS_MATE);
    expect(last).toMatchObject({ moved: { san: 'Qh4#' }, end: { gameId: 'g1', result: '0-1', termination: 'checkmate' } });
    expect(room.status).toBe('finished');
    expect(room.move(ana.id, 'a2a3', 5)).toEqual(refusal('unauthorized'));
  });

  it('ends in stalemate as a draw', () => {
    const room = activeRoom();
    expect(play(room, STALEMATE)).toMatchObject({ end: { result: '1/2-1/2', termination: 'stalemate' } });
  });

  it.each([
    ['king against king', '8/8/4k3/8/8/4K3/8/8 w - - 0 1', { result: '1/2-1/2', termination: 'insufficient_material' }],
    ['king and bishop against king', '8/8/4k3/8/8/4KB2/8/8 w - - 0 1', { result: '1/2-1/2', termination: 'insufficient_material' }],
    ['a rook is enough to mate', '8/8/4k3/8/8/4KR2/8/8 w - - 0 1', undefined],
    ['the starting position', START_FEN, undefined],
  ])('terminationOf: %s', (_name, fen, expected) => {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    expect(terminationOf(position)).toEqual(expected);
  });

  it('gives the win to the rival of whoever resigns', () => {
    const white = activeRoom();
    expect(white.resign(ana.id)).toEqual({ ok: true, end: { gameId: 'g1', result: '0-1', termination: 'resignation' } });
    const black = activeRoom();
    expect(black.resign(beto.id)).toEqual({ ok: true, end: { gameId: 'g1', result: '1-0', termination: 'resignation' } });
  });

  it('refuses a resignation from outside, before the game starts and after it ends', () => {
    expect(activeRoom().resign(carla.id)).toEqual(refusal('unauthorized'));
    expect(new GameRoom('g1', ana, 'white').resign(ana.id)).toEqual(refusal('unauthorized'));
    const finished = activeRoom();
    finished.resign(ana.id);
    expect(finished.resign(beto.id)).toEqual(refusal('unauthorized'));
    expect(finished.result?.result).toBe('0-1');
  });

  it('aborts only a game nobody joined', () => {
    const waiting = new GameRoom('g1', ana, 'white');
    expect(waiting.abort()).toEqual({ ok: true, end: { gameId: 'g1', result: '*', termination: 'aborted' } });
    expect(waiting.status).toBe('aborted');
    expect(activeRoom().abort()).toEqual(refusal('unauthorized'));
  });
});

describe('draws by repetition and by fifty moves', () => {
  const KNIGHTS_OUT_AND_BACK = 'g1f3 g8f6 f3g1 f6g8';

  it('draws when the same position is on the board for the third time', () => {
    const room = activeRoom();
    play(room, KNIGHTS_OUT_AND_BACK);
    expect(room.status).toBe('active');
    const last = play(room, KNIGHTS_OUT_AND_BACK);
    expect(last).toMatchObject({ end: { gameId: 'g1', result: '1/2-1/2', termination: 'threefold_repetition' } });
    expect(room.status).toBe('finished');
    expect(room.move(ana.id, 'e2e4', 9)).toEqual(refusal('unauthorized'));
  });

  it('needs the third time: twice is not a draw', () => {
    const room = activeRoom();
    // each position of the knights' trip is on the board twice, then the line changes
    play(room, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g5 f6g8');
    expect(room.status).toBe('active');
  });

  it('does not count the starting position again once castling rights are lost', () => {
    const room = activeRoom();
    // the kings step out and back: the pieces repeat, but the rights to castle are gone
    play(room, 'e2e4 e7e5 e1e2 e8e7 e2e1 e7e8 e1e2 e8e7 e2e1 e7e8');
    expect(room.status).toBe('active');
    expect(play(room, 'e1e2 e8e7')).toMatchObject({ end: { termination: 'threefold_repetition' } });
  });

  it.each([
    ['a hundred half-moves without a capture or a pawn move', '8/8/4k3/8/8/4K3/R7/8 w - - 100 80', { result: '1/2-1/2', termination: 'fifty_moves' }],
    ['ninety-nine are not enough', '8/8/4k3/8/8/4K3/R7/8 w - - 99 80', undefined],
  ])('terminationOf: %s', (_name, fen, expected) => {
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    expect(terminationOf(position)).toEqual(expected);
  });

  it('mate wins over the fifty-move rule', () => {
    const mated = Chess.fromSetup(parseFen('4k2R/R7/4K3/8/8/8/8/8 b - - 100 80').unwrap()).unwrap();
    expect(terminationOf(mated)).toEqual({ result: '1-0', termination: 'checkmate' });
  });

  it('keeps the ending after a restart', () => {
    const room = activeRoom();
    play(room, `${KNIGHTS_OUT_AND_BACK} ${KNIGHTS_OUT_AND_BACK}`);
    const { end: _end, ...withoutEnd } = room.snapshot();
    expect(GameRoom.rehydrate(withoutEnd).result).toMatchObject({ termination: 'threefold_repetition' });
    expect(GameRoom.rehydrate(room.snapshot()).status).toBe('finished');
  });

  it('serves a game stored before the rule that went on after a repetition', () => {
    const line = `${KNIGHTS_OUT_AND_BACK} ${KNIGHTS_OUT_AND_BACK} e2e4`.split(' ');
    const moves = line.map((uci, index) => ({ ply: index + 1, uci }));
    const rebuilt = GameRoom.rehydrate({ gameId: 'g1', seats: { white: ana, black: beto }, moves });
    expect(rebuilt.status).toBe('active');
    expect(rebuilt.plyCount).toBe(9);
    const resigned = GameRoom.rehydrate({
      gameId: 'g1',
      seats: { white: ana, black: beto },
      moves: moves.slice(0, 8),
      end: { gameId: 'g1', result: '1-0', termination: 'resignation' },
    });
    expect(resigned.result?.termination).toBe('resignation');
  });

  it('every ending passes the schema of @chessspeak/shared', () => {
    const room = activeRoom();
    const last = play(room, `${KNIGHTS_OUT_AND_BACK} ${KNIGHTS_OUT_AND_BACK}`);
    if (!last.ok || last.end === undefined) throw new Error('no end');
    gameEndSchema.parse(last.end);
  });
});

describe('draw offers', () => {
  const agreement = { gameId: 'g1', result: '1/2-1/2', termination: 'agreement' };

  it('shows the pending offer to both players', () => {
    const room = activeRoom();
    expect(room.offerDraw(ana.id)).toEqual({ ok: true, offeredBy: 'white' });
    expect(room.stateFor(ana.id).drawOffer).toBe('white');
    expect(room.stateFor(beto.id).drawOffer).toBe('white');
    expect(room.status).toBe('active');
  });

  it('ends in a draw by agreement when the rival accepts', () => {
    const room = activeRoom();
    room.offerDraw(ana.id);
    expect(room.answerDraw(beto.id, true)).toEqual({ ok: true, end: agreement });
    expect(room.status).toBe('finished');
    expect(room.stateFor(ana.id).drawOffer).toBeUndefined();
  });

  it('goes on when the rival declines, and the same player can offer again', () => {
    const room = activeRoom();
    room.offerDraw(ana.id);
    expect(room.answerDraw(beto.id, false)).toEqual({ ok: true });
    expect(room.stateFor(ana.id).drawOffer).toBeUndefined();
    expect(room.status).toBe('active');
    expect(room.offerDraw(ana.id)).toEqual({ ok: true, offeredBy: 'white' });
  });

  it('takes an offer back from the rival as accepting it', () => {
    const room = activeRoom();
    room.offerDraw(beto.id);
    expect(room.offerDraw(ana.id)).toEqual({ ok: true, end: agreement });
  });

  it('keeps one offer when the same player offers twice', () => {
    const room = activeRoom();
    room.offerDraw(ana.id);
    expect(room.offerDraw(ana.id)).toEqual({ ok: true, offeredBy: 'white' });
    expect(room.status).toBe('active');
  });

  it('withdraws the offer on any move', () => {
    const offeredBeforeMoving = activeRoom();
    offeredBeforeMoving.offerDraw(ana.id);
    play(offeredBeforeMoving, 'e2e4');
    expect(offeredBeforeMoving.stateFor(beto.id).drawOffer).toBeUndefined();
    expect(offeredBeforeMoving.answerDraw(beto.id, true)).toEqual(refusal('unauthorized'));

    const declinedByPlaying = activeRoom();
    play(declinedByPlaying, 'e2e4');
    declinedByPlaying.offerDraw(ana.id);
    play(declinedByPlaying, 'e7e5');
    expect(declinedByPlaying.stateFor(ana.id).drawOffer).toBeUndefined();
  });

  it('refuses to answer an offer that does not exist or is your own', () => {
    const room = activeRoom();
    expect(room.answerDraw(beto.id, true)).toEqual(refusal('unauthorized'));
    room.offerDraw(ana.id);
    expect(room.answerDraw(ana.id, true)).toEqual(refusal('unauthorized'));
    expect(room.status).toBe('active');
  });

  it('refuses offers and answers from outside, before the game starts and after it ends', () => {
    expect(activeRoom().offerDraw(carla.id)).toEqual(refusal('unauthorized'));
    expect(activeRoom().answerDraw(carla.id, true)).toEqual(refusal('unauthorized'));
    expect(new GameRoom('g1', ana, 'white').offerDraw(ana.id)).toEqual(refusal('unauthorized'));
    const finished = activeRoom();
    finished.offerDraw(ana.id);
    finished.resign(beto.id);
    expect(finished.answerDraw(beto.id, true)).toEqual(refusal('unauthorized'));
    expect(finished.offerDraw(beto.id)).toEqual(refusal('unauthorized'));
    expect(finished.result?.termination).toBe('resignation');
    expect(finished.stateFor(ana.id).drawOffer).toBeUndefined();
  });

  it('does not keep the offer through a restart, but keeps the draw', () => {
    const pending = activeRoom();
    pending.offerDraw(ana.id);
    expect(GameRoom.rehydrate(pending.snapshot()).stateFor(ana.id).drawOffer).toBeUndefined();

    const drawn = activeRoom();
    drawn.offerDraw(ana.id);
    drawn.answerDraw(beto.id, true);
    const back = GameRoom.rehydrate(drawn.snapshot());
    expect(back.result).toEqual(agreement);
    expect(back.status).toBe('finished');
  });

  it('every message passes the schemas of @chessspeak/shared', () => {
    const room = activeRoom();
    room.offerDraw(beto.id);
    gameStateSchema.parse(room.stateFor(ana.id));
    const answered = room.answerDraw(ana.id, true);
    if (!answered.ok || answered.end === undefined) throw new Error('expected the end');
    gameEndSchema.parse(answered.end);
  });
});

describe('rematch', () => {
  const finishedRoom = () => {
    const room = activeRoom();
    room.resign(beto.id);
    return room;
  };
  const swapped = { white: { id: beto.id, displayName: 'Beto' }, black: { id: ana.id, displayName: 'Ana' } };

  it('shows the pending offer to both players once the game is finished', () => {
    const room = finishedRoom();
    expect(room.offerRematch(beto.id)).toEqual({ ok: true, offeredBy: 'black' });
    expect(room.stateFor(ana.id).rematchOffer).toBe('black');
    expect(room.stateFor(beto.id).rematchOffer).toBe('black');
  });

  it('gives the seats of the new game, colors swapped, when the rival accepts', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    expect(room.answerRematch(beto.id, true)).toEqual({ ok: true, seats: swapped });
    expect(room.stateFor(ana.id).rematchOffer).toBeUndefined();
  });

  it('takes an offer back from the rival as accepting it', () => {
    const room = finishedRoom();
    room.offerRematch(beto.id);
    expect(room.offerRematch(ana.id)).toEqual({ ok: true, seats: swapped });
  });

  it('goes back to no offer when the rival declines', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    expect(room.answerRematch(beto.id, false)).toEqual({ ok: true });
    expect(room.stateFor(ana.id).rematchOffer).toBeUndefined();
    expect(room.offerRematch(beto.id)).toEqual({ ok: true, offeredBy: 'black' });
  });

  it('starts one rematch per game, and shows it once it exists', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    room.answerRematch(beto.id, true);
    expect(room.offerRematch(ana.id)).toEqual(refusal('unauthorized'));
    expect(room.stateFor(ana.id).nextGameId).toBeUndefined();
    room.rematchCreated('g2');
    expect(room.stateFor(beto.id).nextGameId).toBe('g2');
    expect(room.offerRematch(beto.id)).toEqual(refusal('unauthorized'));
    expect(room.answerRematch(beto.id, true)).toEqual(refusal('unauthorized'));
  });

  it('lets them offer again when the new game could not be created', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    room.answerRematch(beto.id, true);
    room.rematchFailed();
    expect(room.offerRematch(ana.id)).toEqual({ ok: true, offeredBy: 'white' });
  });

  it('refuses a rematch while the game goes on, in a cancelled game, and from outside', () => {
    expect(activeRoom().offerRematch(ana.id)).toEqual(refusal('unauthorized'));
    const waiting = new GameRoom('g1', ana, 'white');
    waiting.abort();
    expect(waiting.offerRematch(ana.id)).toEqual(refusal('unauthorized'));
    expect(finishedRoom().offerRematch(carla.id)).toEqual(refusal('unauthorized'));
    expect(finishedRoom().answerRematch(carla.id, true)).toEqual(refusal('unauthorized'));
  });

  it('refuses to answer an offer that does not exist or is your own', () => {
    const room = finishedRoom();
    expect(room.answerRematch(beto.id, true)).toEqual(refusal('unauthorized'));
    room.offerRematch(ana.id);
    expect(room.answerRematch(ana.id, true)).toEqual(refusal('unauthorized'));
  });

  it('does not keep the offer through a restart', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    expect(GameRoom.rehydrate(room.snapshot()).stateFor(ana.id).rematchOffer).toBeUndefined();
  });

  it('every message passes the schemas of @chessspeak/shared', () => {
    const room = finishedRoom();
    room.offerRematch(ana.id);
    gameStateSchema.parse(room.stateFor(beto.id));
    room.answerRematch(beto.id, true);
    room.rematchCreated('g2');
    expect(gameStateSchema.parse(room.stateFor(beto.id)).nextGameId).toBe('g2');
  });
});

describe('clock', () => {
  const MIN = 60_000;
  /** Ana (white) against Beto (black), each with `ms` on the clock. */
  const clockRoom = (ms = 5 * MIN) => {
    const room = new GameRoom('g1', ana, 'white', ms);
    room.join(ana);
    room.join(beto);
    return room;
  };
  const clockOf = (room: GameRoom, now?: number) => room.stateFor(ana.id, now).clock;

  it('waits for the first move of white, which is free, and then runs for black', () => {
    const room = clockRoom();
    expect(clockOf(room, 99_000)).toEqual({ initialMs: 5 * MIN, whiteMs: 5 * MIN, blackMs: 5 * MIN, running: null });
    expect(room.msToFlag(99_000)).toBeUndefined();
    const played = room.move(ana.id, 'e2e4', 1, 1_000);
    if (!played.ok) throw new Error(played.message);
    expect(played.moved.clock).toEqual({ initialMs: 5 * MIN, whiteMs: 5 * MIN, blackMs: 5 * MIN, running: 'black' });
    expect(clockOf(room, 4_000)).toMatchObject({ blackMs: 5 * MIN - 3_000, running: 'black' });
    expect(room.msToFlag(4_000)).toBe(5 * MIN - 3_000);
  });

  it('charges each player the time they took', () => {
    const room = clockRoom();
    room.move(ana.id, 'e2e4', 1, 0);
    room.move(beto.id, 'e7e5', 2, 10_000);
    const third = room.move(ana.id, 'g1f3', 3, 14_000);
    if (!third.ok) throw new Error(third.message);
    expect(third.moved.clock).toEqual({ initialMs: 5 * MIN, whiteMs: 5 * MIN - 4_000, blackMs: 5 * MIN - 10_000, running: 'black' });
  });

  it('ends on time when the clock of the player to move reaches zero, and not a moment before', () => {
    const room = clockRoom(MIN);
    room.move(ana.id, 'e2e4', 1, 0);
    expect(room.flag(MIN - 1)).toEqual(refusal('unauthorized'));
    expect(room.status).toBe('active');
    expect(room.flag(MIN)).toEqual({ ok: true, end: { gameId: 'g1', result: '1-0', termination: 'timeout' } });
    expect(room.status).toBe('finished');
    expect(clockOf(room, 2 * MIN)).toEqual({ initialMs: MIN, whiteMs: MIN, blackMs: 0, running: null });
    expect(room.msToFlag(2 * MIN)).toBeUndefined();
  });

  it('does not play a move that arrives with no time left', () => {
    const room = clockRoom(MIN);
    room.move(ana.id, 'e2e4', 1, 0);
    expect(room.move(beto.id, 'e7e5', 2, MIN + 5)).toEqual(refusal('unauthorized'));
    expect(room.plyCount).toBe(1);
  });

  it('refuses to flag a game without a clock, before the first move, or once it ended', () => {
    const plain = activeRoom();
    play(plain, 'e2e4');
    expect(plain.flag(10 * MIN)).toEqual(refusal('unauthorized'));
    expect(plain.stateFor(ana.id).clock).toBeUndefined();
    expect(clockRoom().flag(10 * MIN)).toEqual(refusal('unauthorized'));
    const resigned = clockRoom(MIN);
    resigned.move(ana.id, 'e2e4', 1, 0);
    resigned.resign(beto.id);
    expect(resigned.flag(10 * MIN)).toEqual(refusal('unauthorized'));
    expect(clockOf(resigned, 10 * MIN)).toMatchObject({ blackMs: MIN, running: null });
  });

  it('rebuilds the clock after a restart from the time of each move', () => {
    const room = clockRoom();
    room.move(ana.id, 'e2e4', 1, 0);
    room.move(beto.id, 'e7e5', 2, 7_000);
    const back = GameRoom.rehydrate(room.snapshot());
    expect(back.clockMs).toBe(5 * MIN);
    expect(back.stateFor(ana.id, 9_000).clock).toEqual({ initialMs: 5 * MIN, whiteMs: 5 * MIN - 2_000, blackMs: 5 * MIN - 7_000, running: 'white' });
  });

  it('every message passes the schemas of @chessspeak/shared', () => {
    const room = clockRoom(MIN);
    const played = room.move(ana.id, 'e2e4', 1, 0);
    if (!played.ok) throw new Error(played.message);
    gameMovedSchema.parse(played.moved);
    gameStateSchema.parse(room.stateFor(beto.id, 30_000));
    const flagged = room.flag(MIN);
    if (!flagged.ok) throw new Error(flagged.message);
    gameEndSchema.parse(flagged.end);
  });
});

describe('connections and abandonment', () => {
  it('shows the connection state of each seat', () => {
    const room = activeRoom();
    expect(room.disconnect(beto.id)).toBe('black');
    expect(room.stateFor(ana.id).seats).toEqual({ white: { displayName: 'Ana', connected: true }, black: { displayName: 'Beto', connected: false } });
  });

  it('keeps a player connected while another of their tabs is open', () => {
    const room = activeRoom();
    room.join(beto);
    expect(room.disconnect(beto.id)).toBeUndefined();
    expect(room.stateFor(ana.id).seats.black?.connected).toBe(true);
    expect(room.disconnect(beto.id)).toBe('black');
  });

  it('survives more disconnects than connections and unknown players', () => {
    const room = activeRoom();
    room.disconnect(beto.id);
    expect(room.disconnect(beto.id)).toBeUndefined();
    expect(room.disconnect(carla.id)).toBeUndefined();
    room.join(beto);
    expect(room.stateFor(ana.id).seats.black?.connected).toBe(true);
  });

  it('gives the win to the rival of whoever abandoned', () => {
    const room = activeRoom();
    room.disconnect(ana.id);
    expect(room.abandon('white')).toEqual({ ok: true, end: { gameId: 'g1', result: '0-1', termination: 'abandonment' } });
  });

  it('ignores a late timer: a player who came back cannot lose by abandonment', () => {
    const room = activeRoom();
    room.disconnect(beto.id);
    room.join(beto);
    expect(room.abandon('black')).toEqual(refusal('unauthorized'));
    expect(room.status).toBe('active');
  });

  it('does not rewrite a finished game', () => {
    const room = activeRoom();
    room.disconnect(beto.id);
    room.resign(ana.id);
    expect(room.abandon('black')).toEqual(refusal('unauthorized'));
    expect(room.result?.termination).toBe('resignation');
  });
});

describe('rehydrate', () => {
  it('rebuilds the same game, and the next move works', () => {
    const room = activeRoom();
    play(room, 'e2e4 e7e5 g1f3');
    const rebuilt = GameRoom.rehydrate(room.snapshot());
    expect(rebuilt.fen).toBe(room.fen);
    expect(rebuilt.plyCount).toBe(3);
    expect(rebuilt.stateFor(beto.id).moves).toEqual(room.stateFor(beto.id).moves);
    expect(rebuilt.status).toBe('active');
    expect(rebuilt.move(beto.id, 'b8c6', 4)).toMatchObject({ ok: true, moved: { san: 'Nc6' } });
  });

  it('starts with everybody disconnected, and each one recovers their seat', () => {
    const room = activeRoom();
    const rebuilt = GameRoom.rehydrate(room.snapshot());
    expect(rebuilt.stateFor(ana.id).seats.white?.connected).toBe(false);
    expect(rebuilt.join(beto)).toEqual({ ok: true, color: 'black', activated: false });
    expect(rebuilt.join(carla)).toEqual(refusal('unauthorized'));
  });

  it('rebuilds a waiting game whose creator took black', () => {
    const rebuilt = GameRoom.rehydrate(new GameRoom('g1', ana, 'black').snapshot());
    expect(rebuilt.colorOf(ana.id)).toBe('black');
    expect(rebuilt.status).toBe('waiting');
    expect(rebuilt.join(beto)).toEqual({ ok: true, color: 'white', activated: true });
  });

  it('derives the end from the moves when they say it', () => {
    const room = activeRoom();
    play(room, FOOLS_MATE);
    const { end: _end, ...withoutEnd } = room.snapshot();
    expect(GameRoom.rehydrate(withoutEnd).result).toMatchObject({ result: '0-1', termination: 'checkmate' });
  });

  it('keeps an end that the moves cannot say', () => {
    const room = activeRoom();
    play(room, 'e2e4');
    room.resign(beto.id);
    const rebuilt = GameRoom.rehydrate(room.snapshot());
    expect(rebuilt.status).toBe('finished');
    expect(rebuilt.result?.termination).toBe('resignation');
    expect(rebuilt.move(beto.id, 'e7e5', 2)).toEqual(refusal('unauthorized'));
  });

  const seats: Record<Color, RoomPlayer | null> = { white: ana, black: beto };

  it.each([
    ['an illegal move', { moves: [{ ply: 1, uci: 'e2e5' }] }, /illegal move e2e5/],
    ['a gap in the plies', { moves: [{ ply: 1, uci: 'e2e4' }, { ply: 3, uci: 'e7e5' }] }, /expected ply 2/],
    [
      'a move after the end',
      { moves: [{ ply: 1, uci: 'f2f3' }, { ply: 2, uci: 'e7e5' }, { ply: 3, uci: 'g2g4' }, { ply: 4, uci: 'd8h4' }, { ply: 5, uci: 'a2a3' }] },
      /after the end/,
    ],
    [
      'an end that contradicts the moves',
      {
        moves: [{ ply: 1, uci: 'f2f3' }, { ply: 2, uci: 'e7e5' }, { ply: 3, uci: 'g2g4' }, { ply: 4, uci: 'd8h4' }],
        end: { gameId: 'g1', result: '1-0' as const, termination: 'resignation' as const },
      },
      /recorded as resignation/,
    ],
  ])('refuses %s instead of serving damaged data', (_name, fields, message) => {
    expect(() => GameRoom.rehydrate({ gameId: 'g1', seats, ...fields })).toThrow(message);
  });

  it('refuses moves with an empty seat and a game with no players', () => {
    expect(() => GameRoom.rehydrate({ gameId: 'g1', seats: { white: ana, black: null }, moves: [{ ply: 1, uci: 'e2e4' }] })).toThrow(/empty seat/);
    expect(() => GameRoom.rehydrate({ gameId: 'g1', seats: { white: null, black: null }, moves: [] })).toThrow(/no players/);
  });
});

describe('the contract', () => {
  it('every message passes the schemas of @chessspeak/shared', () => {
    const room = activeRoom();
    gameStateSchema.parse(room.stateFor(ana.id));
    const line = FOOLS_MATE.split(' ');
    for (const uci of line) {
      const player = room.stateFor(ana.id).turn === 'white' ? ana : beto;
      const result = room.move(player.id, uci, room.plyCount + 1);
      if (!result.ok) throw new Error(result.code);
      gameMovedSchema.parse(result.moved);
      if (result.end) gameEndSchema.parse(result.end);
      gameStateSchema.parse(room.stateFor(beto.id));
    }
  });

  it('starts at ply 0 with White to move', () => {
    expect(activeRoom().stateFor(beto.id)).toMatchObject({ fen: START_FEN, moves: [], plyCount: 0, turn: 'white', status: 'active', yourColor: 'black' });
  });

  it('tells each player their own color', () => {
    const room = activeRoom();
    expect(room.stateFor(ana.id).yourColor).toBe('white');
    expect(room.stateFor(beto.id).yourColor).toBe('black');
  });

  it('does not leak identities to the other player', () => {
    expect(JSON.stringify(activeRoom().stateFor(ana.id))).not.toContain('guest:');
  });

  it('hands out copies: a caller cannot change the room through what it received', () => {
    const room = activeRoom();
    play(room, 'e2e4');
    const state = room.stateFor(ana.id);
    state.moves[0]!.uci = 'a2a3';
    state.moves.pop();
    expect(room.stateFor(ana.id).moves).toEqual([{ ply: 1, uci: 'e2e4', san: 'e4' }]);
  });
});

describe('long games against chessops', () => {
  /** Every legal move of the position in the contract's UCI, in a stable order. */
  function legalMoves(position: Chess): string[] {
    const moves: string[] = [];
    for (const [from, destinations] of position.allDests()) {
      for (const to of destinations) {
        const side = castlingSide(position, { from, to });
        if (side !== undefined) {
          // chessops lists castling twice (king destination and rook square): keep the king's
          if (squareFile(to) !== (side === 'h' ? 6 : 2)) continue;
          moves.push(makeUci({ from, to }));
        } else if (position.board.pawn.has(from) && (squareRank(to) === 0 || squareRank(to) === 7)) {
          moves.push(...(['queen', 'rook', 'bishop', 'knight'] as const).map((promotion) => makeUci({ from, to, promotion })));
        } else {
          moves.push(makeUci({ from, to }));
        }
      }
    }
    return moves.sort();
  }

  it.each([1, 2, 3, 4, 5])('agrees on every position of a pseudo-random game (seed %i)', (seed) => {
    const room = activeRoom();
    const position = Chess.default();
    let state = seed * 2654435761;
    for (let ply = 1; ply <= 300 && room.status === 'active'; ply++) {
      expect(room.fen).toBe(makeFen(position.toSetup()));
      const moves = legalMoves(position);
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const uci = moves[state % moves.length]!;
      const player = position.turn === 'white' ? ana : beto;
      const result = room.move(player.id, uci, ply);
      expect(result).toMatchObject({ ok: true, moved: { ply, uci } });
      const parsedFrom = parseSquare(uci.slice(0, 2))!;
      const parsedTo = parseSquare(uci.slice(2, 4))!;
      const side = castlingSide(position, { from: parsedFrom, to: parsedTo });
      const promotion = ({ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' } as const)[uci[4] as 'q' | 'r' | 'b' | 'n'];
      const rookSquare = side === undefined ? parsedTo : position.castles.rook[position.turn][side]!;
      position.play(promotion === undefined ? { from: parsedFrom, to: rookSquare } : { from: parsedFrom, to: parsedTo, promotion });
    }
    // what every reconnection relies on: replaying the record gives the same game
    const rebuilt = GameRoom.rehydrate(room.snapshot());
    expect(rebuilt.fen).toBe(room.fen);
    expect(rebuilt.status).toBe(room.status);
    expect(rebuilt.stateFor(ana.id).moves).toEqual(room.stateFor(ana.id).moves);
  });
});

describe('purity (ARCHITECTURE.md §8, rule 3)', () => {
  const source = readFileSync(join(__dirname, '../src/games/game-room.ts'), 'utf8');

  it('does not import Nest, the databases or any I/O', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports.every((name) => name === '@chessspeak/shared' || name!.startsWith('chessops/'))).toBe(true);
  });

  it('has no await, timers or clock, so a state change cannot be interleaved', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(await|async|setTimeout|setInterval|Date\.now|new Date|Math\.random)\b/);
  });
});

describe('chessops under plain Node', () => {
  // Jest loads the CommonJS build of chessops whatever its package.json says, but Node refuses it unless
  // patches/chessops@0.15.1.patch is applied. Without this check the tests pass and the server dies at startup.
  it('loads with require, as the compiled server does', () => {
    const script = "const { Chess } = require('chessops/chess'); require('chessops/fen'); require('chessops/san'); require('chessops/util'); console.log(Chess.default().turn);";
    const output = execFileSync(process.execPath, ['-e', script], { cwd: join(__dirname, '..'), encoding: 'utf8' });
    expect(output.trim()).toBe('white');
  });
});
