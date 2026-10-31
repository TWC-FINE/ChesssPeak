export interface Alternative {
  transcript: string;
  confidence?: number;
}

export type Command = 'yes' | 'no' | 'cancel';

export interface Candidate {
  uci: string;
  san: string;
  distance: number;
}

export type Resolution =
  | { kind: 'move'; uci: string; san: string; distance: number; candidates: Candidate[] }
  | { kind: 'ambiguous'; candidates: Candidate[] }
  | { kind: 'nomatch'; candidates: Candidate[] }
  | { kind: 'command'; command: Command };

export interface ResolveOptions {
  /** Max weighted distance for the best candidate to be accepted. */
  threshold?: number;
  /** Min gap between best and second-best move to avoid `ambiguous`. */
  margin?: number;
  /** Extra distance added per position in the N-best list (rank 0 adds nothing). */
  rankPenalty?: number;
  /** Accept the NATO alphabet (alfa, bravo, ...) as letter names. */
  nato?: boolean;
}

export const DEFAULT_OPTIONS: Required<ResolveOptions> = {
  threshold: 1.0,
  margin: 0.25,
  rankPenalty: 0.05,
  nato: false,
};
