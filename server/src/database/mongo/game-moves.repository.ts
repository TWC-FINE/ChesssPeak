import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { GameMoves, type StoredMove } from './game-moves.schema';

export type AppendMoveResult =
  | { outcome: 'applied' }
  /** plyCount >= ply: the move was already stored (a retry); nothing changed. */
  | { outcome: 'duplicate'; plyCount: number }
  /** plyCount < ply - 1: an earlier write is missing; nothing was written. */
  | { outcome: 'gap'; plyCount: number };

@Injectable()
export class GameMovesRepository {
  private readonly logger = new Logger(GameMovesRepository.name);

  constructor(@InjectModel(GameMoves.name) private readonly model: Model<GameMoves>) {}

  /** Creates the record of a game (once). */
  async createGame(gameId: string): Promise<void> {
    await this.model.updateOne({ gameId }, { $setOnInsert: { gameId, plyCount: 0, moves: [], status: 'waiting', updatedAt: new Date() } }, { upsert: true });
  }

  /**
   * Idempotent append: it only matches when the stored plyCount is exactly ply - 1, so a retried
   * write cannot duplicate a move and a missing earlier write is detected instead of hidden.
   */
  async appendMove(gameId: string, move: StoredMove): Promise<AppendMoveResult> {
    const result = await this.model.updateOne(
      { gameId, plyCount: move.ply - 1 },
      { $push: { moves: move }, $inc: { plyCount: 1 }, $set: { updatedAt: new Date() } },
    );
    if (result.matchedCount === 1) return { outcome: 'applied' };

    const current = await this.model.findOne({ gameId }, { plyCount: 1 }).lean();
    const plyCount = current?.plyCount ?? 0;
    if (current !== null && plyCount >= move.ply) return { outcome: 'duplicate', plyCount };

    this.logger.error(`appendMove: gap in game ${gameId}: stored plyCount ${plyCount}, move ply ${move.ply} (an earlier write is missing)`);
    return { outcome: 'gap', plyCount };
  }
}
