import type { NestExpressApplication } from '@nestjs/platform-express';
import { corsOrigins } from './deploy-config';

/** HTTP settings shared by the real server and the tests. */
export function configureHttp(app: NestExpressApplication): void {
  app.enableCors({ origin: corsOrigins() });
  // req.ip from the last X-Forwarded-For entry. On Render that is a proxy, not the client, so there the limit of
  // /auth/guest uses CLIENT_IP_HEADER instead (ClientIpThrottlerGuard); req.ip stays for local runs and tests
  app.set('trust proxy', 1);
}
