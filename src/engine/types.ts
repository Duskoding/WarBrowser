export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerId = 'A' | 'B';
export type Phase = 'waiting' | 'flipped' | 'war' | 'roundOver' | 'gameOver';

export interface GameState {
  yourCard: Card | null;
  opponentCard: Card | null;
  pile: number;
  scoreA: number;
  scoreB: number;
  phase: Phase;
  round: number;
  winner: PlayerId | null;
}

export interface RoundSummary {
  round: number;
  cardA: Card;
  cardB: Card;
  winner: PlayerId | null;
  wasWar: boolean;
  scoreA: number;
  scoreB: number;
  gameOver: boolean;
}

export type FlipResult =
  | { ok: true; resolved: false }
  | { ok: true; resolved: true; summary: RoundSummary }
  | { ok: false; error: string };

export interface WarEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
  maxRounds?: number;
}
