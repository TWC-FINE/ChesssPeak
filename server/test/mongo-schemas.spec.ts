import { GameMovesSchema } from '../src/database/mongo/game-moves.schema';
import { VoiceAttemptSchema } from '../src/database/mongo/voice-attempt.schema';

const keys = (indexes: [Record<string, unknown>, unknown][]) => indexes.map(([fields]) => Object.keys(fields).join('+'));

describe('Mongo schemas (no database needed)', () => {
  it('game_moves has a unique gameId', () => {
    const indexes = GameMovesSchema.indexes();
    expect(indexes).toContainEqual([{ gameId: 1 }, expect.objectContaining({ unique: true })]);
    expect(GameMovesSchema.get('collection')).toBe('game_moves');
  });

  it('voice_attempts has the three indexes of the plan', () => {
    expect(keys(VoiceAttemptSchema.indexes())).toEqual(expect.arrayContaining(['gameId+createdAt', 'session', 'recognizer+createdAt']));
    expect(VoiceAttemptSchema.get('collection')).toBe('voice_attempts');
  });

  it('voice_attempts requires the fields that the server sets (player, createdAt) and keeps expectedUci optional', () => {
    expect(VoiceAttemptSchema.path('player').isRequired).toBe(true);
    expect(VoiceAttemptSchema.path('createdAt').isRequired).toBe(true);
    expect(VoiceAttemptSchema.path('expectedUci').isRequired).toBeFalsy();
    expect(VoiceAttemptSchema.path('audio')).toBeUndefined();
  });
});
