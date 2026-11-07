import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { identitySchema, type GuestAuthResponse, type Identity } from '@chessspeak/shared';

type Env = Record<string, string | undefined>;

const ALGORITHM = 'HS256';
const TOKEN_LIFETIME = '24h';
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER = 'change-me';

/** The secret that signs guest tokens, or undefined when it is missing or too weak to use. */
export function guestTokenSecret(env: Env = process.env): string | undefined {
  const secret = env.GUEST_TOKEN_SECRET;
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH || secret.includes(PLACEHOLDER)) return undefined;
  return secret;
}

/**
 * Issues and checks guest tokens. There is no row in `users`: the signed token is the identity, so guestId
 * stays the same across reconnections for as long as the token lasts.
 */
@Injectable()
export class GuestTokenService implements OnModuleInit {
  private readonly logger = new Logger(GuestTokenService.name);
  private readonly jwt = new JwtService({});
  private readonly secret = guestTokenSecret();

  /** A missing secret must not stop /health from answering, but it has to be visible from the start. */
  onModuleInit(): void {
    if (this.secret === undefined) {
      this.logger.error(`GUEST_TOKEN_SECRET is missing or weak (at least ${MIN_SECRET_LENGTH} characters, no placeholder): guests cannot sign in`);
    }
  }

  issue(displayName: string): GuestAuthResponse {
    if (this.secret === undefined) throw new ServiceUnavailableException('Guest sign-in is not configured');
    const guestId = randomUUID();
    const token = this.jwt.sign(
      { kind: 'guest', name: displayName },
      { secret: this.secret, algorithm: ALGORITHM, expiresIn: TOKEN_LIFETIME, subject: guestId },
    );
    return { token, identity: { kind: 'guest', guestId, displayName } };
  }

  /** The identity in a valid token; undefined for anything else (forged, expired, malformed). */
  verify(token: string): Identity | undefined {
    if (this.secret === undefined) return undefined;
    try {
      const payload = this.jwt.verify<{ kind?: unknown; sub?: unknown; name?: unknown }>(token, { secret: this.secret, algorithms: [ALGORITHM] });
      const identity = identitySchema.safeParse({ kind: payload.kind, guestId: payload.sub, displayName: payload.name });
      return identity.success ? identity.data : undefined;
    } catch {
      return undefined;
    }
  }
}
