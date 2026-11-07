import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Identity } from '@chessspeak/shared';
import { GuestTokenService } from './guest-token.service';

interface AuthenticatedRequest {
  headers: { authorization?: string };
  identity?: Identity;
}

/** Requires `Authorization: Bearer <token>`. The identity always comes from the token, never from the body. */
@Injectable()
export class TokenGuard implements CanActivate {
  constructor(private readonly tokens: GuestTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token, ...rest] = (request.headers.authorization ?? '').split(' ');
    const identity = scheme === 'Bearer' && token !== undefined && rest.length === 0 ? this.tokens.verify(token) : undefined;
    if (identity === undefined) throw new UnauthorizedException('Missing or invalid token');
    request.identity = identity;
    return true;
  }
}

/** The identity that TokenGuard read from the token. */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Identity => context.switchToHttp().getRequest<AuthenticatedRequest>().identity as Identity,
);
