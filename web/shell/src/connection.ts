import type { ClientToServerEvents, ServerToClientEvents, SocketAuth } from '@chessspeak/shared';
import { io, type Socket } from 'socket.io-client';

export type GameConnection = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface ConnectionEvents {
  /** Connected, or connected again after losing the connection. */
  up(socket: GameConnection): void;
  down(): void;
  /** The server refused the token: the session is no longer valid, and retrying would not help. */
  refused(): void;
}

/** The only socket of the page. It reconnects by itself, except when the server refuses the token. */
export function connect(apiUrl: string, token: string, events: ConnectionEvents): GameConnection {
  // type-only import: a runtime import of shared would pull all of zod into this bundle, and the type already checks the version
  const auth: SocketAuth = { token, v: 1 };
  const socket: GameConnection = io(apiUrl, { auth });
  socket.on('connect', () => events.up(socket));
  socket.on('disconnect', () => events.down());
  socket.on('connect_error', (error) => {
    if (error.message === 'unauthorized') events.refused();
    else events.down();
  });
  return socket;
}
