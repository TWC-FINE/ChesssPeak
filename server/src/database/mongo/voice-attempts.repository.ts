import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Recognizer, VoiceAttemptPayload, VoiceOutcome } from '@chessspeak/shared';
import type { Model } from 'mongoose';
import { VoiceAttempt } from './voice-attempt.schema';

/** What the summary reads of one attempt: no transcript text leaves this, only whether it was empty. */
export interface AttemptRow {
  recognizer: Recognizer;
  outcome: VoiceOutcome;
  accepted: boolean;
  silent: boolean;
  latency: { recognitionMs: number; totalMs: number };
  createdAt: Date;
}

@Injectable()
export class VoiceAttemptsRepository {
  constructor(@InjectModel(VoiceAttempt.name) private readonly model: Model<VoiceAttempt>) {}

  /** `player` comes from the server, never from the payload; `createdAt` is set by the schema. */
  async save(attempt: VoiceAttemptPayload, player: string): Promise<void> {
    await this.model.create({ ...attempt, player });
  }

  /** The most recent attempts of real games, newest first. Uses the index on `session`. */
  async recent(limit: number): Promise<AttemptRow[]> {
    const rows = await this.model
      .find({ session: 'play' }, { _id: 0, recognizer: 1, outcome: 1, accepted: 1, transcript: 1, latency: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map(({ transcript, latency, ...row }) => ({ ...row, silent: transcript === '', latency: { recognitionMs: latency.recognitionMs, totalMs: latency.totalMs } }));
  }
}
