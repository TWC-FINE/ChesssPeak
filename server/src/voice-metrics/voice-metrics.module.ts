import { Module } from '@nestjs/common';
import { VoiceMetricsController } from './voice-metrics.controller';
import { VoiceMetricsGateway } from './voice-metrics.gateway';

@Module({ controllers: [VoiceMetricsController], providers: [VoiceMetricsGateway] })
export class VoiceMetricsModule {}
