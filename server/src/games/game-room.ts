import type { Color, GameEnd, GameErrorCode, GameMoved, GameState, GameStatus, MoveRecord, PlayerView } from '@chessspeak/shared';
import { castlingSide, Chess, normalizeMove } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { isDrop, type Move } from 'chessops/types';
import { makeUci, opposite, parseUci, squareRank } from 'chessops/util';

// The source of truth of one game in memory. Pure and synchronous on purpose (ARCHITECTURE.md §2.1):
// no Nest, no I/O, no timers. The gateway authenticates, calls one method, and only then persists and broadcasts,
// so two messages can never interleave inside a state change.

/** Who is playing, as the server decided it from the token. `id` must be stable across reconnections. */
export interface RoomPlayer {
  id: string;
  displayName: string;
}

export type RoomResult<T> = ({ ok: true } & T) | { ok: false; code: GameErrorCode; message: string };

export interface RoomSnapshot {
  gameId: string;
  seats: Record<Color, RoomPlayer | null>;
  moves: Array<Pick<MoveRecord, 'ply' | 'uci'>>;
  /** How the game ended, when the moves alone do not say it (resignation, abandonment, aborted). */
  end?: GameEnd;
}

interface Seat extends RoomPlayer {
  /** Open sockets: one player can have several tabs, and closing one must not disconnect them. */
  connections: number;
}

const refuse = (code: GameErrorCode, message: string): { ok: false; code: GameErrorCode; message: string } => ({ ok: false, code, message });

const winnerResult = (winner: Color): GameEnd['result'] => (winner === 'white' ? '1-0' : '0-1');

/** chessops encodes castling as "king takes rook" (e1h1); standard UCI, the one in the contract, says e1g1. */
function standardUci(position: Chess, move: Move): string {
  const side = castlingSide(position, move);
  if (side === undefined || isDrop(move)) return makeUci(move);
  return makeUci({ from: move.from, to: squareRank(move.from) * 8 + (side === 'h' ? 6 : 2) });
}

