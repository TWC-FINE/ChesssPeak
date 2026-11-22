import { describe, expect, it, vi } from 'vitest';
import type { VoiceInputContext } from '@chessspeak/shared';
import { createRecognizer } from '../src/recognizers/create.js';

// only which agent each choice goes to is checked here; the recognizer itself is tested in whisper.test.ts
vi.mock('../src/recognizers/whisper.js', () => ({
  WhisperRecognizer: class {
    readonly name = 'whisper';
    constructor(readonly options: { agentUrl: string; releaseDelayMs: number }) {}
  },
}));

const LOCAL = 'http://127.0.0.1:8765';
const CLOUD = 'http://127.0.0.1:8766';
const base: VoiceInputContext = { v: 1, gameId: 'g1', lang: 'es-CO', recognizer: 'webspeech', agentUrl: LOCAL };

const agentOf = (recognizer: unknown) => (recognizer as { options?: { agentUrl: string } }).options?.agentUrl;

describe('createRecognizer', () => {
  it('sends local Whisper to agentUrl, as before', () => {
    const recognizer = createRecognizer({ ...base, cloudAgentUrl: CLOUD }, 'whisper');
    expect(recognizer?.name).toBe('whisper');
    expect(agentOf(recognizer)).toBe(LOCAL);
  });

  it('sends Whisper on EC2 to cloudAgentUrl', () => {
    const recognizer = createRecognizer({ ...base, cloudAgentUrl: CLOUD }, 'whisper-cloud');
    expect(recognizer?.name).toBe('whisper');
    expect(agentOf(recognizer)).toBe(CLOUD);
  });

  it('falls back to Web Speech when the EC2 choice has no second agent', () => {
    expect(createRecognizer(base, 'whisper-cloud')?.name).toBe('webspeech');
    expect(createRecognizer({ ...base, cloudAgentUrl: null }, 'whisper-cloud')?.name).toBe('webspeech');
  });

  it('keeps Web Speech by default, with or without the second agent', () => {
    expect(createRecognizer(base)?.name).toBe('webspeech');
    expect(createRecognizer({ ...base, cloudAgentUrl: CLOUD })?.name).toBe('webspeech');
  });

  it('gives no recognizer to the text box, whatever is chosen', () => {
    expect(createRecognizer({ ...base, recognizer: 'text', cloudAgentUrl: CLOUD }, 'whisper-cloud')).toBeUndefined();
  });
});
