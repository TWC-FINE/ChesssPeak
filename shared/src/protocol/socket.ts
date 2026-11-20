import { z } from 'zod';
import type { GameDrawAnswer, GameDrawOffer, GameJoin, GameMove, GameRematchAnswer, GameRematchOffer, GameResign, VoiceAttemptPayload } from './client.js';
import type { GameDraw, GameEnd, GameError, GameMoved, GameRematch, GameState } from './server.js';

/**
 * Socket.IO handshake: `io(url, { auth: { token, v: 1 } })`.
 * The server rejects the connection when `v` is not a version it supports.
 */
export const socketAuthSchema = z.object({ token: z.string().min(1), v: z.literal(1) }).strict();
export type SocketAuth = z.infer<typeof socketAuthSchema>;

/** Typed events for `Socket<ServerToClientEvents, ClientToServerEvents>` (client) and `Server<ClientToServerEvents, ServerToClientEvents>`. */
export interface ClientToServerEvents {
  'game:join': (payload: GameJoin) => void;
  'game:move': (payload: GameMove) => void;
  'game:resign': (payload: GameResign) => void;
  'game:draw-offer': (payload: GameDrawOffer) => void;
  'game:draw-answer': (payload: GameDrawAnswer) => void;
  'game:rematch-offer': (payload: GameRematchOffer) => void;
  'game:rematch-answer': (payload: GameRematchAnswer) => void;
  'voice:attempt': (payload: VoiceAttemptPayload) => void;
}

export interface ServerToClientEvents {
  'game:state': (payload: GameState) => void;
  'game:moved': (payload: GameMoved) => void;
  'game:end': (payload: GameEnd) => void;
  'game:draw': (payload: GameDraw) => void;
  'game:rematch': (payload: GameRematch) => void;
  'game:error': (payload: GameError) => void;
}

/**
 * The part of a socket.io-client `Socket` that `<mf-game>` uses. Structural, so `shared`
 * does not depend on socket.io; the real socket satisfies it.
 */
export interface GameSocket {
  emit<E extends keyof ClientToServerEvents>(event: E, ...args: Parameters<ClientToServerEvents[E]>): unknown;
  on<E extends keyof ServerToClientEvents>(event: E, listener: ServerToClientEvents[E]): unknown;
  off<E extends keyof ServerToClientEvents>(event: E, listener?: ServerToClientEvents[E]): unknown;
}
