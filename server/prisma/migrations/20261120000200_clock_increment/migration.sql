-- The increment of a clock (RF29): milliseconds added after each move, or NULL for none. Only a game with a clock has
-- one, and at most a minute.
ALTER TABLE "games" ADD COLUMN "clock_increment_ms" INTEGER;
ALTER TABLE "games" ADD CONSTRAINT "games_clock_increment_ms_range"
  CHECK ("clock_increment_ms" IS NULL OR ("clock_increment_ms" > 0 AND "clock_increment_ms" <= 60000 AND "clock_ms" IS NOT NULL));
