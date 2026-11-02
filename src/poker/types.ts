// Shared contract for the poker evaluator, engine and server. See SPEC_POKER.md.
import type { Card, PlayerId } from '../engine/types.ts';

export type { Card, PlayerId, Rank, Suit } from '../engine/types.ts';

// ---- Hand evaluator ----

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush';

export interface HandValue {
  category: HandCategory;
  /** 0 = high-card … 8 = straight-flush, in the order of HandCategory above. */
  categoryRank: number;
  /** Ranks compared left to right after categoryRank (see SPEC_POKER.md §2). */
  tiebreak: number[];
  /** The best five cards, strongest-first by the same ordering as tiebreak. */
  cards: Card[];
  /** Human-readable name, e.g. "Full house, Kings over Sevens" (SPEC_POKER.md §2). */
  name: string;
}

// ---- Engine ----

export type PokerPhase = 'preflop' | 'flop' | 'turn' | 'river' | 'handOver' | 'gameOver';

export type PokerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** Bet or raise to a total of `to` chips committed on this street. */
  | { type: 'raise'; to: number };

export interface LegalActions {
  fold: boolean;
  check: boolean;
  /** Chips needed to call (already capped at your stack); 0 when there is nothing to call. */
  call: number;
  /** null when you cannot bet or raise. */
  minRaiseTo: number | null;
  maxRaiseTo: number | null;
}

export interface HandResult {
  reason: 'fold' | 'showdown';
  /** One winner, or both seats on a split pot. */
  winners: PlayerId[];
  /** Chips each seat took from the pot this hand (0 for a loser). */
  potWon: Record<PlayerId, number>;
  /** Only on showdown. */
  hands: Record<PlayerId, HandValue> | null;
}

export interface LastAction {
  seat: PlayerId;
  type: 'fold' | 'check' | 'call' | 'raise' | 'smallBlind' | 'bigBlind';
  /** Street total after the action for raise/blinds; chips added for call; 0 otherwise. */
  amount: number;
}

export interface PokerState {
  phase: PokerPhase;
  handNumber: number;
  button: PlayerId;
  smallBlind: number;
  bigBlind: number;
  yourHoleCards: Card[];
  /** Only filled after a showdown (handOver/gameOver with reason 'showdown'); otherwise null. */
  opponentHoleCards: Card[] | null;
  board: Card[];
  /** Chips in the middle from previous streets, not counting `committed`. */
  pot: number;
  stacks: Record<PlayerId, number>;
  /** Chips each seat has put in on the current street. */
  committed: Record<PlayerId, number>;
  toAct: PlayerId | null;
  /** Legal moves for the seat that asked, or null if it is not their turn. */
  legal: LegalActions | null;
  lastAction: LastAction | null;
  result: HandResult | null;
  /** Who has pressed "next hand" during handOver. */
  ready: Record<PlayerId, boolean>;
  winner: PlayerId | null;
}

export interface HandSummary {
  handNumber: number;
  result: HandResult;
  stacks: Record<PlayerId, number>;
  gameOver: boolean;
  winner: PlayerId | null;
}

export type PokerActResult =
  | { ok: true; handEnded: false }
  | { ok: true; handEnded: true; summary: HandSummary }
  | { ok: false; error: string };

export interface PokerEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
  startingStack?: number; // default 1000
  smallBlind?: number; // default 10
  bigBlind?: number; // default 20
}
