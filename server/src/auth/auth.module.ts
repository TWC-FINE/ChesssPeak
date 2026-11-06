import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { guestAuthLimitPerMinute } from '../deploy-config';
import { AuthController } from './auth.controller';
import { GuestTokenService } from './guest-token.service';

const ONE_MINUTE_MS = 60_000;

@Module({
  imports: [ThrottlerModule.forRootAsync({ useFactory: () => [{ ttl: ONE_MINUTE_MS, limit: guestAuthLimitPerMinute() }] })],
  controllers: [AuthController],
  providers: [GuestTokenService],
  exports: [GuestTokenService],
})
export class AuthModule {}
