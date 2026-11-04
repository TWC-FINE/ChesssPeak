import { Inject, Injectable } from '@nestjs/common';

export const HEALTH_PROBES = Symbol('HEALTH_PROBES');
export const PROBE_TIMEOUT_MS = 1000;

/** Each probe resolves when the database answers and rejects when it does not. */
export interface HealthProbes {
  postgres(): Promise<unknown>;
  mongo(): Promise<unknown>;
}

export type DatabaseState = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  databases: { postgres: DatabaseState; mongo: DatabaseState };
}

async function stateOf(probe: () => Promise<unknown>, timeoutMs: number): Promise<DatabaseState> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([probe(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(@Inject(HEALTH_PROBES) private readonly probes: HealthProbes) {}

  /** Never throws: a database that is down makes the report `degraded`, not the request fail. */
  async check(timeoutMs = PROBE_TIMEOUT_MS): Promise<HealthReport> {
    const [postgres, mongo] = await Promise.all([
      stateOf(() => this.probes.postgres(), timeoutMs),
      stateOf(() => this.probes.mongo(), timeoutMs),
    ]);
    return {
      status: postgres === 'up' && mongo === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      databases: { postgres, mongo },
    };
  }
}
