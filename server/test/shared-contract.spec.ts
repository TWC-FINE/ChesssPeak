import {
  PROTOCOL_VERSION,
  gameMoveSchema,
  socketAuthSchema,
  type ClientToServerEvents,
  type GameMove,
} from '@chessspeak/shared';

describe('@chessspeak/shared from the CommonJS server', () => {
  it('resolves to the compiled CommonJS build, not the TypeScript source', () => {
    expect(require.resolve('@chessspeak/shared').replace(/\\/g, '/')).toMatch(/shared\/dist\/cjs\/index\.js$/);
  });

  it('validates with the same schemas as the clients', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    const move: GameMove = gameMoveSchema.parse({ gameId: 'g1', uci: 'e2e4', ply: 1 });
    expect(move.uci).toBe('e2e4');
    expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'e2e4', ply: 1, color: 'white' }).success).toBe(false);
    expect(socketAuthSchema.safeParse({ token: 't', v: 2 }).success).toBe(false);
  });

  it('exposes the typed Socket.IO events', () => {
    const handler: ClientToServerEvents['game:move'] = (payload) => {
      expect(payload.ply).toBe(1);
    };
    handler({ gameId: 'g1', uci: 'e2e4', ply: 1 });
  });
});
