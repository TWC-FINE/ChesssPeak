import { Injectable } from '@nestjs/common';
import type { ProfileResponse, RankingResponse, Termination } from '@chessspeak/shared';
import { PrismaService } from '../database/prisma.service';
import { buildProfile, buildRanking, type DecisiveResult, type ProfiledGame } from './elo';

/** Rows GET /ranking returns. The ratings still come from every finished game. */
export const RANKING_SIZE = 50;

const DECISIVE_RESULTS: DecisiveResult[] = ['1-0', '0-1', '1/2-1/2'];

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputed from Postgres on every call: there is no stored rating to keep in sync, and the number of games
   * is small. Aborted games (`*`) and games without both names do not count.
   */
  async ranking(): Promise<RankingResponse> {
    const { entries, gamesRated } = buildRanking(await this.ratedGames());
    return { entries: entries.slice(0, RANKING_SIZE), gamesRated };
  }

  /** The profile of one player, from the same games as the ranking; undefined when the name has none. */
  async profile(displayName: string): Promise<ProfileResponse | undefined> {
    return buildProfile(await this.ratedGames(), displayName);
  }

  private async ratedGames(): Promise<ProfiledGame[]> {
    const rows = await this.prisma.game.findMany({
      where: { status: 'finished', result: { in: DECISIVE_RESULTS }, whiteName: { not: null }, blackName: { not: null } },
      orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, whiteName: true, blackName: true, result: true, termination: true, finishedAt: true },
    });
    const games: ProfiledGame[] = [];
    for (const { id, whiteName, blackName, result, termination, finishedAt } of rows) {
      if (whiteName === null || blackName === null || !DECISIVE_RESULTS.includes(result as DecisiveResult)) continue;
      games.push({ gameId: id, whiteName, blackName, result: result as DecisiveResult, termination: termination as Termination | null, finishedAt });
    }
    return games;
  }
}
