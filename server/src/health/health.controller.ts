import { Controller, Get } from '@nestjs/common';
import { PROTOCOL_VERSION } from '@chessspeak/shared';
import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Always 200: `status` is `degraded` when a database is down. */
  @Get()
  async check(): Promise<HealthReport & { protocolVersion: number }> {
    return { ...(await this.health.check()), protocolVersion: PROTOCOL_VERSION };
  }

  /** For the hosting platform's health check: answers without touching the databases, so a slow one cannot get the instance restarted. */
  @Get('live')
  live(): { status: 'live' } {
    return { status: 'live' };
  }
}
