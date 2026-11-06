import { Module } from '@nestjs/common';
import { GameMovesRepository } from '../database/mongo/game-moves.repository';
import { MOVE_PERSISTENCE } from './move-persistence/move-persistence';
import { createMovePersistence } from './move-persistence/move-persistence.factory';

@Module({
  providers: [
    {
      provide: MOVE_PERSISTENCE,
      inject: [GameMovesRepository],
      useFactory: (repository: GameMovesRepository) => createMovePersistence(repository),
    },
  ],
  exports: [MOVE_PERSISTENCE],
})
export class GamesModule {}
