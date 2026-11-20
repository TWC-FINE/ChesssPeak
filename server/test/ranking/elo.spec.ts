import { INITIAL_RATING } from '@chessspeak/shared';
import {
  K_ESTABLISHED,
  K_PROVISIONAL,
  PROVISIONAL_GAMES,
  buildRanking,
  expectedScore,
  kFactor,
  nextRating,
  playerKey,
  type RatedGame,
} from '../../src/ranking/elo';

const game = (whiteName: string, blackName: string, result: RatedGame['result']): RatedGame => ({ whiteName, blackName, result });

describe('expectedScore', () => {
  it('is one half between equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });

  it('is ten to one with 400 points of difference', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 10);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / 11, 10);
  });

  it.each([
    [1200, 1200],
    [1000, 1800],
    [1450, 1390],
    [2100, 900],
  ])('adds up to 1 for both players (%i vs %i)', (a, b) => {
    expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
  });
});

describe('kFactor', () => {
  it('is provisional for the first games and established afterwards', () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_GAMES - 1)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_GAMES)).toBe(K_ESTABLISHED);
    expect(kFactor(500)).toBe(K_ESTABLISHED);
  });
});

describe('nextRating', () => {
  it('moves a new player by 20 against an equal one', () => {
    expect(nextRating(1200, 1200, 1, 0)).toBe(1220);
    expect(nextRating(1200, 1200, 0, 0)).toBe(1180);
  });

  it('moves an established player by half as much', () => {
    expect(nextRating(1200, 1200, 1, 30)).toBe(1210);
    expect(nextRating(1200, 1200, 0, 30)).toBe(1190);
  });

  it('leaves a draw between equals where it was', () => {
    expect(nextRating(1200, 1200, 0.5, 0)).toBe(1200);
  });

  it('pays more for beating a stronger player than a weaker one', () => {
    expect(nextRating(1200, 1600, 1, 30) - 1200).toBe(18);
    expect(nextRating(1600, 1200, 1, 30) - 1600).toBe(2);
  });

  it('costs the favourite points when it only draws', () => {
    expect(nextRating(1600, 1200, 0.5, 30)).toBeLessThan(1600);
    expect(nextRating(1200, 1600, 0.5, 30)).toBeGreaterThan(1200);
  });
});

describe('playerKey', () => {
  it('ignores case and the spaces around the name', () => {
    expect(playerKey('  Ana ')).toBe('ana');
    expect(playerKey('ANA')).toBe(playerKey('ana'));
    expect(playerKey('Ana María')).not.toBe(playerKey('Ana'));
  });
});

describe('buildRanking', () => {
  it('is empty without games', () => {
    expect(buildRanking([])).toEqual({ entries: [], gamesRated: 0 });
  });

  it('rates both players of a decisive game', () => {
    const { entries, gamesRated } = buildRanking([game('Ana', 'Luis', '1-0')]);
    expect(gamesRated).toBe(1);
    expect(entries).toEqual([
      { rank: 1, displayName: 'Ana', rating: 1220, games: 1, wins: 1, draws: 0, losses: 0 },
      { rank: 2, displayName: 'Luis', rating: 1180, games: 1, wins: 0, draws: 0, losses: 1 },
    ]);
  });

  it('gives the win to black on 0-1', () => {
    const { entries } = buildRanking([game('Ana', 'Luis', '0-1')]);
    expect(entries.map((entry) => [entry.displayName, entry.rating])).toEqual([
      ['Luis', 1220],
      ['Ana', 1180],
    ]);
  });

  it('counts a draw for both and shares the rank when the ratings are equal', () => {
    const { entries } = buildRanking([game('Zoe', 'Bruno', '1/2-1/2')]);
    expect(entries.map((entry) => [entry.rank, entry.displayName, entry.rating, entry.draws])).toEqual([
      [1, 'Bruno', INITIAL_RATING, 1],
      [1, 'Zoe', INITIAL_RATING, 1],
    ]);
  });

  it('follows a player by name, whatever the case or the spaces, and shows the last spelling', () => {
    const { entries } = buildRanking([game('ana', 'Luis', '1-0'), game('Luis', ' ANA ', '0-1'), game('Ana', 'Marta', '1-0')]);
    const ana = entries.find((entry) => playerKey(entry.displayName) === 'ana');
    expect(entries).toHaveLength(3);
    expect(ana).toMatchObject({ displayName: 'Ana', games: 3, wins: 3 });
  });

  it('skips a game against oneself and a game with an empty name', () => {
    const { entries, gamesRated } = buildRanking([game('Ana', 'ana ', '1-0'), game('  ', 'Luis', '0-1'), game('Ana', 'Luis', '1-0')]);
    expect(gamesRated).toBe(1);
    expect(entries.map((entry) => entry.games)).toEqual([1, 1]);
  });

  it('uses the ratings from before the game for both players', () => {
    // Ana 1220 and Marta 1180 after the first two games; the third is between them
    const { entries } = buildRanking([game('Ana', 'Luis', '1-0'), game('Pedro', 'Marta', '1-0'), game('Marta', 'Ana', '1-0')]);
    const rating = (name: string) => entries.find((entry) => entry.displayName === name)?.rating;
    // Marta was expected to score 0.443: +40 × 0.557 = +22, and Ana loses the same
    expect(rating('Marta')).toBe(1202);
    expect(rating('Ana')).toBe(1198);
  });

  it('switches to the established K after the provisional games', () => {
    const games = Array.from({ length: PROVISIONAL_GAMES }, (_, index) => game('Ana', `Rival ${index}`, '1/2-1/2'));
    games.push(game('Ana', 'Nuevo', '1-0'));
    const { entries } = buildRanking(games);
    // Ana, established, gains 10; the new player, provisional, loses 20
    expect(entries.find((entry) => entry.displayName === 'Ana')?.rating).toBe(1210);
    expect(entries.find((entry) => entry.displayName === 'Nuevo')?.rating).toBe(1180);
  });

  it('orders by rating, then wins, then fewer games, then name', () => {
    const { entries } = buildRanking([
      game('Ana', 'Luis', '1-0'),
      game('Marta', 'Pedro', '1-0'),
      game('Ana', 'Marta', '1-0'),
      game('Carla', 'Diego', '1/2-1/2'),
    ]);
    // Marta, Carla and Diego are all on 1200: Marta has a win, Carla and Diego go by name. Luis and Pedro too
    expect(entries.map((entry) => entry.displayName)).toEqual(['Ana', 'Marta', 'Carla', 'Diego', 'Luis', 'Pedro']);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 2, 5, 5]);
    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index - 1]!.rating).toBeGreaterThanOrEqual(entries[index]!.rating);
    }
  });

  it('numbers the ranks 1, 2, 2, 4 when two players tie', () => {
    const { entries } = buildRanking([game('Ana', 'Luis', '1-0'), game('Carla', 'Diego', '1/2-1/2')]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4]);
  });

  it('gives the same result for the same games', () => {
    const games = [game('Ana', 'Luis', '1-0'), game('Luis', 'Marta', '1/2-1/2'), game('Marta', 'Ana', '0-1')];
    expect(buildRanking(games)).toEqual(buildRanking([...games]));
  });
});
