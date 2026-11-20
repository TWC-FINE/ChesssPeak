import { BadRequestException, Controller, Get, Logger, NotFoundException, Param, ServiceUnavailableException } from '@nestjs/common';
import { profileNameSchema, type ProfileResponse, type RankingResponse } from '@chessspeak/shared';
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

  /** Public, like the ranking: one player's row, recent games and rating over time. */
  @Get(':displayName')
  async profile(@Param('displayName') raw: string): Promise<ProfileResponse> {
    const name = profileNameSchema.safeParse(raw);
    if (!name.success) throw new BadRequestException('Invalid display name');
    let profile: ProfileResponse | undefined;
    try {
      profile = await this.ranking.profile(name.data);
    } catch (error) {
      this.logger.error(`Could not read the profile: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not read the profile');
    }
    if (profile === undefined) throw new NotFoundException('No rated games for that player');
    return profile;
  }
}
