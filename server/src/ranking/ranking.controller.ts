import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { RankingResponse } from '@chessspeak/shared';
import { RankingService } from './ranking.service';

@Controller('ranking')
export class RankingController {
  private readonly logger = new Logger(RankingController.name);

  constructor(private readonly ranking: RankingService) {}

  /** Public: it only shows display names and results, which both players already saw. */
  @Get()
  async list(): Promise<RankingResponse> {
    try {
      return await this.ranking.ranking();
    } catch (error) {
      this.logger.error(`Could not read the ranking: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not read the ranking');
    }
  }
}
