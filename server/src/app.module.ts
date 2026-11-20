import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MongoModule } from './database/mongo/mongo.module';
import { PrismaModule } from './database/prisma.module';
import { GamesModule } from './games/games.module';
import { HealthModule } from './health/health.module';
import { RankingModule } from './ranking/ranking.module';
import { VoiceMetricsModule } from './voice-metrics/voice-metrics.module';

@Module({ imports: [PrismaModule, MongoModule, AuthModule, GamesModule, VoiceMetricsModule, HealthModule, RankingModule] })
export class AppModule {}
