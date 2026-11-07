import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const RECOGNIZERS = ['webspeech', 'whisper', 'text', 'fake'] as const;
export const VOICE_OUTCOMES = ['move', 'ambiguous', 'nomatch', 'command'] as const;

/** One recognition attempt (telemetry). Never audio. `player` and `createdAt` are set by the server, never by the client. */
@Schema({ collection: 'voice_attempts' })
export class VoiceAttempt {
  @Prop({ type: String, required: true })
  gameId!: string;

  /** Set by the server from the socket identity. */
  @Prop({ type: String, required: true })
  player!: string;

  @Prop({ type: Number, required: true, min: 1 })
  ply!: number;

  @Prop({ type: String, required: true })
  fen!: string;

  @Prop({ type: String, required: true })
  lang!: string;

  @Prop({ type: String, enum: RECOGNIZERS, required: true })
  recognizer!: (typeof RECOGNIZERS)[number];

  @Prop({ type: [{ _id: false, transcript: String, confidence: Number }], default: [] })
  alternatives!: { transcript: string; confidence?: number }[];

  /** Empty after a silence, which is still an attempt; `required` would reject it. The contract already requires the field. */
  @Prop({ type: String, default: '' })
  transcript!: string;

  @Prop({ type: String, default: '' })
  normalized!: string;

  @Prop({ type: [{ _id: false, uci: String, score: Number }], default: [] })
  candidates!: { uci: string; score: number }[];

  @Prop({ type: String, default: null })
  resolvedUci!: string | null;

  /** Only in evaluation sessions. */
  @Prop({ type: String, required: false })
  expectedUci?: string;

  @Prop({ type: String, enum: VOICE_OUTCOMES, required: true })
  outcome!: (typeof VOICE_OUTCOMES)[number];

  @Prop({ type: Boolean, required: true })
  accepted!: boolean;

  @Prop({ type: Number, required: true, min: 1 })
  tryIndex!: number;

  @Prop({
    type: { _id: false, recognitionMs: Number, resolveMs: Number, totalMs: Number },
    required: true,
  })
  latency!: { recognitionMs: number; resolveMs: number; totalMs: number };

  @Prop({ type: String, required: true })
  session!: string;

  /** Set by the server. */
  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

export type VoiceAttemptDocument = HydratedDocument<VoiceAttempt>;
export const VoiceAttemptSchema = SchemaFactory.createForClass(VoiceAttempt);
VoiceAttemptSchema.index({ gameId: 1, createdAt: 1 });
VoiceAttemptSchema.index({ session: 1 });
VoiceAttemptSchema.index({ recognizer: 1, createdAt: 1 });
