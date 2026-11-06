import type { NestExpressApplication } from '@nestjs/platform-express';
import { corsOrigins } from './deploy-config';

/** HTTP settings shared by the real server and the tests. */
export function configureHttp(app: NestExpressApplication): void {
  app.enableCors({ origin: corsOrigins() });
  // behind Render's proxy: without this, every client looks like one IP to the throttler
  app.set('trust proxy', 1);
}
