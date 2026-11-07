import { Module } from '@nestjs/common';
import { VoiceMetricsGateway } from './voice-metrics.gateway';

@Module({ providers: [VoiceMetricsGateway] })
export class VoiceMetricsModule {}
