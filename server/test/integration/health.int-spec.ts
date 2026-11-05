import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

// Runs against the local _test databases (pnpm test:integration refuses anything else).
async function start(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/** The Mongo connection is lazy: give it a few seconds to come up. */
async function healthUntil(app: INestApplication, done: (body: { status: string }) => boolean) {
  let body: { status: string } = { status: 'none' };
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    body = response.body;
    if (done(body)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return body;
}

describe('GET /health (real databases)', () => {
  it('is ok with both databases up', async () => {
    const app = await start();
    const body = await healthUntil(app, (b) => b.status === 'ok');
    expect(body).toMatchObject({ status: 'ok', databases: { postgres: 'up', mongo: 'up' } });
    await app.close();
  });

  it('answers 200 and degraded, quickly, when the databases are unreachable', async () => {
    const saved = { pg: process.env.DATABASE_URL, mongo: process.env.MONGO_URI };
    process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/unreachable_test';
    process.env.MONGO_URI = 'mongodb://127.0.0.1:1/unreachable_test';
    try {
      const app = await start();
      const started = Date.now();
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      expect(response.body).toMatchObject({ status: 'degraded', databases: { postgres: 'down', mongo: 'down' } });
      expect(Date.now() - started).toBeLessThan(3000);
      await app.close();
    } finally {
      process.env.DATABASE_URL = saved.pg;
      process.env.MONGO_URI = saved.mongo;
    }
  });
});
