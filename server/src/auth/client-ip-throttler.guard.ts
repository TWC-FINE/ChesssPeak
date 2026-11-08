import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIpHeader } from '../deploy-config';

/**
 * The throttler, keyed on the header named by CLIENT_IP_HEADER when it is set and present, and on req.ip otherwise.
 * On Render req.ip is a proxy's address, not the client's (docs/deploy.md, «Comprobar el límite de /auth/guest»).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  private readonly header = clientIpHeader();

  protected override async getTracker(req: { headers: Record<string, string | string[] | undefined>; ip: string }): Promise<string> {
    const raw = this.header === undefined ? undefined : req.headers[this.header];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return value ? value : req.ip;
  }
}
