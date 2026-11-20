import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import {
  type ClientToServerEvents,
  type Color,
  gameDrawAnswerSchema,
  gameDrawOfferSchema,
  gameJoinSchema,
  gameMoveSchema,
  gameReactSchema,
  gameRematchAnswerSchema,
  gameRematchOfferSchema,
  gameResignSchema,
  type GameEnd,
  type GameErrorCode,
  type GameMoved,
  type Identity,
  REACTION_COOLDOWN_MS,
  type ServerToClientEvents,
  socketAuthSchema,
} from '@chessspeak/shared';
import type { Server, Socket } from 'socket.io';
import { GuestTokenService } from '../auth/guest-token.service';
import { abandonTimeoutMs, corsOrigins } from '../deploy-config';
import type { GameRoom, RoomPlayer } from './game-room';
import { GameRooms } from './game-rooms';
import { GameStore } from './game-store';
import { MOVE_PERSISTENCE, type MovePersistence } from './move-persistence/move-persistence';
import { PerGameQueue } from './per-game-queue';

interface SocketData {
  identity: Identity;
  /** The games this socket joined, so that closing it counts once in each. */
  games: Set<string>;
  /** Those of `games` it joined without a seat, as a spectator. */
  watching: Set<string>;
  /** When this socket last reacted, for REACTION_COOLDOWN_MS. */
  reactedAt?: number;
}
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const playerOf = (identity: Identity): RoomPlayer => ({ id: identity.kind === 'guest' ? identity.guestId : identity.userId, displayName: identity.displayName });

/**
 * Socket events of a game. The identity comes from the token of the handshake. GameRoom changes synchronously and
 * decides everything; only then this class saves (write-behind, in order) and tells the players.
 */
