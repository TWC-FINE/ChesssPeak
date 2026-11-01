import { concatChunks, downsample, encodeWav } from './wav.js';

const TARGET_RATE = 16000;
const TAIL_MS = 250;

// Inline AudioWorklet so the page stays a single bundle served by Live Server.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export interface Recording {
  wav: Uint8Array;
  durationMs: number;
}

/**
 * Captures the same microphone as the speech recognizer, in parallel, and
 * produces a 16 kHz mono WAV per utterance (reusable later with Whisper).
 * Echo cancellation, noise suppression and AGC are off to keep the raw signal.
 */
export class Recorder {
  private context: AudioContext | undefined;
  private stream: MediaStream | undefined;
  private chunks: Float32Array[] = [];
  private capturing = false;

  get enabled(): boolean {
    return this.context !== undefined;
  }

  async enable(): Promise<void> {
    if (this.context !== undefined) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const context = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'pcm-capture');
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.capturing) this.chunks.push(event.data);
    };
    source.connect(node);
    this.stream = stream;
    this.context = context;
  }

  disable(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = undefined;
    this.context = undefined;
  }

  begin(): void {
    this.chunks = [];
    this.capturing = true;
  }

  /** Stop after a short tail so the end of the phrase is not cut (`extraTailMs`: the stop delay of run B). */
  async end(extraTailMs = 0): Promise<Recording | undefined> {
    const context = this.context;
    if (context === undefined) return undefined;
    await new Promise((resolve) => setTimeout(resolve, TAIL_MS + extraTailMs));
    this.capturing = false;
    const samples = concatChunks(this.chunks);
    this.chunks = [];
    if (samples.length === 0) return undefined;
    const wav = encodeWav(downsample(samples, context.sampleRate, TARGET_RATE), TARGET_RATE);
    return { wav, durationMs: Math.round((samples.length / context.sampleRate) * 1000) };
  }
}

interface DirectoryHandle {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>;
}

export const canPickDirectory = (): boolean => 'showDirectoryPicker' in window;

export async function pickDirectory(): Promise<DirectoryHandle> {
  const picker = (window as unknown as {
    showDirectoryPicker: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle>;
  }).showDirectoryPicker;
  return picker({ mode: 'readwrite' });
}

export async function saveWav(directory: DirectoryHandle, name: string, wav: Uint8Array): Promise<void> {
  const file = await directory.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(wav);
  await writable.close();
}
