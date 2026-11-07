import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HEALTH_PROBES, HealthService, type HealthProbes } from '../src/health/health.service';

const up = () => Promise.resolve(1);
const down = () => Promise.reject(new Error('refused'));
const hangs = () => new Promise<never>(() => undefined);

async function appWith(probes: HealthProbes): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: HEALTH_PROBES, useValue: probes }],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health (unit, fake probes: no database needed)', () => {
  it('is ok when both databases answer', async () => {
    const app = await appWith({ postgres: up, mongo: up });
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', databases: { postgres: 'up', mongo: 'up' }, protocolVersion: 1 });
    expect(typeof response.body.uptimeSeconds).toBe('number');
    await app.close();
  });

  it('answers 200 and degraded when one database is down', async () => {
    const app = await appWith({ postgres: up, mongo: down });
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'degraded', databases: { postgres: 'up', mongo: 'down' } });
    await app.close();
  });

  it('answers 200 and degraded when both are down', async () => {
    const app = await appWith({ postgres: down, mongo: down });
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({ status: 'degraded', databases: { postgres: 'down', mongo: 'down' } });
    await app.close();
  });
});

describe('GET /health/live', () => {
  it('answers without asking the databases', async () => {
    const postgres = jest.fn(hangs);
    const mongo = jest.fn(hangs);
    const app = await appWith({ postgres, mongo });
    const response = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'live' });
    expect(postgres).not.toHaveBeenCalled();
    expect(mongo).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('HealthService timeout', () => {
  it('reports a database that does not answer as down once the time limit passes', async () => {
    const service = new HealthService({ postgres: hangs, mongo: up });
    const started = Date.now();
    const report = await service.check(60);
    expect(report.databases).toEqual({ postgres: 'down', mongo: 'up' });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('takes the time limit from HEALTH_PROBE_TIMEOUT_MS', async () => {
    const original = process.env.HEALTH_PROBE_TIMEOUT_MS;
    process.env.HEALTH_PROBE_TIMEOUT_MS = '60';
    try {
      const started = Date.now();
      const report = await new HealthService({ postgres: hangs, mongo: up }).check();
      expect(report.databases).toEqual({ postgres: 'down', mongo: 'up' });
      expect(Date.now() - started).toBeLessThan(500);
    } finally {
      if (original === undefined) delete process.env.HEALTH_PROBE_TIMEOUT_MS;
      else process.env.HEALTH_PROBE_TIMEOUT_MS = original;
    }
  });
});
