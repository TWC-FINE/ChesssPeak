import { request, createServer as createProbe, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agentConfigFromEnv, createAgent, type AgentConfig, type Backend } from '../src/server.js';
import { makeWav, tone } from './helpers.js';

const ALLOWED = 'http://127.0.0.1:5500';

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createProbe();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(
  port: number,
  options: { method: string; path: string; headers?: Record<string, string>; body?: Uint8Array },
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: options.method, path: options.path, headers: { host: `127.0.0.1:${port}`, ...options.headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

describe('local HTTP agent', () => {
  let server: Server;
  let port: number;
  let config: AgentConfig;
  const transcribed: number[] = [];
  const backend: Backend = {
    info: () => ({ recognizer: 'fake', model: 'none' }),
    transcribe: async (wav) => {
      transcribed.push(wav.length);
      return { text: 'caballo efe tres', ms: 12 };
    },
  };

  beforeAll(async () => {
    port = await freePort();
    config = { ...agentConfigFromEnv({}), port, maxBodyBytes: 200_000 };
    server = createAgent(config, backend);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('reads routes, port and origins from the environment', () => {
    const custom = agentConfigFromEnv({
      AGENT_PORT: '9000',
      AGENT_ALLOWED_ORIGINS: 'http://a.test:1, http://b.test:2',
      AGENT_HEALTH_PATH: '/ping',
      AGENT_TRANSCRIBE_PATH: '/stt',
      MAX_BODY_BYTES: '1000',
    });
    expect(custom).toMatchObject({ port: 9000, healthPath: '/ping', transcribePath: '/stt', maxBodyBytes: 1000 });
    expect(custom.allowedOrigins).toEqual(['http://a.test:1', 'http://b.test:2']);
    expect(agentConfigFromEnv({})).toMatchObject({ host: '127.0.0.1', port: 8765, healthPath: '/health' });
    expect(agentConfigFromEnv({}).allowedOrigins).toEqual(['http://127.0.0.1:5500', 'http://localhost:5500']);
  });

  it('answers /health with the CORS header for an allowed origin', async () => {
    const reply = await call(port, { method: 'GET', path: '/health', headers: { origin: ALLOWED } });
    expect(reply.status).toBe(200);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers.vary).toBe('Origin');
    expect(JSON.parse(reply.body)).toMatchObject({ ok: true, recognizer: 'fake', gate: { minDurationMs: 300, minRmsDbfs: -50 } });
  });

  it('also allows http://localhost:5500', async () => {
    const reply = await call(port, { method: 'GET', path: '/health', headers: { origin: 'http://localhost:5500' } });
    expect(reply.headers['access-control-allow-origin']).toBe('http://localhost:5500');
  });

  it('answers the preflight including Access-Control-Allow-Private-Network', async () => {
    const reply = await call(port, {
      method: 'OPTIONS',
      path: '/transcribe',
      headers: {
        origin: ALLOWED,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
        'access-control-request-private-network': 'true',
      },
    });
    expect(reply.status).toBe(204);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers['access-control-allow-private-network']).toBe('true');
    expect(reply.headers['access-control-allow-methods']).toContain('POST');
    expect(reply.headers['access-control-allow-headers']).toBe('content-type');
  });

  it('does not send the private-network header unless the browser asks for it', async () => {
    const reply = await call(port, { method: 'OPTIONS', path: '/transcribe', headers: { origin: ALLOWED } });
    expect(reply.headers['access-control-allow-private-network']).toBeUndefined();
  });

  it('rejects origins that are not on the list, with no CORS header', async () => {
    for (const method of ['GET', 'OPTIONS']) {
      const reply = await call(port, { method, path: '/health', headers: { origin: 'https://evil.example' } });
      expect(reply.status).toBe(403);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('rejects a Host header it does not serve (DNS rebinding)', async () => {
    const reply = await call(port, { method: 'GET', path: '/health', headers: { host: 'rebind.example:8765' } });
    expect(reply.status).toBe(403);
  });

  it('transcribes a WAV that passes the gate', async () => {
    const wav = makeWav(tone(1, 0.2));
    const reply = await call(port, { method: 'POST', path: '/transcribe', headers: { origin: ALLOWED, 'content-type': 'audio/wav' }, body: wav });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toMatchObject({ text: 'caballo efe tres', gated: false, durationMs: 1000 });
    expect(transcribed).toContain(wav.length);
  });

  it('stops silent or too-short clips at the gate without calling the recognizer', async () => {
    const before = transcribed.length;
    const silent = await call(port, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'audio/wav' }, body: makeWav(new Float32Array(16000)) });
    expect(JSON.parse(silent.body)).toMatchObject({ text: '', gated: true, reason: 'too-quiet' });
    const short = await call(port, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'audio/wav' }, body: makeWav(tone(0.1, 0.5)) });
    expect(JSON.parse(short.body)).toMatchObject({ gated: true, reason: 'too-short' });
    expect(transcribed.length).toBe(before);
  });

  it('validates method, content type, size and the WAV itself', async () => {
    const wav = makeWav(tone(1, 0.2));
    expect((await call(port, { method: 'GET', path: '/transcribe' })).status).toBe(405);
    expect((await call(port, { method: 'POST', path: '/health' })).status).toBe(405);
    expect((await call(port, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'text/plain' }, body: wav })).status).toBe(415);
    expect((await call(port, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'audio/wav' }, body: new Uint8Array(500_000) })).status).toBe(413);
    expect((await call(port, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'audio/wav' }, body: new Uint8Array(100) })).status).toBe(400);
    expect((await call(port, { method: 'GET', path: '/nope' })).status).toBe(404);
  });

  it('reports a failing recognizer as 502', async () => {
    const failing = await freePort();
    const broken = createAgent({ ...config, port: failing }, { info: () => ({}), transcribe: async () => { throw new Error('boom'); } });
    await new Promise<void>((resolve) => broken.listen(failing, '127.0.0.1', resolve));
    const reply = await call(failing, { method: 'POST', path: '/transcribe', headers: { 'content-type': 'audio/wav' }, body: makeWav(tone(1, 0.2)) });
    await new Promise<void>((resolve) => broken.close(() => resolve()));
    expect(reply.status).toBe(502);
  });
});
