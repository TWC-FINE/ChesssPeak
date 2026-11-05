import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { applyGate, DEFAULT_GATE, gateFromEnv, type GateConfig } from './gate.js';

// A tiny local HTTP agent: GET health, POST a WAV, get its transcription.
// Nothing here knows about the spike: routes, port, origins and limits come
// from the config, so this file can move to local-agent/ as it is.

export interface AgentConfig {
  host: string;
  port: number;
  /** Browser origins allowed to call the agent, e.g. http://127.0.0.1:5500 */
  allowedOrigins: string[];
  healthPath: string;
  transcribePath: string;
  maxBodyBytes: number;
  gate: GateConfig;
}

export interface Backend {
  /** Extra fields for the health response (model, version...). */
  info(): Record<string, unknown>;
  /** May include which worker answered. */
  transcribe(wav: Uint8Array): Promise<{ text: string; ms: number; worker?: string }>;
}

/** Thrown by a backend to answer with its own status (503, 504...) instead of 502. */
export class BackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function agentConfigFromEnv(env: Record<string, string>): AgentConfig {
  const list = (value: string | undefined, fallback: string[]): string[] =>
    value === undefined || value.trim() === '' ? fallback : value.split(',').map((s) => s.trim()).filter(Boolean);
  const number = (value: string | undefined, fallback: number): number =>
    value === undefined || value === '' || Number.isNaN(Number(value)) ? fallback : Number(value);
  return {
    host: env.AGENT_HOST || '127.0.0.1',
    port: number(env.AGENT_PORT, 8765),
    allowedOrigins: list(env.AGENT_ALLOWED_ORIGINS, ['http://127.0.0.1:5500', 'http://localhost:5500']),
    healthPath: env.AGENT_HEALTH_PATH || '/health',
    transcribePath: env.AGENT_TRANSCRIBE_PATH || '/transcribe',
    maxBodyBytes: number(env.MAX_BODY_BYTES, 10 * 1024 * 1024),
    gate: env.MIN_DURATION_MS || env.MIN_RMS_DBFS ? gateFromEnv(env) : DEFAULT_GATE,
  };
}

/**
 * Extra routes mounted on the agent (the load balancer monitor). Returns true when it answered the request.
 * `cors` holds the CORS headers already computed for this request's origin.
 */
export type ExtraRoutes = (req: IncomingMessage, res: ServerResponse, url: URL, cors: Record<string, string>) => Promise<boolean>;

const AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream']);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers['content-length']);
  if (declared > limit) throw new HttpError(413, 'El audio es demasiado grande');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'El audio es demasiado grande');
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function createAgent(config: AgentConfig, backend: Backend, extraRoutes?: ExtraRoutes): Server {
  // Host header check: a page on another site that points its own DNS name at
  // 127.0.0.1 (DNS rebinding) arrives with a Host we do not serve.
  const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`, `[::1]:${config.port}`]);
  if (config.host !== '0.0.0.0') allowedHosts.add(`${config.host}:${config.port}`);
  // pages the agent serves itself (the dashboard) call it from its own origin
  const allowedOrigins = new Set([...config.allowedOrigins, ...[...allowedHosts].map((host) => `http://${host}`)]);

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://agent');
    const origin = req.headers.origin;

    if (!allowedHosts.has(req.headers.host ?? '')) throw new HttpError(403, 'Host no permitido');

    const cors: Record<string, string> = {};
    if (origin !== undefined) {
      if (!allowedOrigins.has(origin)) throw new HttpError(403, 'Origen no permitido');
      cors['access-control-allow-origin'] = origin;
      cors.vary = 'Origin';
    }

    if (req.method === 'OPTIONS') {
      if (origin === undefined) throw new HttpError(400, 'Preflight sin Origin');
      const headers: Record<string, string> = {
        ...cors,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': String(req.headers['access-control-request-headers'] ?? 'content-type'),
        'access-control-max-age': '600',
      };
      // Chrome's Private Network Access: public pages calling localhost ask for this
      if (req.headers['access-control-request-private-network'] === 'true') {
        headers['access-control-allow-private-network'] = 'true';
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    if (url.pathname === config.healthPath) {
      if (req.method !== 'GET') throw new HttpError(405, 'Usa GET');
      send(res, 200, { ok: true, gate: config.gate, ...backend.info() }, cors);
      return;
    }

    if (url.pathname === config.transcribePath) {
      if (req.method !== 'POST') throw new HttpError(405, 'Usa POST');
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!AUDIO_TYPES.has(type)) throw new HttpError(415, 'Content-Type debe ser audio/wav');
      const wav = await readBody(req, config.maxBodyBytes);
      let gate;
      try {
        gate = applyGate(wav, config.gate);
      } catch (error) {
        throw new HttpError(400, `WAV inválido: ${(error as Error).message}`);
      }
      const measured = {
        durationMs: gate.durationMs,
        rmsDbfs: Number.isFinite(gate.rmsDbfs) ? Math.round(gate.rmsDbfs * 10) / 10 : null,
      };
      if (!gate.pass) {
        send(res, 200, { text: '', gated: true, reason: gate.reason, ...measured }, cors);
        return;
      }
      try {
        const { text, ms, worker } = await backend.transcribe(wav);
        // X-Worker shows in the browser's network panel which instance answered; exposed so the page can read it too
        const workerHeaders: Record<string, string> =
          worker === undefined ? {} : { 'x-worker': worker, ...(origin === undefined ? {} : { 'access-control-expose-headers': 'X-Worker' }) };
        send(res, 200, { text, gated: false, ms: Math.round(ms), ...measured, ...(worker === undefined ? {} : { worker }) }, { ...cors, ...workerHeaders });
      } catch (error) {
        if (error instanceof BackendError) {
          // Retry-After is not a CORS-safelisted header: the page can only read it if it is exposed
          const expose: Record<string, string> = origin === undefined ? {} : { 'access-control-expose-headers': 'Retry-After' };
          throw new HttpError(error.status, error.message, { ...cors, ...expose, ...error.headers });
        }
        throw new HttpError(502, `Fallo del reconocedor: ${(error as Error).message}`);
      }
      return;
    }

    if (extraRoutes !== undefined && (await extraRoutes(req, res, url, cors))) return;

    throw new HttpError(404, 'No existe');
  };

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'Error interno';
      const headers = error instanceof HttpError ? error.headers : {};
      if (!res.headersSent) send(res, status, { error: message }, headers);
      else res.end();
    });
  });
}
