import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MONGO_CONNECT_OPTIONS, mongoUri } from './mongo.config';
import { GameMovesRepository } from './game-moves.repository';
import { GameMoves, GameMovesSchema } from './game-moves.schema';
import { VoiceAttempt, VoiceAttemptSchema } from './voice-attempt.schema';
import { VoiceAttemptsRepository } from './voice-attempts.repository';

/**
 * MongoDB. The connection is lazy and has short timeouts: the server starts even when Mongo is down
 * (GET /health then reports it as down instead of the process failing to boot).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: mongoUri(),
        lazyConnection: true,
        ...MONGO_CONNECT_OPTIONS,
        // a failed first connection must not crash the process with an unhandled error
        onConnectionCreate: (connection) => {
          connection.on('error', () => undefined);
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: GameMoves.name, schema: GameMovesSchema },
      { name: VoiceAttempt.name, schema: VoiceAttemptSchema },
    ]),
  ],
  providers: [GameMovesRepository, VoiceAttemptsRepository],
  exports: [MongooseModule, GameMovesRepository, VoiceAttemptsRepository],
})
export class MongoModule {}
