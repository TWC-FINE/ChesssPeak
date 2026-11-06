import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
