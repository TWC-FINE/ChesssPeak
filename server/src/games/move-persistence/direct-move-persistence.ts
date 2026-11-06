import type { AppendMoveResult, GameMovesRepository } from '../../database/mongo/game-moves.repository';
import type { StoredMove } from '../../database/mongo/game-moves.schema';
import type { MovePersistence } from './move-persistence';

/** Writes from the server process itself, with no worker in between. */
export class DirectMovePersistence implements MovePersistence {
  constructor(private readonly repository: Pick<GameMovesRepository, 'appendMove'>) {}

  save(gameId: string, move: StoredMove): Promise<AppendMoveResult> {
    return this.repository.appendMove(gameId, move);
  }
}
