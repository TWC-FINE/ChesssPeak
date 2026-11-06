import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { guestAuthRequestSchema, type GuestAuthResponse } from '@chessspeak/shared';
import { GuestTokenService } from './guest-token.service';

export const GUEST_AUTH_LIMIT = { limit: 10, ttl: 60_000 };

@Controller('auth')
export class AuthController {
  constructor(private readonly tokens: GuestTokenService) {}

  /** The body is checked with the same strict schema as the clients: a client cannot send its own identity. */
  @Post('guest')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: GUEST_AUTH_LIMIT })
  guest(@Body() body: unknown): GuestAuthResponse {
    const request = guestAuthRequestSchema.safeParse(body);
    if (!request.success) throw new BadRequestException('Invalid body');
    return this.tokens.issue(request.data.displayName);
  }
}
