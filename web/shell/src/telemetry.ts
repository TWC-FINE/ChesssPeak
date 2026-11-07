import type { CsEventDetail, VoiceAttemptPayload } from '@chessspeak/shared';

interface TelemetrySocket {
  connected: boolean;
  emit(event: 'voice:attempt', payload: VoiceAttemptPayload): unknown;
}

/**
 * Forwards the telemetry of <mf-voice-input>, which has no socket. Without a connection the attempt is dropped:
 * Socket.IO would keep it and send it later, and a measurement is not worth a queue.
 */
export function forwardVoiceAttempts(target: EventTarget, currentSocket: () => TelemetrySocket | null): void {
  target.addEventListener('cs:voice-attempt', (event) => {
    const socket = currentSocket();
    if (socket === null || !socket.connected) return;
    socket.emit('voice:attempt', (event as CustomEvent<CsEventDetail<'cs:voice-attempt'>>).detail.attempt);
  });
}
