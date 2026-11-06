import type { GameMovesRepository } from '../../database/mongo/game-moves.repository';
import { DirectMovePersistence } from './direct-move-persistence';
import type { MovePersistence } from './move-persistence';

type Env = Record<string, string | undefined>;

/** How many move workers to use. 0, the default, means writing directly. */
export function moveWorkers(env: Env = process.env): number {
  const value = (env.MOVE_WORKERS ?? '').trim();
  if (value === '') return 0;
  if (!/^\d+$/.test(value)) throw new Error(`MOVE_WORKERS must be a whole number, got "${value}"`);
  return Number(value);
}

export function createMovePersistence(repository: Pick<GameMovesRepository, 'appendMove'>, env: Env = process.env): MovePersistence {
  const workers = moveWorkers(env);
  // refuse to start rather than write directly while the configuration claims a pool
  if (workers > 0) throw new Error(`MOVE_WORKERS=${workers} needs the move-worker pool, which does not exist yet; use 0`);
  return new DirectMovePersistence(repository);
}
