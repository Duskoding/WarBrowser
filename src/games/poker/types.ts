// Heads-up no-limit Hold'em. Seats are 0 and 1 (SPEC_POKER.md's old A and B).
import type { EngineResult } from "../../engine/GameEngine.ts";
import type { Card } from "../shared/cards.ts";

export type { Card, Rank, Suit } from "../shared/cards.ts";

export type Seat = 0 | 1;

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface HandValue {
  category: HandCategory;
  /** 0 = high-card … 8 = straight-flush. */
  categoryRank: number;
  /** Ranks compared left to right after categoryRank. */
  tiebreak: number[];
  /** The best five cards, strongest-first by the same ordering as tiebreak. */
  cards: Card[];
  /** Human-readable name, e.g. "Full house, Kings over Sevens". */
  name: string;
}

export type PokerPhase = "preflop" | "flop" | "turn" | "river" | "handOver" | "gameOver";

export type PokerAction =
  | { kind: "fold" }
  | { kind: "check" }
  | { kind: "call" }
  /** Bet or raise to a total of `to` chips committed on this street. */
  | { kind: "raise"; to: number }
  | { kind: "next_hand" };

export interface LegalActions {
  fold: boolean;
  check: boolean;
  /** Chips a call would add; 0 when there is nothing to call. */
  call: number;
  /** null when you cannot bet or raise. */
  minRaiseTo: number | null;
  maxRaiseTo: number | null;
}

export interface HandResult {
  reason: "fold" | "showdown";
  /** One winner, or both seats on a split pot. */
  winners: Seat[];
  /** Chips each seat took from the pot this hand (0 for a loser). */
  potWon: Record<Seat, number>;
  /** Only on showdown. */
  hands: Record<Seat, HandValue> | null;
}

export interface LastAction {
  seat: Seat;
  type: "fold" | "check" | "call" | "raise" | "smallBlind" | "bigBlind";
  /** Street total after a raise or blind; chips added for a call; 0 otherwise. */
  amount: number;
}

export interface PokerState {
  phase: PokerPhase;
  handNumber: number;
  button: Seat;
  smallBlind: number;
  bigBlind: number;
  yourHoleCards: Card[];
  /** Filled only after a showdown; otherwise null. */
  opponentHoleCards: Card[] | null;
  board: Card[];
  /** Chips from previous streets, not counting `committed`. */
  pot: number;
  stacks: Record<Seat, number>;
  /** Chips each seat has put in on the current street. */
  committed: Record<Seat, number>;
  toAct: Seat | null;
  /** Legal moves for the seat that asked, or null if it is not their turn. */
  legal: LegalActions | null;
  lastAction: LastAction | null;
  result: HandResult | null;
  /** Who has pressed "next hand" during handOver. */
  ready: Record<Seat, boolean>;
  winner: Seat | null;
}

export interface HandSummary {
  handNumber: number;
  result: HandResult;
  stacks: Record<Seat, number>;
  gameOver: boolean;
  winner: Seat | null;
}

/** Public facts for commentary. Hole cards are never included. */
export interface PublicMoment {
  actionId: number;
  handNumber: number;
  phase: PokerPhase;
  actor: Seat;
  action: "fold" | "check" | "call" | "raise" | "next_hand";
  amount: number;
  button: Seat;
  board: Card[];
  pot: number;
  committed: number;
  stacks: [number, number];
  handEnded: boolean;
  reason?: "fold" | "showdown";
  winners?: Seat[];
  potWon?: [number, number];
  /** Showdown hand names only, indexed by seat. Not the hole cards. */
  handNames?: [string, string];
  gameOver: boolean;
  winner: Seat | null;
}

export type PokerResult =
  | { ok: false; error: string }
  | { ok: true; handEnded: false; spoke?: PublicMoment; finished?: undefined }
  | {
      ok: true;
      handEnded: true;
      summary: HandSummary;
      spoke?: PublicMoment;
      finished?: { winner: number | null };
    };

export interface PokerEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
  startingStack?: number;
  smallBlind?: number;
  bigBlind?: number;
}

export type ViewSuit = "♠" | "♥" | "♦" | "♣";

export interface ViewCard {
  rank: number;
  suit: ViewSuit;
}

export interface PokerView {
  phase: PokerPhase;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  youAreButton: boolean;
  yourName?: string;
  opponentName?: string;
  yourCards: ViewCard[];
  opponentCards: ViewCard[] | null;
  board: ViewCard[];
  pot: number;
  yourStack: number;
  opponentStack: number;
  yourCommitted: number;
  opponentCommitted: number;
  yourTurn: boolean;
  legal: LegalActions | null;
  lastAction: { who: "you" | "opponent"; type: LastAction["type"]; amount: number } | null;
  result: {
    reason: "fold" | "showdown";
    winners: ("you" | "opponent")[];
    youWon: number;
    opponentWon: number;
    yourHand: string | null;
    opponentHand: string | null;
  } | null;
  youReady: boolean;
  opponentReady: boolean;
  winner: "you" | "opponent" | null;
}

// Compile-time check that poker results stay inside the shared engine result.
export type _PokerResultExtendsEngine = PokerResult extends EngineResult ? true : never;
