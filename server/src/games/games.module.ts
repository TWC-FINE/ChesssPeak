import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameMovesRepository } from '../database/mongo/game-moves.repository';
import { GameGateway } from './game.gateway';
import { GameRooms } from './game-rooms';
import { GameStore } from './game-store';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { MOVE_PERSISTENCE } from './move-persistence/move-persistence';
import { createMovePersistence } from './move-persistence/move-persistence.factory';
import { PerGameQueue } from './per-game-queue';

@Module({
  imports: [AuthModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    GameStore,
    GameRooms,
    GameGateway,
    { provide: PerGameQueue, useFactory: () => new PerGameQueue() },
    {
      provide: MOVE_PERSISTENCE,
      inject: [GameMovesRepository],
      useFactory: (repository: GameMovesRepository) => createMovePersistence(repository),
    },
  ],
  exports: [MOVE_PERSISTENCE],
})
export class GamesModule {}
