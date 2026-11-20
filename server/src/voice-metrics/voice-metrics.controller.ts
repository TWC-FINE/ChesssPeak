import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { VOICE_SUMMARY_LIMIT, type VoiceSummaryResponse } from '@chessspeak/shared';
import { VoiceAttemptsRepository } from '../database/mongo/voice-attempts.repository';
import { summarizeVoice } from './voice-summary';

@Controller('voice-metrics')
export class VoiceMetricsController {
  private readonly logger = new Logger(VoiceMetricsController.name);

  constructor(private readonly attempts: VoiceAttemptsRepository) {}

  /** Public, like the ranking: counts and times only, never a transcript or a player. */
  @Get('summary')
  async summary(): Promise<VoiceSummaryResponse> {
    try {
      return summarizeVoice(await this.attempts.recent(VOICE_SUMMARY_LIMIT), VOICE_SUMMARY_LIMIT);
    } catch (error) {
      this.logger.error(`Could not read the voice attempts: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not read the voice attempts');
    }
  }
}
