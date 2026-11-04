import { Module } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { MONGO_CONNECT_OPTIONS, mongoUri } from '../database/mongo/mongo.config';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';
import { HEALTH_PROBES, HealthService, type HealthProbes } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: HEALTH_PROBES,
      inject: [PrismaService, getConnectionToken()],
      useFactory: (prisma: PrismaService, mongo: Connection): HealthProbes => ({
        postgres: () => prisma.$queryRaw`SELECT 1`,
        mongo: async () => {
          if (mongo.readyState !== 1) {
            // a first connection that failed is not retried by Mongoose: try again, without waiting for it
            if (mongo.readyState === 0) void mongo.openUri(mongoUri(), MONGO_CONNECT_OPTIONS).catch(() => undefined);
            throw new Error('mongo not connected');
          }
          await mongo.db?.admin().ping();
        },
      }),
    },
  ],
})
export class HealthModule {}
