-- Manual migration: the contract added the termination `agreement` (a draw both players accepted, RF16),
-- and the CHECK of 20261103000100_games_checks did not allow it, so such a game could not be saved.

ALTER TABLE "games" DROP CONSTRAINT "games_termination_values";
ALTER TABLE "games" ADD CONSTRAINT "games_termination_values"
  CHECK ("termination" IS NULL OR "termination" IN (
    'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition',
    'fifty_moves', 'resignation', 'abandonment', 'aborted', 'agreement'));
