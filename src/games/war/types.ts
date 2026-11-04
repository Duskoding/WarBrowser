export type Suit = "S" | "H" | "D" | "C";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

export interface TiedPair {
  yours: Card;
  opponent: Card;
}

export interface LastRound {
  wasWar: boolean;
  /** Seat index of the round winner, or null for a draw. */
  winner: number | null;
  cardsWon: number;
}

/** One card in the war lineup. Face-down burns omit the card until the war ends. */
export type StakeCard =
  | { faceUp: true; card: Card }
  | { faceUp: false };

/** Per-seat engine state from getState(seat). */
export interface WarState {
  yourCard: Card | null;
  opponentCard: Card | null;
  pile: number;
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  round: number;
  /** Seat index of the match winner, or null if draw / not over. */
  winner: number | null;
  inWar: boolean;
  warCards: TiedPair[];
  yourStakes: StakeCard[];
  opponentStakes: StakeCard[];
  lastRound: LastRound | null;
}

export interface RoundSummary {
  round: number;
  card0: Card;
  card1: Card;
  winner: number | null;
  wasWar: boolean;
  score0: number;
  score1: number;
  gameOver: boolean;
}

export type WarAction = { kind: "flip" };

export type WarResult =
  | { ok: false; error: string }
  | { ok: true; resolved: false }
  | { ok: true; resolved: true; summary: RoundSummary; finished?: { winner: number | null } };

export interface WarEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
  maxRounds?: number;
}