@WebSocketGateway({ cors: { origin: corsOrigins() } })
export class GameGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(GameGateway.name);
  private readonly abandonMs = abandonTimeoutMs();
  private readonly abandonTimers = new Map<string, NodeJS.Timeout>();
  /** One per game with a running clock: it fires when the player to move runs out of time. */
  private readonly flagTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer() private readonly server!: GameServer;

  constructor(
    private readonly tokens: GuestTokenService,
    private readonly rooms: GameRooms,
    private readonly store: GameStore,
    private readonly queue: PerGameQueue,
    @Inject(MOVE_PERSISTENCE) private readonly persistence: MovePersistence,
  ) {}

  afterInit(server: GameServer): void {
    server.use((socket, next) => {
      const auth = socketAuthSchema.safeParse(socket.handshake.auth);
      const identity = auth.success ? this.tokens.verify(auth.data.token) : undefined;
      if (identity === undefined) return next(new Error('unauthorized'));
      socket.data.identity = identity;
      socket.data.games = new Set();
      socket.data.watching = new Set();
      next();
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.abandonTimers.values()) clearTimeout(timer);
    this.abandonTimers.clear();
    for (const timer of this.flagTimers.values()) clearTimeout(timer);
    this.flagTimers.clear();
  }

  @SubscribeMessage('game:join')
  async join(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameJoinSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.roomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const player = playerOf(socket.data.identity);
    // a repeated join from the same socket only asks for the state again: it is not a second connection
    if (socket.data.games.has(room.gameId)) {
      socket.emit('game:state', room.stateFor(player.id, Date.now()));
      this.tellEnd(socket, room);
      return;
    }
    const joined = room.join(player);
    if (!joined.ok) return this.refuse(socket, joined.code, joined.message);

    socket.data.games.add(room.gameId);
    await socket.join(room.gameId);
    if (joined.color === 'spectator') {
      socket.data.watching.add(room.gameId);
    } else {
      const color = joined.color;
      this.cancelAbandon(room.gameId, color);
      if (joined.activated) this.queue.push(room.gameId, 'activate', () => this.store.activate(room.gameId, color, player));
      this.watchAbsentRival(room, color, player.id);
    }
    // after a restart no timer runs: the first join of the game starts it again
    if (!this.flagTimers.has(room.gameId)) this.scheduleFlag(room);
    this.broadcastState(room);
    this.tellEnd(socket, room);
  }

  @SubscribeMessage('game:move')
  async move(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameMoveSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const now = Date.now();
    // a move that arrives after the time ran out loses on time, even if the timer has not fired yet
    const flagged = room.flag(now);
    if (flagged.ok) return this.finish(room, flagged.end);
    const played = room.move(playerOf(socket.data.identity).id, request.data.uci, request.data.ply, now);
    if (!played.ok) return this.refuse(socket, played.code, played.message);

    this.saveMove(played.moved, now);
    this.server.to(room.gameId).emit('game:moved', played.moved);
    if (played.end !== undefined) return this.finish(room, played.end);
    this.scheduleFlag(room);
  }

  @SubscribeMessage('game:resign')
  async resign(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameResignSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const resigned = room.resign(playerOf(socket.data.identity).id);
    if (!resigned.ok) return this.refuse(socket, resigned.code, resigned.message);
    this.finish(room, resigned.end);
  }

  @SubscribeMessage('game:draw-offer')
  async offerDraw(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameDrawOfferSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const offered = room.offerDraw(playerOf(socket.data.identity).id);
    if (!offered.ok) return this.refuse(socket, offered.code, offered.message);
    if ('end' in offered) return this.finish(room, offered.end);
    this.server.to(room.gameId).emit('game:draw', { gameId: room.gameId, offeredBy: offered.offeredBy });
  }

  @SubscribeMessage('game:draw-answer')
  async answerDraw(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameDrawAnswerSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const answered = room.answerDraw(playerOf(socket.data.identity).id, request.data.accept);
    if (!answered.ok) return this.refuse(socket, answered.code, answered.message);
    if (answered.end !== undefined) return this.finish(room, answered.end);
    this.server.to(room.gameId).emit('game:draw', { gameId: room.gameId, offeredBy: null });
  }

  @SubscribeMessage('game:rematch-offer')
  async offerRematch(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameRematchOfferSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const offered = room.offerRematch(playerOf(socket.data.identity).id);
    if (!offered.ok) return this.refuse(socket, offered.code, offered.message);
    if ('seats' in offered) return this.startRematch(room, offered.seats);
    this.server.to(room.gameId).emit('game:rematch', { gameId: room.gameId, offeredBy: offered.offeredBy });
  }

  @SubscribeMessage('game:rematch-answer')
  async answerRematch(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameRematchAnswerSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const answered = room.answerRematch(playerOf(socket.data.identity).id, request.data.accept);
    if (!answered.ok) return this.refuse(socket, answered.code, answered.message);
    if (answered.seats !== undefined) return this.startRematch(room, answered.seats);
    this.server.to(room.gameId).emit('game:rematch', { gameId: room.gameId, offeredBy: null });
  }

  /** Relayed to the room and forgotten. Too many in a row are dropped without an answer: that is not an error to show. */
  @SubscribeMessage('game:react')
  async react(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameReactSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const now = Date.now();
    if (socket.data.reactedAt !== undefined && now - socket.data.reactedAt < REACTION_COOLDOWN_MS) return;
    // taken before the await: two reactions sent together would otherwise both get past the check
    socket.data.reactedAt = now;
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const reacted = room.react(playerOf(socket.data.identity).id);
    if (!reacted.ok) return this.refuse(socket, reacted.code, reacted.message);
    this.server.to(room.gameId).emit('game:reaction', { gameId: room.gameId, from: reacted.from, reaction: request.data.reaction });
  }

  async handleDisconnect(socket: GameSocket): Promise<void> {
    const games = socket.data.games ?? new Set<string>();
    for (const gameId of games) {
      const room = await this.rooms.get(gameId).catch(() => null);
      if (room === null) continue;
      // another tab of the same player may still be open: only the last socket counts as leaving
      const left = room.disconnect(playerOf(socket.data.identity).id);
      if (left === undefined) continue;
      this.broadcastState(room);
      // a spectator who leaves abandons nothing
      if (left !== 'spectator' && room.status === 'active') this.scheduleAbandon(room, left);
    }
  }

  /** `at` is the time the room used for the clock, so a restart rebuilds the same clock from it. */
  private saveMove(moved: GameMoved, at: number): void {
    const stored = { ply: moved.ply, uci: moved.uci, san: moved.san, fen: moved.fen, at: new Date(at) };
    this.queue.push(moved.gameId, `move ${moved.ply}`, async () => {
      await this.persistence.save(moved.gameId, stored);
    });
  }

  private finish(room: GameRoom, end: GameEnd): void {
    for (const color of ['white', 'black'] as const) this.cancelAbandon(room.gameId, color);
    this.cancelFlag(room.gameId);
    this.queue.push(room.gameId, 'finish', () => this.store.finish(end, room.status));
    this.server.to(room.gameId).emit('game:end', end);
  }

  /**
   * Both want the rematch: the new game is created before anyone is told, so `nextGameId` always exists. If the store
   * fails, the offer is gone and they can offer again.
   */
  private async startRematch(room: GameRoom, seats: Record<Color, RoomPlayer>): Promise<void> {
    let nextGameId: string;
    try {
      nextGameId = await this.store.createActive(seats, room.clockMs, room.incrementMs);
    } catch (error) {
      this.logger.error(`Could not create the rematch of ${room.gameId}: ${(error as Error).message}`);
      room.rematchFailed();
      this.server.to(room.gameId).emit('game:rematch', { gameId: room.gameId, offeredBy: null });
      return;
    }
    room.rematchCreated(nextGameId);
    this.server.to(room.gameId).emit('game:rematch', { gameId: room.gameId, offeredBy: null, nextGameId });
  }

  /** Sets the timer of the clock that runs now, if any. GameRoom checks the time again when it fires. */
  private scheduleFlag(room: GameRoom): void {
    this.cancelFlag(room.gameId);
    const ms = room.msToFlag(Date.now());
    if (ms === undefined) return;
    const timer = setTimeout(() => {
      this.flagTimers.delete(room.gameId);
      const flagged = room.flag(Date.now());
      if (flagged.ok) this.finish(room, flagged.end);
      else this.scheduleFlag(room);
    }, ms + 1);
    timer.unref();
    this.flagTimers.set(room.gameId, timer);
  }

  private cancelFlag(gameId: string): void {
    clearTimeout(this.flagTimers.get(gameId));
    this.flagTimers.delete(gameId);
  }

  private scheduleAbandon(room: GameRoom, color: Color): void {
    this.cancelAbandon(room.gameId, color);
    const timer = setTimeout(() => {
      this.abandonTimers.delete(`${room.gameId}:${color}`);
      const abandoned = room.abandon(color);
      if (abandoned.ok) this.finish(room, abandoned.end);
    }, this.abandonMs);
    timer.unref();
    this.abandonTimers.set(`${room.gameId}:${color}`, timer);
  }

  private cancelAbandon(gameId: string, color: Color): void {
    const key = `${gameId}:${color}`;
    clearTimeout(this.abandonTimers.get(key));
    this.abandonTimers.delete(key);
  }

  /** After a restart nobody is connected and no timer runs: the rival's time starts when this player comes back. */
  private watchAbsentRival(room: GameRoom, color: Color, playerId: string): void {
    if (room.status !== 'active') return;
    const rival: Color = color === 'white' ? 'black' : 'white';
    const absent = room.stateFor(playerId).seats[rival]?.connected === false;
    if (absent && !this.abandonTimers.has(`${room.gameId}:${rival}`)) this.scheduleAbandon(room, rival);
  }

  /** game:state does not carry the result: whoever comes back to a finished game learns it here. */
  private tellEnd(socket: GameSocket, room: GameRoom): void {
    const end = room.result;
    if (end !== undefined) socket.emit('game:end', end);
  }

  /** Each player gets their own view: `yourColor` differs. */
  private broadcastState(room: GameRoom): void {
    for (const id of this.server.sockets.adapter.rooms.get(room.gameId) ?? []) {
      const socket = this.server.sockets.sockets.get(id);
      socket?.emit('game:state', room.stateFor(playerOf(socket.data.identity).id, Date.now()));
    }
  }

  private async joinedRoomOrRefuse(socket: GameSocket, gameId: string): Promise<GameRoom | undefined> {
    const room = await this.roomOrRefuse(socket, gameId);
    if (room === undefined) return undefined;
    if (!socket.data.games.has(gameId)) {
      this.refuse(socket, 'unauthorized', 'Join the game first');
      return undefined;
    }
    return room;
  }

  private async roomOrRefuse(socket: GameSocket, gameId: string): Promise<GameRoom | undefined> {
    try {
      const room = await this.rooms.get(gameId);
      if (room === null) this.refuse(socket, 'not_found', 'The game does not exist');
      return room ?? undefined;
    } catch (error) {
      // the contract has no code for this, and a new one would need v: 2
      this.logger.error(`Could not load game ${gameId}: ${(error as Error).message}`);
      this.refuse(socket, 'not_found', 'The game could not be loaded');
      return undefined;
    }
  }

  private refuse(socket: GameSocket, code: GameErrorCode, message: string): void {
    socket.emit('game:error', { code, message });
  }
}
