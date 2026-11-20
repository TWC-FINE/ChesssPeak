import { randomInt } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { OPEN_GAME_MAX_AGE_MS, OPEN_GAMES_LIMIT, type Color, type CreateGameRequest, type Identity, type OpenGame } from '@chessspeak/shared';
import { PrismaService } from '../database/prisma.service';

/** The creator's color. `random`, or no choice at all, is drawn here by the server. */
export function pickColor(requested: CreateGameRequest['color'], draw: () => number = () => randomInt(2)): Color {
  if (requested === 'white' || requested === 'black') return requested;
  return draw() === 0 ? 'white' : 'black';
}

function seatFor(identity: Identity, color: Color) {
  const id = identity.kind === 'guest' ? { guestId: identity.guestId } : { userId: identity.userId };
  return color === 'white'
    ? { whiteGuestId: id.guestId, whiteUserId: id.userId, whiteName: identity.displayName }
    : { blackGuestId: id.guestId, blackUserId: id.userId, blackName: identity.displayName };
}

/** What GET /games/open reads of a row of `games`. */
export interface WaitingRow {
  id: string;
  whiteName: string | null;
  blackName: string | null;
  clockMs: number | null;
  clockIncrementMs?: number | null;
  createdAt: Date;
}

/** A waiting game as the lobby shows it; a row with no creator seat (damaged data) is left out. */
export function openGameOf(row: WaitingRow): OpenGame | undefined {
  const creatorColor: Color | undefined = row.whiteName !== null ? 'white' : row.blackName !== null ? 'black' : undefined;
  if (creatorColor === undefined) return undefined;
  return {
    gameId: row.id,
    creator: (creatorColor === 'white' ? row.whiteName : row.blackName)!,
    creatorColor,
    ...(row.clockMs === null ? {} : { clockMs: row.clockMs }),
    ...(row.clockIncrementMs == null ? {} : { incrementMs: row.clockIncrementMs }),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a game in `waiting`, with the creator's seat reserved. The other seat stays empty until game:join.
   * With `clockMinutes`, each player gets that much time, and with `incrementSeconds` too, that much more per move.
   */
  async create(
    identity: Identity,
    requested: CreateGameRequest['color'],
    clockMinutes?: CreateGameRequest['clockMinutes'],
    incrementSeconds?: CreateGameRequest['incrementSeconds'],
  ): Promise<string> {
    try {
      const clock =
        clockMinutes === undefined
          ? {}
          : { clockMs: clockMinutes * 60_000, ...(incrementSeconds === undefined || incrementSeconds === 0 ? {} : { clockIncrementMs: incrementSeconds * 1000 }) };
      const data = { ...seatFor(identity, pickColor(requested)), ...clock };
      const game = await this.prisma.game.create({ data, select: { id: true } });
      return game.id;
    } catch (error) {
      this.logger.error(`Could not create a game: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not create the game');
    }
  }

  /** Recent games waiting for a rival, newest first. Postgres is the record: a game that just started may still show. */
  async open(now: number = Date.now()): Promise<OpenGame[]> {
    try {
      const rows = await this.prisma.game.findMany({
        where: { status: 'waiting', createdAt: { gte: new Date(now - OPEN_GAME_MAX_AGE_MS) } },
        orderBy: { createdAt: 'desc' },
        take: OPEN_GAMES_LIMIT,
        select: { id: true, whiteName: true, blackName: true, clockMs: true, clockIncrementMs: true, createdAt: true },
      });
      return rows.flatMap((row) => openGameOf(row) ?? []);
    } catch (error) {
      this.logger.error(`Could not read the open games: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not read the open games');
    }
  }
}
