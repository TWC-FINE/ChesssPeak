import type { AppendMoveResult } from '../../database/mongo/game-moves.repository';
import type { StoredMove } from '../../database/mongo/game-moves.schema';

export const MOVE_PERSISTENCE = Symbol('MOVE_PERSISTENCE');

/** Saves a move that GameRoom already accepted. It stores only: GameRoom is the one that validates. */
export interface MovePersistence {
  save(gameId: string, move: StoredMove): Promise<AppendMoveResult>;
}
