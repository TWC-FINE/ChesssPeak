import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** State of the process only; the databases are checked later. */
  @Get()
  check(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
