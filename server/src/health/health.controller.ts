import { Controller, Get } from '@nestjs/common';
import { PROTOCOL_VERSION } from '@chessspeak/shared';

@Controller('health')
export class HealthController {
  /** State of the process only; the databases are checked later. */
  @Get()
  check(): { status: 'ok'; uptimeSeconds: number; protocolVersion: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), protocolVersion: PROTOCOL_VERSION };
  }
}
