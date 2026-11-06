import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController, GUEST_AUTH_LIMIT } from './auth.controller';
import { GuestTokenService } from './guest-token.service';

@Module({
  imports: [ThrottlerModule.forRoot([GUEST_AUTH_LIMIT])],
  controllers: [AuthController],
  providers: [GuestTokenService],
  exports: [GuestTokenService],
})
export class AuthModule {}
