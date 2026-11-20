import { INITIAL_RATING, type GameResult, type RankingEntry } from '@chessspeak/shared';

/** Higher K while a player is new, so the rating reaches their level quickly; lower once it is settled. */
export const K_PROVISIONAL = 40;
export const K_ESTABLISHED = 20;
export const PROVISIONAL_GAMES = 10;

export type DecisiveResult = Exclude<GameResult, '*'>;

/** A finished game, as the ranking needs it: who played each color and how it ended. */
export interface RatedGame {
  whiteName: string;
  blackName: string;
  result: DecisiveResult;
}

interface PlayerRecord {
  displayName: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
}

/** What `player` is expected to score against `opponent`, from 0 to 1 (a draw counts as half a win). */
export function expectedScore(player: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - player) / 400));
}

export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
}

/** The rating after one game. `score` is 1 for a win, 0.5 for a draw and 0 for a loss; `gamesPlayed` counts the games before this one. */
export function nextRating(rating: number, opponent: number, score: 0 | 0.5 | 1, gamesPlayed: number): number {
  return Math.round(rating + kFactor(gamesPlayed) * (score - expectedScore(rating, opponent)));
}

/** Guests get a new guestId at every sign-in, so a player is followed by name: trimmed and case-insensitive. */
export function playerKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

function scoreOfWhite(result: DecisiveResult): 0 | 0.5 | 1 {
  if (result === '1-0') return 1;
  if (result === '0-1') return 0;
  return 0.5;
}

function record(score: 0 | 0.5 | 1, player: PlayerRecord): void {
  if (score === 1) player.wins += 1;
  else if (score === 0) player.losses += 1;
  else player.draws += 1;
}

const gamesOf = (player: PlayerRecord): number => player.wins + player.draws + player.losses;

/** Best rating first; then more wins, fewer games and the name, so the order never depends on the input. */
function compare(a: PlayerRecord, b: PlayerRecord): number {
  return b.rating - a.rating || b.wins - a.wins || gamesOf(a) - gamesOf(b) || playerKey(a.displayName).localeCompare(playerKey(b.displayName));
}

/**
 * Replays the games in the order given (oldest first) and returns every player, best first.
 * A game between two names that are the same player, or with an empty name, does not count.
 */
export function buildRanking(games: Iterable<RatedGame>): { entries: RankingEntry[]; gamesRated: number } {
  const players = new Map<string, PlayerRecord>();
  const playerFor = (displayName: string): PlayerRecord => {
    const key = playerKey(displayName);
    let player = players.get(key);
    if (player === undefined) {
      player = { displayName: displayName.trim(), rating: INITIAL_RATING, wins: 0, draws: 0, losses: 0 };
      players.set(key, player);
    }
    // the ranking shows the name as it was written last
    player.displayName = displayName.trim();
    return player;
  };

  let gamesRated = 0;
  for (const game of games) {
    const whiteKey = playerKey(game.whiteName);
    const blackKey = playerKey(game.blackName);
    if (whiteKey === '' || blackKey === '' || whiteKey === blackKey) continue;

    const white = playerFor(game.whiteName);
    const black = playerFor(game.blackName);
    const whiteScore = scoreOfWhite(game.result);
    const blackScore = (1 - whiteScore) as 0 | 0.5 | 1;
    // both new ratings come from the ratings before the game
    const whiteRating = nextRating(white.rating, black.rating, whiteScore, gamesOf(white));
    const blackRating = nextRating(black.rating, white.rating, blackScore, gamesOf(black));
    white.rating = whiteRating;
    black.rating = blackRating;
    record(whiteScore, white);
    record(blackScore, black);
    gamesRated += 1;
  }

  const sorted = [...players.values()].sort(compare);
  const entries: RankingEntry[] = [];
  sorted.forEach((player, index) => {
    const previous = entries[index - 1];
    // players with the same rating share the rank: 1, 2, 2, 4
    const rank = previous !== undefined && previous.rating === player.rating ? previous.rank : index + 1;
    entries.push({ rank, displayName: player.displayName, rating: player.rating, games: gamesOf(player), wins: player.wins, draws: player.draws, losses: player.losses });
  });
  return { entries, gamesRated };
}
