import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const GAME_STATUSES = ['waiting', 'active', 'finished', 'aborted'] as const;
export type MongoGameStatus = (typeof GAME_STATUSES)[number];

/** One move of a game, as stored. `at` is set by the server. */
export interface StoredMove {
  ply: number;
  uci: string;
  san: string;
  fen: string;
  at: Date;
}

/** Append-only record of the moves of a game (write-behind from the in-memory GameRoom). */
@Schema({ collection: 'game_moves' })
export class GameMoves {
  @Prop({ type: String, required: true, unique: true })
  gameId!: string;

  /** Half-moves stored so far; also the idempotency guard of appendMove. */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  plyCount!: number;

  @Prop({
    type: [{ _id: false, ply: Number, uci: String, san: String, fen: String, at: Date }],
    default: [],
  })
  moves!: StoredMove[];

  @Prop({ type: String, enum: GAME_STATUSES, required: true, default: 'waiting' })
  status!: MongoGameStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  updatedAt!: Date;
}

export type GameMovesDocument = HydratedDocument<GameMoves>;
export const GameMovesSchema = SchemaFactory.createForClass(GameMoves);
