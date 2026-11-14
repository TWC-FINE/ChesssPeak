import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';
import { spawnGuarded } from './guard.js';
import type { WorkerHandle } from './pool.js';

export interface WhisperProcessOptions {
  serverPath: string;
  modelPath: string;
  language: string;
  prompt?: string;
  host?: string;
  port: number;
  /** whisper-server -t (its default is 4). */
  threads?: number;
}

export interface WhisperProcess {
  url: string;
  stop(): Promise<void>;
}

export function whisperArgs(options: WhisperProcessOptions): string[] {
  const args = ['-m', options.modelPath, '-l', options.language, '--host', options.host ?? '127.0.0.1', '--port', String(options.port)];
  if (options.threads !== undefined) args.push('-t', String(options.threads));
  if (options.prompt !== undefined && options.prompt !== '') args.push('--prompt', options.prompt);
  return args;
}

/** Starts whisper-server on a local port and waits until it answers HTTP. */
export async function startWhisper(options: WhisperProcessOptions): Promise<WhisperProcess> {
  const host = options.host ?? '127.0.0.1';
  const args = whisperArgs(options);

  // run next to its DLLs
  const child: ChildProcess = spawn(options.serverPath, args, { cwd: dirname(options.serverPath), stdio: 'ignore' });
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });

  const url = `http://${host}:${options.port}`;
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (exited) throw new Error(`whisper-server terminó al arrancar (modelo ${options.modelPath})`);
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      break;
    } catch {
      if (Date.now() > deadline) {
        child.kill();
        throw new Error('whisper-server no respondió en 120 s');
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (exited) return resolve();
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}

export interface Transcription {
  text: string;
  /** Round trip to whisper-server for this clip, in ms. */
  ms: number;
}

/** `signal` lets URL mode give up on a worker that never answers, so its slot does not stay taken forever. */
export async function transcribeWith(baseUrl: string, wav: Uint8Array, inferencePath = '/inference', signal?: AbortSignal): Promise<Transcription> {
  const form = new FormData();
  form.append('file', new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'clip.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0.0');
  const started = performance.now();
  const response = await fetch(`${baseUrl}${inferencePath}`, { method: 'POST', body: form, signal });
  const ms = performance.now() - started;
  if (!response.ok) throw new Error(`whisper-server -> HTTP ${response.status}`);
  const body = (await response.json()) as { text?: string; error?: string };
  if (body.error !== undefined) throw new Error(`whisper-server: ${body.error}`);
  return { text: (body.text ?? '').trim(), ms };
}

/** True when something answers GET <url>/health with 2xx within the timeout. */
export async function probeHealth(baseUrl: string, timeoutMs = 800): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts one pool worker: whisper-server under a guard (see guard.ts), and waits until /health answers.
 * Refuses a port that already answers, so a leftover whisper-server is never adopted as a worker.
 */
export async function launchWhisperWorker(options: WhisperProcessOptions, readyTimeoutMs = 120_000): Promise<WorkerHandle> {
  const url = `http://${options.host ?? '127.0.0.1'}:${options.port}`;
  if (await probeHealth(url)) {
    throw new Error(`El puerto ${options.port} ya responde (¿un whisper-server huérfano?). Ciérralo: taskkill /IM whisper-server.exe /F`);
  }
  // run next to its DLLs
  const proc = await spawnGuarded(options.serverPath, whisperArgs(options), dirname(options.serverPath));
  let exited = false;
  void proc.exited.then(() => {
    exited = true;
  });
  const deadline = Date.now() + readyTimeoutMs;
  while (!(await probeHealth(url))) {
    if (exited) throw new Error(`whisper-server terminó al arrancar en el puerto ${options.port}`);
    if (Date.now() > deadline) {
      await proc.stop();
      throw new Error(`whisper-server no respondió en ${readyTimeoutMs / 1000} s (puerto ${options.port})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { url, pid: proc.pid, exited: proc.exited, stop: proc.stop, killNow: proc.killNow };
}