/** How the position ends the game, if it does. Repetition and the fifty-move rule are reserved in v1. */
export function terminationOf(position: Chess): Pick<GameEnd, 'result' | 'termination'> | undefined {
  if (position.isCheckmate()) return { result: winnerResult(opposite(position.turn)), termination: 'checkmate' };
  if (position.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (position.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient_material' };
  return undefined;
}

export class GameRoom {
  private readonly position = Chess.default();
  private readonly moves: MoveRecord[] = [];
  private readonly seats: Record<Color, Seat | null> = { white: null, black: null };
  private end: GameEnd | undefined;
  /** Who offered a draw the rival has not answered. Not in the snapshot: an offer does not survive a restart. */
  private drawOffer: Color | undefined;
  /** The same for a rematch, once the game is finished. Not in the snapshot either. */
  private rematchOffer: Color | undefined;
  /** `creating` from the moment both want the rematch until the store answers; then the new game. One per game. */
  private rematch: 'creating' | { nextGameId: string } | undefined;

  /** The creator's color is already decided: `random` is drawn by whoever creates the room. */
  constructor(
    readonly gameId: string,
    creator: RoomPlayer,
    creatorColor: Color,
  ) {
    this.seats[creatorColor] = { ...creator, connections: 0 };
  }

  /**
   * Rebuilds a room from what was persisted by replaying its moves through the same rules.
   * Throws on inconsistent data (illegal move, a gap in the plies): a damaged game must not be served as valid.
   * Everybody starts disconnected; each player reconnects through `join`.
   */
  static rehydrate(snapshot: RoomSnapshot): GameRoom {
    const { white, black } = snapshot.seats;
    const creator = white ?? black;
    if (creator === null) throw new Error(`Game ${snapshot.gameId} has no players`);
    const room = new GameRoom(snapshot.gameId, creator, white === null ? 'black' : 'white');
    if (white !== null && black !== null) room.seats.black = { ...black, connections: 0 };
    if (snapshot.moves.length > 0 && (white === null || black === null)) throw new Error(`Game ${snapshot.gameId} has moves but an empty seat`);

    for (const [index, { ply, uci }] of snapshot.moves.entries()) {
      if (ply !== index + 1) throw new Error(`Game ${snapshot.gameId}: expected ply ${index + 1}, found ${ply}`);
      if (room.end !== undefined) throw new Error(`Game ${snapshot.gameId}: ply ${ply} comes after the end of the game`);
      if (!room.apply(uci)) throw new Error(`Game ${snapshot.gameId}: illegal move ${uci} at ply ${ply}`);
    }

    if (snapshot.end !== undefined) {
      if (room.end !== undefined && room.end.termination !== snapshot.end.termination) {
        throw new Error(`Game ${snapshot.gameId}: the moves end in ${room.end.termination}, but it is recorded as ${snapshot.end.termination}`);
      }
      room.end = { ...snapshot.end };
    }
    return room;
  }

  get status(): GameStatus {
    if (this.end !== undefined) return this.end.termination === 'aborted' ? 'aborted' : 'finished';
    return this.seats.white !== null && this.seats.black !== null ? 'active' : 'waiting';
  }

  get plyCount(): number {
    return this.moves.length;
  }

  get fen(): string {
    return makeFen(this.position.toSetup());
  }

  get result(): GameEnd | undefined {
    return this.end === undefined ? undefined : { ...this.end };
  }

  colorOf(playerId: string): Color | undefined {
    if (this.seats.white?.id === playerId) return 'white';
    if (this.seats.black?.id === playerId) return 'black';
    return undefined;
  }

  /**
   * Takes a seat, in the order of docs/protocol.md §2: the one this identity already has (a reconnection, or the
   * creator's reserved seat), or else the free one while the game is waiting. Call it once per socket.
   */
  join(player: RoomPlayer): RoomResult<{ color: Color; activated: boolean }> {
    const current = this.colorOf(player.id);
    if (current !== undefined) {
      this.seats[current]!.connections++;
      return { ok: true, color: current, activated: false };
    }
    if (this.status !== 'waiting') return refuse('unauthorized', 'The game has no free seat');
    const color: Color = this.seats.white === null ? 'white' : 'black';
    this.seats[color] = { ...player, connections: 1 };
    return { ok: true, color, activated: true };
  }

  /** One socket of this player closed. Returns the color when that left them with no open socket. */
  disconnect(playerId: string): Color | undefined {
    const color = this.colorOf(playerId);
    if (color === undefined) return undefined;
    const seat = this.seats[color]!;
    if (seat.connections === 0) return undefined;
    seat.connections--;
    return seat.connections === 0 ? color : undefined;
  }

  /**
   * Plays a move. The ply is checked before the turn because docs/protocol.md defines a repeated send as `stale_ply`:
   * after your own move it is no longer your turn, so checking the turn first would answer `not_your_turn` to a retry.
   */
  move(playerId: string, uci: string, ply: number): RoomResult<{ moved: GameMoved; end?: GameEnd }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    if (this.status !== 'active') return refuse('unauthorized', `The game is ${this.status}`);
    if (ply !== this.plyCount + 1) return refuse('stale_ply', `Expected ply ${this.plyCount + 1}, got ${ply}`);
    if (color !== this.position.turn) return refuse('not_your_turn', `It is ${this.position.turn}'s turn`);

    const record = this.apply(uci);
    if (record === undefined) return refuse('illegal', `${uci} is not legal in this position`);
    const moved: GameMoved = { gameId: this.gameId, ply: record.ply, uci: record.uci, san: record.san, fen: this.fen };
    return this.end === undefined ? { ok: true, moved } : { ok: true, moved, end: { ...this.end } };
  }

  /**
   * Offers a draw. While the rival's offer is pending, offering accepts it: both want the draw. Offering twice keeps
   * the one offer, so a repeated send changes nothing.
   */
  offerDraw(playerId: string): RoomResult<{ offeredBy: Color } | { end: GameEnd }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    if (this.status !== 'active') return refuse('unauthorized', `The game is ${this.status}`);
    if (this.drawOffer === opposite(color)) return { ok: true, end: this.finish('1/2-1/2', 'agreement') };
    this.drawOffer = color;
    return { ok: true, offeredBy: color };
  }

  /** Answers the rival's pending offer. Only the rival of whoever offered can answer, and only once. */
  answerDraw(playerId: string, accept: boolean): RoomResult<{ end?: GameEnd }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    if (this.status !== 'active') return refuse('unauthorized', `The game is ${this.status}`);
    if (this.drawOffer !== opposite(color)) return refuse('unauthorized', 'There is no draw offer from your rival');
    if (accept) return { ok: true, end: this.finish('1/2-1/2', 'agreement') };
    this.drawOffer = undefined;
    return { ok: true };
  }

  /**
   * Offers a rematch of a finished game. While the rival's offer is pending, offering accepts it. Accepting returns
   * the seats of the new game, colors swapped; the caller creates it and then calls `rematchCreated` or `rematchFailed`.
   */
  offerRematch(playerId: string): RoomResult<{ offeredBy: Color } | { seats: Record<Color, RoomPlayer> }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    const closed = this.rematchClosed();
    if (closed !== undefined) return closed;
    if (this.rematchOffer === opposite(color)) return { ok: true, seats: this.startRematch() };
    this.rematchOffer = color;
    return { ok: true, offeredBy: color };
  }

  /** Answers the rival's pending rematch offer. */
  answerRematch(playerId: string, accept: boolean): RoomResult<{ seats?: Record<Color, RoomPlayer> }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    const closed = this.rematchClosed();
    if (closed !== undefined) return closed;
    if (this.rematchOffer !== opposite(color)) return refuse('unauthorized', 'There is no rematch offer from your rival');
    if (accept) return { ok: true, seats: this.startRematch() };
    this.rematchOffer = undefined;
    return { ok: true };
  }

  /** The store created the game of the rematch. */
  rematchCreated(nextGameId: string): void {
    this.rematch = { nextGameId };
  }

  /** The store could not create it: the players can offer again. */
  rematchFailed(): void {
    this.rematch = undefined;
  }

  resign(playerId: string): RoomResult<{ end: GameEnd }> {
    const color = this.colorOf(playerId);
    if (color === undefined) return refuse('unauthorized', 'You have no seat in this game');
    if (this.status !== 'active') return refuse('unauthorized', `The game is ${this.status}`);
    return { ok: true, end: this.finish(winnerResult(opposite(color)), 'resignation') };
  }

  /**
   * The player of that color loses by abandonment. The time limit is the caller's: it passes the color when its timer
   * fires, and this refuses if the player came back in the meantime, so a late timer cannot end a live game.
   */
  abandon(color: Color): RoomResult<{ end: GameEnd }> {
    if (this.status !== 'active') return refuse('unauthorized', `The game is ${this.status}`);
    if (this.seats[color]!.connections > 0) return refuse('unauthorized', `${color} is connected`);
    return { ok: true, end: this.finish(winnerResult(opposite(color)), 'abandonment') };
  }

  /** Closes a game nobody joined. A game that already started ends by resignation or abandonment instead. */
  abort(): RoomResult<{ end: GameEnd }> {
    if (this.status !== 'waiting') return refuse('unauthorized', `The game is ${this.status}`);
    return { ok: true, end: this.finish('*', 'aborted') };
  }

  /** The state one player receives; `yourColor` is the only part that differs between them. */
  stateFor(playerId: string): GameState {
    const view: PlayerView = this.colorOf(playerId) ?? 'spectator'; // reserved in v1: join() never lets a third identity in
    const seat = (color: Color): GameState['seats'][Color] => {
      const current = this.seats[color];
      return current === null ? null : { displayName: current.displayName, connected: current.connections > 0 };
    };
    return {
      gameId: this.gameId,
      fen: this.fen,
      moves: this.moves.map((move) => ({ ...move })),
      plyCount: this.plyCount,
      status: this.status,
      turn: this.position.turn,
      seats: { white: seat('white'), black: seat('black') },
      yourColor: view,
      ...(this.drawOffer === undefined ? {} : { drawOffer: this.drawOffer }),
      ...(this.rematchOffer === undefined ? {} : { rematchOffer: this.rematchOffer }),
      ...(this.rematch === undefined || this.rematch === 'creating' ? {} : { nextGameId: this.rematch.nextGameId }),
    };
  }

  /** What `rehydrate` needs. Connections are left out on purpose: they do not survive a restart. */
  snapshot(): RoomSnapshot {
    const seat = (color: Color): RoomPlayer | null => {
      const current = this.seats[color];
      return current === null ? null : { id: current.id, displayName: current.displayName };
    };
    return {
      gameId: this.gameId,
      seats: { white: seat('white'), black: seat('black') },
      moves: this.moves.map(({ ply, uci }) => ({ ply, uci })),
      ...(this.end === undefined ? {} : { end: { ...this.end } }),
    };
  }

  /** Plays a move if it is legal and ends the game if the position says so. Knows nothing about players or plies. */
  private apply(uci: string): MoveRecord | undefined {
    const parsed = parseUci(uci);
    if (parsed === undefined || isDrop(parsed)) return undefined;
    const move = normalizeMove(this.position, parsed);
    if (!this.position.isLegal(move)) return undefined;
    // e1h1 reaches here as a castling move, but in the contract's UCI it means a king capturing its own rook
    if (standardUci(this.position, move) !== uci) return undefined;

    const record: MoveRecord = { ply: this.plyCount + 1, uci, san: makeSan(this.position, move) };
    this.position.play(move);
    this.moves.push(record);
    // a move withdraws any offer: the one who offered moved on, or the rival declined it by playing
    this.drawOffer = undefined;
    const ending = terminationOf(this.position);
    if (ending !== undefined) this.finish(ending.result, ending.termination);
    return record;
  }

  /** Why no rematch can be offered or answered now, if that is the case. */
  private rematchClosed(): { ok: false; code: GameErrorCode; message: string } | undefined {
    if (this.status !== 'finished') return refuse('unauthorized', `The game is ${this.status}`);
    if (this.rematch !== undefined) return refuse('unauthorized', 'The rematch already started');
    return undefined;
  }

  private startRematch(): Record<Color, RoomPlayer> {
    this.rematchOffer = undefined;
    this.rematch = 'creating';
    const player = (color: Color): RoomPlayer => ({ id: this.seats[color]!.id, displayName: this.seats[color]!.displayName });
    return { white: player('black'), black: player('white') };
  }

  private finish(result: GameEnd['result'], termination: GameEnd['termination']): GameEnd {
    this.end = { gameId: this.gameId, result, termination };
    this.drawOffer = undefined;
    return { ...this.end };
  }
}
