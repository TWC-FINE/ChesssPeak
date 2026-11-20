-- The clock of a game (RF21): the milliseconds each player starts with, or NULL for a game without a clock.
-- What is left is not stored: it comes back from the time of each move in game_moves.
ALTER TABLE "games" ADD COLUMN "clock_ms" INTEGER;
ALTER TABLE "games" ADD CONSTRAINT "games_clock_ms_range"
  CHECK ("clock_ms" IS NULL OR ("clock_ms" > 0 AND "clock_ms" <= 3600000));

-- A clock that reaches zero ends the game with termination `timeout`. The whole list is written again, `agreement`
-- included, so this works whether or not 20261120000000_termination_agreement ran before.
ALTER TABLE "games" DROP CONSTRAINT "games_termination_values";
ALTER TABLE "games" ADD CONSTRAINT "games_termination_values"
  CHECK ("termination" IS NULL OR "termination" IN (
    'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition',
    'fifty_moves', 'resignation', 'abandonment', 'aborted', 'agreement', 'timeout'));
