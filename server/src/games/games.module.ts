import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameMovesRepository } from '../database/mongo/game-moves.repository';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { MOVE_PERSISTENCE } from './move-persistence/move-persistence';
import { createMovePersistence } from './move-persistence/move-persistence.factory';

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    {
      provide: MOVE_PERSISTENCE,
      inject: [GameMovesRepository],
      useFactory: (repository: GameMovesRepository) => createMovePersistence(repository),
    },
  ],
  exports: [MOVE_PERSISTENCE],
})
export class GamesModule {}
