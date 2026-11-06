import { randomInt } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Color, CreateGameRequest, Identity } from '@chessspeak/shared';
import { PrismaService } from '../database/prisma.service';

/** The creator's color. `random`, or no choice at all, is drawn here by the server. */
export function pickColor(requested: CreateGameRequest['color'], draw: () => number = () => randomInt(2)): Color {
  if (requested === 'white' || requested === 'black') return requested;
  return draw() === 0 ? 'white' : 'black';
}

function seatFor(identity: Identity, color: Color) {
  const id = identity.kind === 'guest' ? { guestId: identity.guestId } : { userId: identity.userId };
  return color === 'white'
    ? { whiteGuestId: id.guestId, whiteUserId: id.userId, whiteName: identity.displayName }
    : { blackGuestId: id.guestId, blackUserId: id.userId, blackName: identity.displayName };
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Creates a game in `waiting`, with the creator's seat reserved. The other seat stays empty until game:join. */
  async create(identity: Identity, requested: CreateGameRequest['color']): Promise<string> {
    try {
      const game = await this.prisma.game.create({ data: seatFor(identity, pickColor(requested)), select: { id: true } });
      return game.id;
    } catch (error) {
      this.logger.error(`Could not create a game: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not create the game');
    }
  }
}
