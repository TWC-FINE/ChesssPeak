import { Injectable } from '@nestjs/common';
import type { RankingResponse } from '@chessspeak/shared';
import { PrismaService } from '../database/prisma.service';
import { buildRanking, type DecisiveResult, type RatedGame } from './elo';

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
    const rows = await this.prisma.game.findMany({
      where: { status: 'finished', result: { in: DECISIVE_RESULTS }, whiteName: { not: null }, blackName: { not: null } },
      orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
      select: { whiteName: true, blackName: true, result: true },
    });
    const games: RatedGame[] = [];
    for (const { whiteName, blackName, result } of rows) {
      if (whiteName === null || blackName === null || !DECISIVE_RESULTS.includes(result as DecisiveResult)) continue;
      games.push({ whiteName, blackName, result: result as DecisiveResult });
    }
    const { entries, gamesRated } = buildRanking(games);
    return { entries: entries.slice(0, RANKING_SIZE), gamesRated };
  }
}
