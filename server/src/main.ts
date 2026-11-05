import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigins } from './deploy-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigins() });
  await app.listen(Number(process.env.PORT) || 3000);
}

void bootstrap();
