export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** Mono samples in -1..1 (channels are averaged). */
  samples: Float32Array;
  durationMs: number;
}

/** Reads PCM 16-bit and IEEE float 32-bit WAV files. Throws on anything else. */
export function parseWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('No es un WAV (RIFF/WAVE)');

  let format: { code: number; channels: number; sampleRate: number; bits: number } | undefined;
  let data: { offset: number; size: number } | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        code: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = { offset: body, size: Math.min(size, bytes.length - body) };
      break;
    }
    offset = body + size + (size % 2);
  }
  if (format === undefined || data === undefined) throw new Error('WAV sin chunk fmt o data');
  if (format.channels < 1) throw new Error('WAV sin canales');

  const bytesPerSample = format.bits / 8;
  const frames = Math.floor(data.size / (bytesPerSample * format.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < format.channels; c++) {
      const at = data.offset + (i * format.channels + c) * bytesPerSample;
      if (format.code === 1 && format.bits === 16) sum += view.getInt16(at, true) / 0x8000;
      else if (format.code === 3 && format.bits === 32) sum += view.getFloat32(at, true);
      else throw new Error(`Formato WAV no soportado (código ${format.code}, ${format.bits} bits)`);
    }
    samples[i] = sum / format.channels;
  }
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bits,
    samples,
    durationMs: Math.round((frames / format.sampleRate) * 1000),
  };
}
