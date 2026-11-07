import { concatChunks, downsample, encodeWav } from './wav.js';

const TARGET_RATE = 16000;
const TAIL_MS = 250;

// Inline AudioWorklet, so that the microfrontend stays a single bundle.
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

/** Records one utterance as a WAV. The audio only goes to the local agent: it is never stored. */
export interface AudioCapture {
  isSupported(): boolean;
  /** Asks for the microphone the first time. Rejects if it is refused. */
  enable(): Promise<void>;
  begin(): void;
  /** Stops after a short tail, so that the end of the phrase is not cut. Undefined when nothing was recorded. */
  end(extraTailMs: number): Promise<Uint8Array | undefined>;
  cancel(): void;
  /** Closes the microphone. */
  disable(): void;
}

/**
 * From spike/web-speech/src/recorder.ts: a 16 kHz mono WAV with echo cancellation, noise suppression and AGC off,
 * and the tail of run B, like the clips Whisper was measured with.
 */
export class BrowserCapture implements AudioCapture {
  private context: AudioContext | undefined;
  private stream: MediaStream | undefined;
  private enabling: Promise<void> | undefined;
  private chunks: Float32Array[] = [];
  private capturing = false;

  isSupported(): boolean {
    return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof AudioContext === 'function' && typeof AudioWorkletNode === 'function';
  }

  enable(): Promise<void> {
    this.enabling ??= this.open().catch((error: unknown) => {
      this.enabling = undefined;
      throw error;
    });
    return this.enabling;
  }

  private async open(): Promise<void> {
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
    await context.resume();
    this.stream = stream;
    this.context = context;
  }

  begin(): void {
    this.chunks = [];
    this.capturing = true;
  }

  async end(extraTailMs: number): Promise<Uint8Array | undefined> {
    const context = this.context;
    if (context === undefined) return undefined;
    await new Promise((resolve) => setTimeout(resolve, TAIL_MS + extraTailMs));
    this.capturing = false;
    const samples = concatChunks(this.chunks);
    this.chunks = [];
    if (samples.length === 0) return undefined;
    return encodeWav(downsample(samples, context.sampleRate, TARGET_RATE), TARGET_RATE);
  }

  cancel(): void {
    this.capturing = false;
    this.chunks = [];
  }

  disable(): void {
    this.cancel();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = undefined;
    this.context = undefined;
    this.enabling = undefined;
  }
}
