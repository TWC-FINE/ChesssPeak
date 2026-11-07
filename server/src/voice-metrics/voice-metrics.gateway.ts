import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { voiceAttemptSchema } from '@chessspeak/shared';
import { VoiceAttemptsRepository } from '../database/mongo/voice-attempts.repository';
import { corsOrigins, voiceAttemptLimitPerMinute, voiceAttemptMaxBytes } from '../deploy-config';
import { type GameSocket, playerOf } from '../games/game.gateway';

const WINDOW_MS = 60_000;

interface AttemptWindow {
  startedAt: number;
  count: number;
}

/**
 * Voice telemetry. It never answers the client: this is a measurement, so a message that is refused or cannot be saved
 * is logged and dropped, and the game goes on. The identity comes from the token, and the log never carries the payload.
 */
@WebSocketGateway({ cors: { origin: corsOrigins() } })
export class VoiceMetricsGateway {
  private readonly logger = new Logger(VoiceMetricsGateway.name);
  private readonly windows = new WeakMap<GameSocket, AttemptWindow>();
  private readonly maxBytes = voiceAttemptMaxBytes();
  private readonly limitPerMinute = voiceAttemptLimitPerMinute();

  constructor(private readonly attempts: VoiceAttemptsRepository) {}

  @SubscribeMessage('voice:attempt')
  async record(@ConnectedSocket() socket: GameSocket, @MessageBody() payload: unknown): Promise<void> {
    if (!this.withinLimit(socket)) return;
    if (Buffer.byteLength(JSON.stringify(payload) ?? '') > this.maxBytes) return this.drop('too large');

    const attempt = voiceAttemptSchema.safeParse(payload);
    if (!attempt.success) return this.drop('invalid payload');
    if (!socket.data.games.has(attempt.data.gameId)) return this.drop('game not joined');

    try {
      await this.attempts.save(attempt.data, playerOf(socket.data.identity).id);
    } catch (error) {
      this.logger.error(`voice:attempt not saved: ${(error as Error).message}`);
    }
  }

  private withinLimit(socket: GameSocket): boolean {
    const now = Date.now();
    let window = this.windows.get(socket);
    if (window === undefined || now - window.startedAt >= WINDOW_MS) {
      window = { startedAt: now, count: 0 };
      this.windows.set(socket, window);
    }
    window.count += 1;
    // once per window: a flood must not fill the log either
    if (window.count === this.limitPerMinute + 1) this.drop('too many');
    return window.count <= this.limitPerMinute;
  }

  private drop(reason: string): void {
    this.logger.warn(`voice:attempt dropped: ${reason}`);
  }
}
