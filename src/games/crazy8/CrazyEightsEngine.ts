import type { GameEngine } from "../../engine/GameEngine.ts";
import { createDeck, fisherYates, sameCard, sortHand, type Card, type Shuffle, type Suit } from "../shared/cards.ts";

// Crazy Eights uses War's deck and shuffle with Tic-Tac-Toe's turns. Hands are
// hidden: getState(seat) shows your hand and only the size of the opponent's.
// It is the standard-deck version of Uno (#30), so its draw/discard pile
// handling is a starting point for Uno's.

export const HAND_SIZE = 7;

export type CrazyEightsAction =
  | { kind: "play"; card: Card; suit?: Suit } // suit is required when playing an 8
  | { kind: "draw" }
  | { kind: "pass" };

export interface LastPlay {
  seat: number;
  card?: Card; // played card; absent when the player drew or passed
  suit?: Suit; // suit named with an 8
  drew?: boolean;
  passed?: boolean;
}

export type CrazyEightsResult =
  | { ok: false; error: string }
  | { ok: true; finished?: { winner: number | null } };

export interface CrazyEightsState {
  yourHand: Card[];
  playable: Card[]; // the cards in your hand you may play now
  opponentCount: number;
  top: Card;
  suit: Suit; // the suit to match (differs from top.suit after an 8)
  stockCount: number;
  yourTurn: boolean;
  canDraw: boolean;
  canPass: boolean;
  lastPlay: LastPlay | null;
  plays: number; // cards played so far, both players
  winner: number | null;
  over: boolean;
}

export interface CrazyEightsOptions {
  shuffle?: Shuffle;
}

export class CrazyEightsEngine implements GameEngine<CrazyEightsState, CrazyEightsAction, CrazyEightsResult> {
  private readonly shuffle: Shuffle;
  private hands: [Card[], Card[]];
  private stock: Card[];
  private discard: Card[];
  private suit: Suit;
  private turn = 0;
  private drewThisTurn = false;
  private stuckPasses = 0; // passes in a row with nothing left to draw
  private lastPlay: LastPlay | null = null;
  private plays = 0;
  private winner: number | null = null;
  private over = false;

  constructor(options: CrazyEightsOptions = {}) {
    this.shuffle = options.shuffle ?? fisherYates;
    const deck = this.shuffle(createDeck());
    this.hands = [deck.splice(0, HAND_SIZE), deck.splice(0, HAND_SIZE)];
    this.discard = [deck.shift()!];
    this.stock = deck;
    this.suit = this.discard[0].suit;
  }

  private get top(): Card {
    return this.discard[this.discard.length - 1];
  }

  private canPlay(card: Card): boolean {
    return card.rank === 8 || card.suit === this.suit || card.rank === this.top.rank;
  }

  // True if a card could be drawn, reshuffling the discard pile if needed.
  private drawable(): boolean {
    return this.stock.length > 0 || this.discard.length > 1;
  }

  apply(seat: number, action: CrazyEightsAction): CrazyEightsResult {
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const hand = this.hands[seat];

    if (action.kind === "play") {
      const index = hand.findIndex((c) => sameCard(c, action.card));
      if (index < 0) return { ok: false, error: "That card isn't in your hand." };
      const card = hand[index];
      if (!this.canPlay(card)) return { ok: false, error: "Match the suit or rank, or play an 8." };
      if (card.rank === 8 && !action.suit) return { ok: false, error: "Name a suit for your 8." };
      hand.splice(index, 1);
      this.discard.push(card);
      this.suit = card.rank === 8 ? action.suit! : card.suit;
      this.plays++;
      this.lastPlay = { seat, card, suit: card.rank === 8 ? this.suit : undefined };
      this.stuckPasses = 0;
      if (hand.length === 0) {
        this.over = true;
        this.winner = seat;
        return { ok: true, finished: { winner: seat } };
      }
      this.endTurn();
      return { ok: true };
    }

    if (action.kind === "draw") {
      if (this.drewThisTurn) return { ok: false, error: "You already drew this turn. Play a card or pass." };
      if (!this.drawable()) return { ok: false, error: "There are no cards left to draw. Pass." };
      if (this.stock.length === 0) {
        // Shuffle everything but the top card back into the draw pile.
        const top = this.discard.pop()!;
        this.stock = this.shuffle(this.discard);
        this.discard = [top];
      }
      hand.push(this.stock.shift()!);
      this.drewThisTurn = true;
      this.lastPlay = { seat, drew: true };
      return { ok: true };
    }

    if (action.kind === "pass") {
      const stuck = !this.drawable();
      if (!this.drewThisTurn && !stuck) return { ok: false, error: "Draw a card before passing." };
      this.lastPlay = { seat, passed: true };
      if (stuck && ++this.stuckPasses >= 2) {
        // Nobody can play or draw: fewer cards wins.
        this.over = true;
        const [a, b] = this.hands.map((h) => h.length);
        this.winner = a === b ? null : a < b ? 0 : 1;
        return { ok: true, finished: { winner: this.winner } };
      }
      this.endTurn();
      return { ok: true };
    }

    return { ok: false, error: "Unknown action" };
  }

  private endTurn() {
    this.turn = 1 - this.turn;
    this.drewThisTurn = false;
  }

  getState(seat: number): CrazyEightsState {
    const hand = sortHand(this.hands[seat]);
    const yourTurn = !this.over && this.turn === seat;
    return {
      yourHand: hand,
      playable: yourTurn ? hand.filter((c) => this.canPlay(c)) : [],
      opponentCount: this.hands[1 - seat].length,
      top: this.top,
      suit: this.suit,
      stockCount: this.stock.length,
      yourTurn,
      canDraw: yourTurn && !this.drewThisTurn && this.drawable(),
      canPass: yourTurn && (this.drewThisTurn || !this.drawable()),
      lastPlay: this.lastPlay,
      plays: this.plays,
      winner: this.winner,
      over: this.over,
    };
  }
}
