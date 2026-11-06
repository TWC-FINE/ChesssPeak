import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { createGameRequestSchema, type CreateGameResponse, type Identity } from '@chessspeak/shared';
import { CurrentIdentity, TokenGuard } from '../auth/token.guard';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  /** `color` is optional, so a request with no body is the same as an empty one. */
  @Post()
  @UseGuards(TokenGuard)
  async create(@CurrentIdentity() identity: Identity, @Body() body: unknown): Promise<CreateGameResponse> {
    const request = createGameRequestSchema.safeParse(body ?? {});
    if (!request.success) throw new BadRequestException('Invalid body');
    return { gameId: await this.games.create(identity, request.data.color) };
  }
}
