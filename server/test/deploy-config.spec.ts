import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { corsOrigins, dbConnectTimeoutMs } from '../src/deploy-config';
import { HealthController } from '../src/health/health.controller';
import { HEALTH_PROBES, HealthService } from '../src/health/health.service';

describe('corsOrigins', () => {
  it('splits the list, trims it and removes trailing slashes', () => {
    expect(corsOrigins({ CORS_ORIGINS: ' https://a.vercel.app/ , http://localhost:5500' })).toEqual(['https://a.vercel.app', 'http://localhost:5500']);
  });

  it('falls back to the local origins, never to an open policy', () => {
    const local = ['http://127.0.0.1:5500', 'http://localhost:5500'];
    expect(corsOrigins({})).toEqual(local);
    expect(corsOrigins({ CORS_ORIGINS: ' , ' })).toEqual(local);
  });
});

describe('dbConnectTimeoutMs', () => {
  it('reads the variable and keeps the short default otherwise', () => {
    expect(dbConnectTimeoutMs({ DB_CONNECT_TIMEOUT_MS: '10000' })).toBe(10000);
    expect(dbConnectTimeoutMs({})).toBe(1000);
    expect(dbConnectTimeoutMs({ DB_CONNECT_TIMEOUT_MS: 'nope' })).toBe(1000);
    expect(dbConnectTimeoutMs({ DB_CONNECT_TIMEOUT_MS: '0' })).toBe(1000);
  });
});

describe('CORS with the configured origins', () => {
  const app = async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: HEALTH_PROBES, useValue: { postgres: async () => 1, mongo: async () => 1 } }],
    }).compile();
    const nest = moduleRef.createNestApplication();
    nest.enableCors({ origin: corsOrigins({ CORS_ORIGINS: 'https://chessspeak.vercel.app/' }) });
    await nest.init();
    return nest;
  };

  it('answers an allowed origin', async () => {
    const nest = await app();
    const response = await request(nest.getHttpServer()).get('/health').set('Origin', 'https://chessspeak.vercel.app').expect(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://chessspeak.vercel.app');
    await nest.close();
  });

  it('does not allow any other origin', async () => {
    const nest = await app();
    const response = await request(nest.getHttpServer()).get('/health').set('Origin', 'https://evil.example').expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await nest.close();
  });
});
