import { describe, expect, it, vi } from 'vitest';
import type { VoiceAttemptPayload } from '@chessspeak/shared';
import { forwardVoiceAttempts } from '../src/telemetry.js';

const attempt = { gameId: 'g1', transcript: 'peón e cuatro' } as VoiceAttemptPayload;
const send = (target: EventTarget) => target.dispatchEvent(new CustomEvent('cs:voice-attempt', { detail: { v: 1, attempt } }));

describe('forwardVoiceAttempts', () => {
  it('sends the attempt through the socket of the shell', () => {
    const target = new EventTarget();
    const emit = vi.fn();
    forwardVoiceAttempts(target, () => ({ connected: true, emit }));
    send(target);
    expect(emit).toHaveBeenCalledWith('voice:attempt', attempt);
  });

  it('drops it while disconnected, so that Socket.IO does not keep it for later', () => {
    const target = new EventTarget();
    const emit = vi.fn();
    forwardVoiceAttempts(target, () => ({ connected: false, emit }));
    send(target);
    expect(emit).not.toHaveBeenCalled();
  });

  it('drops it when there is no socket yet', () => {
    const target = new EventTarget();
    forwardVoiceAttempts(target, () => null);
    expect(() => send(target)).not.toThrow();
  });

  it('asks for the socket on each attempt, since it changes with the session', () => {
    const target = new EventTarget();
    const first = vi.fn();
    const second = vi.fn();
    let socket = { connected: true, emit: first };
    forwardVoiceAttempts(target, () => socket);
    send(target);
    socket = { connected: true, emit: second };
    send(target);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
