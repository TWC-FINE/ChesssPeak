import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { guestAuthResponseSchema, type GuestAuthResponse } from '@chessspeak/shared';
import request from 'supertest';
import { GUEST_AUTH_LIMIT } from '../../src/auth/auth.controller';
import { AuthModule } from '../../src/auth/auth.module';
import { GuestTokenService, guestTokenSecret } from '../../src/auth/guest-token.service';
import { configureHttp } from '../../src/configure-http';

const SECRET = 'a'.repeat(64);
const jwt = new JwtService({});
const originalSecret = process.env.GUEST_TOKEN_SECRET;
const apps: NestExpressApplication[] = [];

async function appWith(secret: string | undefined): Promise<{ app: NestExpressApplication; tokens: GuestTokenService }> {
  if (secret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = secret;
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttp(app);
  await app.init();
  apps.push(app);
  return { app, tokens: app.get(GuestTokenService) };
}

const signIn = (app: NestExpressApplication, body: unknown = { displayName: 'Ana' }, ip = '203.0.113.1') =>
  request(app.getHttpServer()).post('/auth/guest').set('X-Forwarded-For', ip).send(body as object);

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  if (originalSecret === undefined) delete process.env.GUEST_TOKEN_SECRET;
  else process.env.GUEST_TOKEN_SECRET = originalSecret;
  jest.restoreAllMocks();
});

describe('POST /auth/guest', () => {
  it('answers what the shared contract says, with a server-made identity', async () => {
    const { app, tokens } = await appWith(SECRET);
    const response = await signIn(app).expect(201);
    const body = guestAuthResponseSchema.parse(response.body) as GuestAuthResponse;

    expect(body.identity).toEqual({ kind: 'guest', guestId: expect.any(String), displayName: 'Ana' });
    expect(tokens.verify(body.token)).toEqual(body.identity);
  });

  it('gives each sign-in its own guest id', async () => {
    const { app } = await appWith(SECRET);
    const first = await signIn(app).expect(201);
    const second = await signIn(app).expect(201);
    expect(first.body.identity.guestId).not.toBe(second.body.identity.guestId);
  });

  it('trims the display name', async () => {
    const { app } = await appWith(SECRET);
    const response = await signIn(app, { displayName: '  Ana  ' }).expect(201);
    expect(response.body.identity.displayName).toBe('Ana');
  });

  it.each([
    ['an empty body', {}],
    ['an empty name', { displayName: '' }],
    ['a blank name', { displayName: '   ' }],
    ['a name of 25 characters', { displayName: 'x'.repeat(25) }],
    ['a name that is not text', { displayName: 7 }],
    ['an identity sent by the client', { displayName: 'Ana', guestId: 'someone-else' }],
  ])('rejects %s with 400', async (_case, body) => {
    const { app } = await appWith(SECRET);
    await signIn(app, body).expect(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const { app } = await appWith(SECRET);
    await request(app.getHttpServer()).post('/auth/guest').set('Content-Type', 'application/json').send('{not json').expect(400);
  });
});

describe('throttling', () => {
  it('answers 429 past the limit, and invalid bodies count too', async () => {
    const { app } = await appWith(SECRET);
    for (let i = 0; i < GUEST_AUTH_LIMIT.limit - 1; i++) await signIn(app).expect(201);
    await signIn(app, {}).expect(400);
    await signIn(app).expect(429);
  });

  it('counts each client behind the proxy separately', async () => {
    const { app } = await appWith(SECRET);
    for (let i = 0; i < GUEST_AUTH_LIMIT.limit; i++) await signIn(app).expect(201);
    await signIn(app).expect(429);
    await signIn(app, { displayName: 'Bea' }, '203.0.113.2').expect(201);
  });
});

describe('verify', () => {
  const payload = { kind: 'guest', name: 'Ana' };
  const valid = { secret: SECRET, subject: 'guest-1', algorithm: 'HS256' as const };

  it('accepts a token signed with the secret', async () => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(jwt.sign(payload, { ...valid, expiresIn: '1h' }))).toEqual({ kind: 'guest', guestId: 'guest-1', displayName: 'Ana' });
  });

  it('rejects a token signed with another secret', async () => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(jwt.sign(payload, { ...valid, secret: 'b'.repeat(64), expiresIn: '1h' }))).toBeUndefined();
  });

  it('rejects an expired token', async () => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(jwt.sign(payload, { ...valid, expiresIn: -1 }))).toBeUndefined();
  });

  it('rejects a changed payload', async () => {
    const { tokens } = await appWith(SECRET);
    const [header, , signature] = jwt.sign(payload, { ...valid, expiresIn: '1h' }).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, sub: 'guest-2' })).toString('base64url');
    expect(tokens.verify(`${header}.${forged}.${signature}`)).toBeUndefined();
  });

  it('rejects another algorithm, including an unsigned token', async () => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(jwt.sign(payload, { ...valid, algorithm: 'HS512', expiresIn: '1h' }))).toBeUndefined();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    expect(tokens.verify(`${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...payload, sub: 'guest-1' })}.`)).toBeUndefined();
  });

  it('rejects a signed token that is not a guest identity', async () => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(jwt.sign({ name: 'Ana' }, { ...valid, expiresIn: '1h' }))).toBeUndefined();
    expect(tokens.verify(jwt.sign({ kind: 'guest' }, { ...valid, expiresIn: '1h' }))).toBeUndefined();
  });

  it.each([[''], ['not-a-token'], ['a.b.c']])('rejects %p', async (token) => {
    const { tokens } = await appWith(SECRET);
    expect(tokens.verify(token)).toBeUndefined();
  });
});

describe('the signing secret', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'x'.repeat(31)],
    ['the placeholder of .env.example', 'change-me-secret'],
    ['a long value with the placeholder', `change-me-${'x'.repeat(40)}`],
  ])('is refused when it is %s', (_case, value) => {
    expect(guestTokenSecret({ GUEST_TOKEN_SECRET: value })).toBeUndefined();
  });

  it('accepts a strong one', () => {
    expect(guestTokenSecret({ GUEST_TOKEN_SECRET: SECRET })).toBe(SECRET);
  });

  it('without one, nothing is signed: sign-in answers 503 and the error is logged at start', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { app, tokens } = await appWith(undefined);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GUEST_TOKEN_SECRET'));

    const response = await signIn(app).expect(503);
    expect(response.body.token).toBeUndefined();
    expect(tokens.verify(jwt.sign({ kind: 'guest', name: 'Ana' }, { secret: SECRET, subject: 'g', expiresIn: '1h' }))).toBeUndefined();
  });
});
