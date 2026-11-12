import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCorpus, resultsFileName, runConfig } from '../src/benchmark.js';
import type { ClipName } from '../src/clips.js';
import { repoRoot } from '../src/env.js';
import { DEFAULT_GATE } from '../src/gate.js';
import { CHESS_PROMPT } from '../src/prompt.js';
import { makeWav, tone } from './helpers.js';

const corpus = loadCorpus();
const parser = { threshold: 1, margin: 0.25, rankPenalty: 0.3, nato: false };

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => (server === undefined ? resolve() : server.close(() => resolve())));
  server = undefined;
});

/** Stands in for a whisper-server that is already running (docker run): counts the clips it receives. */
async function fakeWhisper(text: string): Promise<{ url: string; received: () => number }> {
  let received = 0;
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/inference') received++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  return { url: `http://127.0.0.1:${address.port}`, received: () => received };
}

describe('benchmark against a whisper-server that is already running (--url)', () => {
  it('sends every clip that passes the gate to that URL and starts no process', async () => {
    const phrase = corpus.phrases.find((p) => p.expectedUci !== undefined)!;
    const clips: ClipName[] = [
      { file: `${phrase.id}_quiet_r1.wav`, phraseId: phrase.id, condition: 'quiet', repetition: 1, fake: true },
      { file: 'trial_silence_r1.wav', phraseId: null, condition: 'silence', repetition: 1, fake: true },
    ];
    const audio: Record<string, Uint8Array> = {
      [clips[0]!.file]: makeWav(tone(1, 0.3)),
      [clips[1]!.file]: makeWav(new Float32Array(16000)),
    };
    const whisper = await fakeWhisper(phrase.spoken);

    const result = await runConfig({ model: 'small', prompt: CHESS_PROMPT }, clips, {
      // a path that does not exist: with url set it must never be started
      serverPath: 'Z:/no-existe/whisper-server.exe',
      url: whisper.url,
      modelPaths: {},
      language: 'es',
      port: 1,
      gate: DEFAULT_GATE,
      parser,
      corpus,
      readClip: (clip) => audio[clip.file]!,
    });

    // one warm-up request plus the clip that passes the gate; the silence never leaves
    expect(whisper.received()).toBe(2);
    expect(result).toMatchObject({ sent: 1, gated: 1 });
    expect(result.attempts[0]!.alternatives).toEqual([{ transcript: phrase.spoken }]);
    expect(result.attempts[0]!.latency?.recognitionMs).toBeGreaterThanOrEqual(0);
    expect(result.attempts[1]!.error).toBe('below-gate:too-quiet');
  });
});

describe('results file name', () => {
  const small = { model: 'small' as const, prompt: CHESS_PROMPT };

  it('carries the --label, so repetitions do not overwrite each other', () => {
    const names = [1, 2, 3].map((r) => resultsFileName('2026-11-12', small, `docker-cpus2-small-r${r}`, false));
    expect(names[0]).toBe('2026-11-12-whisper-small-prompt-docker-cpus2-small-r1.json');
    expect(new Set(names).size).toBe(3);
  });

  it('keeps the spike names without a label', () => {
    expect(resultsFileName('2026-11-02', small, undefined, false)).toBe('2026-11-02-whisper-small-prompt.json');
    expect(resultsFileName('2026-11-02', { model: 'base', prompt: undefined }, undefined, true)).toBe('2026-11-02-whisper-base-noprompt.fake.json');
  });
});

describe('the Linux image of whisper-cloud/', () => {
  const dockerfile = readFileSync(join(repoRoot(), 'whisper-cloud/Dockerfile'), 'utf8');

  it('starts with the same chess prompt as the local module', () => {
    const prompt = /^ENV WHISPER_PROMPT="([^"]*)"$/m.exec(dockerfile)?.[1];
    expect(prompt).toBe(CHESS_PROMPT);
  });

  it('pins whisper.cpp to the commit of the Windows binary (b5454 = v1.9.5)', () => {
    expect(dockerfile).toMatch(/^ARG WHISPER_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037$/m);
    expect(dockerfile).toMatch(/-DGGML_NATIVE=OFF/);
  });
});
