import { spawn, type ChildProcess } from 'node:child_process';
import { dirname } from 'node:path';

export interface WhisperProcessOptions {
  serverPath: string;
  modelPath: string;
  language: string;
  prompt?: string;
  host?: string;
  port: number;
}

export interface WhisperProcess {
  url: string;
  stop(): Promise<void>;
}

/** Starts whisper-server on a local port and waits until it answers HTTP. */
export async function startWhisper(options: WhisperProcessOptions): Promise<WhisperProcess> {
  const host = options.host ?? '127.0.0.1';
  const args = ['-m', options.modelPath, '-l', options.language, '--host', host, '--port', String(options.port)];
  if (options.prompt !== undefined && options.prompt !== '') args.push('--prompt', options.prompt);

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

export async function transcribeWith(baseUrl: string, wav: Uint8Array, inferencePath = '/inference'): Promise<Transcription> {
  const form = new FormData();
  form.append('file', new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'clip.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0.0');
  const started = performance.now();
  const response = await fetch(`${baseUrl}${inferencePath}`, { method: 'POST', body: form });
  const ms = performance.now() - started;
  if (!response.ok) throw new Error(`whisper-server -> HTTP ${response.status}`);
  const body = (await response.json()) as { text?: string; error?: string };
  if (body.error !== undefined) throw new Error(`whisper-server: ${body.error}`);
  return { text: (body.text ?? '').trim(), ms };
}
