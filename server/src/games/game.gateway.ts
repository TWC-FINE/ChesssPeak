import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayDisconnect, type OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import {
  type ClientToServerEvents,
  type Color,
  gameJoinSchema,
  gameMoveSchema,
  gameResignSchema,
  type GameEnd,
  type GameErrorCode,
  type GameMoved,
  type Identity,
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
      next();
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.abandonTimers.values()) clearTimeout(timer);
    this.abandonTimers.clear();
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
      socket.emit('game:state', room.stateFor(player.id));
      this.tellEnd(socket, room);
      return;
    }
    const joined = room.join(player);
    if (!joined.ok) return this.refuse(socket, joined.code, joined.message);

    socket.data.games.add(room.gameId);
    await socket.join(room.gameId);
    this.cancelAbandon(room.gameId, joined.color);
    if (joined.activated) this.queue.push(room.gameId, 'activate', () => this.store.activate(room.gameId, joined.color, player));
    this.watchAbsentRival(room, joined.color, player.id);
    this.broadcastState(room);
    this.tellEnd(socket, room);
  }

  @SubscribeMessage('game:move')
  async move(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    const request = gameMoveSchema.safeParse(payload);
    if (!request.success) return this.refuse(socket, 'unauthorized', 'Invalid payload');
    const room = await this.joinedRoomOrRefuse(socket, request.data.gameId);
    if (room === undefined) return;

    const played = room.move(playerOf(socket.data.identity).id, request.data.uci, request.data.ply);
    if (!played.ok) return this.refuse(socket, played.code, played.message);

    this.saveMove(played.moved);
    this.server.to(room.gameId).emit('game:moved', played.moved);
    if (played.end !== undefined) this.finish(room, played.end);
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

  async handleDisconnect(socket: GameSocket): Promise<void> {
    const games = socket.data.games ?? new Set<string>();
    for (const gameId of games) {
      const room = await this.rooms.get(gameId).catch(() => null);
      if (room === null) continue;
      // another tab of the same player may still be open: only the last socket counts as leaving
      const left = room.disconnect(playerOf(socket.data.identity).id);
      if (left === undefined) continue;
      this.broadcastState(room);
      if (room.status === 'active') this.scheduleAbandon(room, left);
    }
  }

  private saveMove(moved: GameMoved): void {
    const stored = { ply: moved.ply, uci: moved.uci, san: moved.san, fen: moved.fen, at: new Date() };
    this.queue.push(moved.gameId, `move ${moved.ply}`, async () => {
      await this.persistence.save(moved.gameId, stored);
    });
  }

  private finish(room: GameRoom, end: GameEnd): void {
    for (const color of ['white', 'black'] as const) this.cancelAbandon(room.gameId, color);
    this.queue.push(room.gameId, 'finish', () => this.store.finish(end, room.status));
    this.server.to(room.gameId).emit('game:end', end);
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
      socket?.emit('game:state', room.stateFor(playerOf(socket.data.identity).id));
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
