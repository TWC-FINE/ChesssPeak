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
  readonly name?: string;
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

/**
 * True when the folder can be written now. If the permission is not granted, asks for it: that only
 * works inside a user gesture (the push-to-talk press), and it is what a page reload makes necessary.
 */
export async function ensureWritable(directory: DirectoryHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  try {
    if (directory.queryPermission === undefined) return true;
    if ((await directory.queryPermission(descriptor)) === 'granted') return true;
    return (await directory.requestPermission?.(descriptor)) === 'granted';
  } catch {
    return false;
  }
}

// The handle lives in IndexedDB so that a page reload (Live Server, F5) does not forget the folder.
// Only the handle is kept, never the permission: after a reload it is asked for again (ensureWritable).
const HANDLE_DB = 'chessspeak.spike.web-speech';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'wav-directory';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function rememberDirectory(directory: DirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(directory, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB blocked: the folder just has to be chosen again after a reload
  }
}

export async function recallDirectory(): Promise<DirectoryHandle | undefined> {
  try {
    const db = await openHandleDb();
    const handle = await new Promise<DirectoryHandle | undefined>((resolve, reject) => {
      const request = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result as DirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return undefined;
  }
}

export const canPickDirectory = (): boolean => 'showDirectoryPicker' in window;

export type WavDirectory = DirectoryHandle;

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
