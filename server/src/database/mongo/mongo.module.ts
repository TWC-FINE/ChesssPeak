import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameMovesRepository } from './game-moves.repository';
import { GameMoves, GameMovesSchema } from './game-moves.schema';
import { VoiceAttempt, VoiceAttemptSchema } from './voice-attempt.schema';

/**
 * MongoDB. The connection is lazy and has short timeouts: the server starts even when Mongo is down
 * (GET /health then reports it as down instead of the process failing to boot).
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/unset',
        lazyConnection: true,
        serverSelectionTimeoutMS: 1000,
        connectTimeoutMS: 1000,
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
  providers: [GameMovesRepository],
  exports: [MongooseModule, GameMovesRepository],
})
export class MongoModule {}
