import { Logger, type OnModuleDestroy } from '@nestjs/common';

export interface PerGameQueueOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Runs the writes of one game one after another: move n+1 is sent only when n was saved, or appendMove would see a gap.
 * A failed write is retried, with growing waits, until it succeeds, because the game lives in memory and must not lose
 * it. Different games never wait for each other.
 */
export class PerGameQueue implements OnModuleDestroy {
  private readonly logger = new Logger(PerGameQueue.name);
  private readonly tails = new Map<string, Promise<void>>();
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private stopped = false;

  constructor(options: PerGameQueueOptions = {}) {
    this.initialDelayMs = options.initialDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
  }

  push(gameId: string, label: string, task: () => Promise<void>): void {
    const tail = (this.tails.get(gameId) ?? Promise.resolve()).then(() => this.runUntilDone(gameId, label, task));
    this.tails.set(gameId, tail);
  }

  /** Resolves when every write pushed so far for this game has finished. */
  async drained(gameId: string): Promise<void> {
    await this.tails.get(gameId);
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async runUntilDone(gameId: string, label: string, task: () => Promise<void>): Promise<void> {
    let delay = this.initialDelayMs;
    while (!this.stopped) {
      try {
        await task();
        return;
      } catch (error) {
        this.logger.error(`Game ${gameId}: ${label} failed, retrying in ${delay} ms: ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, delay).unref());
        delay = Math.min(delay * 2, this.maxDelayMs);
      }
    }
  }
}
