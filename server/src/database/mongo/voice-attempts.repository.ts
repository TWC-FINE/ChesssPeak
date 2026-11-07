import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { VoiceAttemptPayload } from '@chessspeak/shared';
import type { Model } from 'mongoose';
import { VoiceAttempt } from './voice-attempt.schema';

@Injectable()
export class VoiceAttemptsRepository {
  constructor(@InjectModel(VoiceAttempt.name) private readonly model: Model<VoiceAttempt>) {}

  /** `player` comes from the server, never from the payload; `createdAt` is set by the schema. */
  async save(attempt: VoiceAttemptPayload, player: string): Promise<void> {
    await this.model.create({ ...attempt, player });
  }
}
