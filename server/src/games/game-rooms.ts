import { Injectable } from '@nestjs/common';
import { GameRoom } from './game-room';
import { GameStore } from './game-store';

/** The rooms in memory. A room missing here is rebuilt from what was stored, for instance after a restart. */
@Injectable()
export class GameRooms {
  // promises, so that two joins arriving together share one room instead of building two
  private readonly rooms = new Map<string, Promise<GameRoom | null>>();

  constructor(private readonly store: GameStore) {}

  /** The room, or null when the game does not exist. Rejects if the stores fail or hold damaged data. */
  get(gameId: string): Promise<GameRoom | null> {
    const known = this.rooms.get(gameId);
    if (known !== undefined) return known;

    const loading = this.store.load(gameId).then((snapshot) => (snapshot === null ? null : GameRoom.rehydrate(snapshot)));
    this.rooms.set(gameId, loading);
    // only a loaded room stays: a game that may exist later, or a database that was down, gets another try
    const forget = (): void => void this.rooms.delete(gameId);
    loading.then((room) => {
      if (room === null) forget();
    }, forget);
    return loading;
  }
}
