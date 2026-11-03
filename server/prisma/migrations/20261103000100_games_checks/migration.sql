-- Manual migration: CHECK constraints that Prisma cannot express.
-- result and termination are TEXT on purpose: the values come from the draft v0 contract
-- (PR #3) and are easier to change here if the contract changes in review (see ADR 3).

-- Allowed values (when not null)
ALTER TABLE "games" ADD CONSTRAINT "games_result_values"
  CHECK ("result" IS NULL OR "result" IN ('1-0', '0-1', '1/2-1/2', '*'));

ALTER TABLE "games" ADD CONSTRAINT "games_termination_values"
  CHECK ("termination" IS NULL OR "termination" IN (
    'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition',
    'fifty_moves', 'resignation', 'abandonment', 'aborted'));

-- Seats: per color, at most one of user_id and guest_id is set.
ALTER TABLE "games" ADD CONSTRAINT "games_white_one_identity"
  CHECK ("white_user_id" IS NULL OR "white_guest_id" IS NULL);
ALTER TABLE "games" ADD CONSTRAINT "games_black_one_identity"
  CHECK ("black_user_id" IS NULL OR "black_guest_id" IS NULL);

-- active and finished: both colors have exactly one identity.
-- waiting and aborted: at least one color has a seat.
ALTER TABLE "games" ADD CONSTRAINT "games_seats_by_status" CHECK (
  CASE
    WHEN "status" IN ('active', 'finished') THEN
      ("white_user_id" IS NULL) <> ("white_guest_id" IS NULL)
      AND ("black_user_id" IS NULL) <> ("black_guest_id" IS NULL)
    ELSE
      ("white_user_id" IS NOT NULL OR "white_guest_id" IS NOT NULL
       OR "black_user_id" IS NOT NULL OR "black_guest_id" IS NOT NULL)
  END);

-- status links with result and termination. IS NOT NULL is explicit: a CHECK that evaluates to NULL passes.
ALTER TABLE "games" ADD CONSTRAINT "games_outcome_by_status" CHECK (
  CASE "status"
    WHEN 'finished' THEN
      "result" IS NOT NULL AND "result" IN ('1-0', '0-1', '1/2-1/2')
      AND "termination" IS NOT NULL AND "termination" <> 'aborted'
    WHEN 'aborted' THEN
      "result" IS NOT NULL AND "result" = '*' AND "termination" IS NOT NULL AND "termination" = 'aborted'
    ELSE
      "result" IS NULL AND "termination" IS NULL
  END);
