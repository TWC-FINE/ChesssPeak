import { Controller, Get } from '@nestjs/common';
import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Always 200: `status` is `degraded` when a database is down. */
  @Get()
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
