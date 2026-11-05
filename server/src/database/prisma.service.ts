import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { dbConnectTimeoutMs } from '../deploy-config';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Postgres client. It connects lazily: creating it never fails when the database is down,
 * so the server (and /health) can start and report a degraded state.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL ?? 'postgresql://unset:unset@127.0.0.1:5432/unset';
    super({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: dbConnectTimeoutMs() }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
