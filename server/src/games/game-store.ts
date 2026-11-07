import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Color, GameEnd, GameStatus } from '@chessspeak/shared';
import type { Model } from 'mongoose';
import { GameMovesRepository } from '../database/mongo/game-moves.repository';
import { GameMoves } from '../database/mongo/game-moves.schema';
import { PrismaService } from '../database/prisma.service';
import type { RoomPlayer, RoomSnapshot } from './game-room';

// the ids of `games` are UUIDs, and Postgres raises an error for anything else instead of finding nothing
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What survives a restart: who plays and how it ended in Postgres, the moves in Mongo (ADR 3). */
@Injectable()
export class GameStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: GameMovesRepository,
    @InjectModel(GameMoves.name) private readonly moves: Model<GameMoves>,
  ) {}

  /** What GameRoom.rehydrate needs, or null when the game does not exist. Leaves the Mongo record ready for its moves. */
  async load(gameId: string): Promise<RoomSnapshot | null> {
    if (!UUID.test(gameId)) return null;
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (game === null) return null;

    await this.repository.createGame(gameId);
    const stored = await this.moves.findOne({ gameId }, { moves: 1 }).lean();

    const seat = (id: string | null, displayName: string | null): RoomPlayer | null => (id === null ? null : { id, displayName: displayName ?? '' });
    return {
      gameId,
      seats: { white: seat(game.whiteGuestId, game.whiteName), black: seat(game.blackGuestId, game.blackName) },
      moves: (stored?.moves ?? []).map(({ ply, uci }) => ({ ply, uci })),
      ...(game.result !== null && game.termination !== null
        ? { end: { gameId, result: game.result, termination: game.termination } as GameEnd }
        : {}),
    };
  }

  /** The second player took the free seat. Safe to retry. */
  async activate(gameId: string, color: Color, player: RoomPlayer): Promise<void> {
    const seat = color === 'white' ? { whiteGuestId: player.id, whiteName: player.displayName } : { blackGuestId: player.id, blackName: player.displayName };
    await this.prisma.game.update({ where: { id: gameId }, data: { ...seat, status: 'active' } });
    await this.setMongoStatus(gameId, 'active');
  }

  /** Safe to retry. */
  async finish(end: GameEnd, status: GameStatus): Promise<void> {
    await this.prisma.game.update({
      where: { id: end.gameId },
      data: { status, result: end.result, termination: end.termination, finishedAt: new Date() },
    });
    await this.setMongoStatus(end.gameId, status);
  }

  private async setMongoStatus(gameId: string, status: GameStatus): Promise<void> {
    await this.moves.updateOne({ gameId }, { $set: { status, updatedAt: new Date() } });
  }
}
