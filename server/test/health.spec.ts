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
    expect(response.body).toMatchObject({ status: 'ok', databases: { postgres: 'up', mongo: 'up' } });
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

describe('HealthService timeout', () => {
  it('reports a database that does not answer as down once the time limit passes', async () => {
    const service = new HealthService({ postgres: hangs, mongo: up });
    const started = Date.now();
    const report = await service.check(60);
    expect(report.databases).toEqual({ postgres: 'down', mongo: 'up' });
    expect(Date.now() - started).toBeLessThan(500);
  });
});
