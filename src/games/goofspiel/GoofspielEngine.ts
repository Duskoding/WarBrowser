import type { GameEngine } from "../../engine/GameEngine.ts";
import { fisherYates, type Shuffle } from "../shared/cards.ts";

// Goofspiel is War with a choice: instead of flipping the top card, each player
// picks which card to bid. Like War it waits for both players, then reveals.
// A tied bid leaves the prize on the table, like War's pot after a tie.
//
// Cards are values 1..13 (Ace = 1, Jack = 11, Queen = 12, King = 13). Seat 0
// bids with spades, seat 1 with hearts, and the prizes are diamonds.

export const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export type GoofspielAction = { kind: "bid"; value: number };

export interface GoofspielRound {
  round: number;
  bids: [number, number]; // by seat
  prizes: number[]; // every prize this round was for (more than one after ties)
  winner: number | null; // seat, or null if the bids tied
}

export type GoofspielResult =
  | { ok: false; error: string }
  | { ok: true; resolved?: GoofspielRound; finished?: { winner: number | null } };

export interface GoofspielState {
  round: number; // 1..13
  prize: number | null; // the prize turned up this round
  carried: number[]; // prizes left on the table by tied bids
  yourHand: number[];
  yourBid: number | null;
  opponentBid: boolean; // whether they've bid, never what
  yourScore: number;
  opponentScore: number;
  prizesLeft: number; // still in the prize pile, not counting the current prize
  lastRound: GoofspielRound | null;
  winner: number | null;
  over: boolean;
}

export interface GoofspielOptions {
  shuffle?: Shuffle;
}

export class GoofspielEngine implements GameEngine<GoofspielState, GoofspielAction, GoofspielResult> {
  private hands: [number[], number[]] = [VALUES.slice(), VALUES.slice()];
  private prizePile: number[];
  private prize: number | null;
  private carried: number[] = [];
  private bids: [number | null, number | null] = [null, null];
  private scores: [number, number] = [0, 0];
  private round = 1;
  private lastRound: GoofspielRound | null = null;
  private winner: number | null = null;
  private over = false;

  constructor(options: GoofspielOptions = {}) {
    this.prizePile = (options.shuffle ?? fisherYates)(VALUES);
    this.prize = this.prizePile.shift() ?? null;
  }

  apply(seat: number, action: GoofspielAction): GoofspielResult {
    if (action.kind !== "bid") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (this.bids[seat] !== null) return { ok: false, error: "You already bid this round." };
    if (!this.hands[seat].includes(action.value)) return { ok: false, error: "Bid a card from your hand." };

    this.bids[seat] = action.value;
    this.hands[seat] = this.hands[seat].filter((v) => v !== action.value);
    const [a, b] = this.bids;
    if (a === null || b === null) return { ok: true };

    const prizes = [...this.carried, this.prize!];
    const winner = a === b ? null : a > b ? 0 : 1;
    if (winner === null) {
      this.carried = prizes;
    } else {
      this.scores[winner] += prizes.reduce((sum, v) => sum + v, 0);
      this.carried = [];
    }
    const resolved: GoofspielRound = { round: this.round, bids: [a, b], prizes, winner };
    this.lastRound = resolved;
    this.bids = [null, null];
    this.prize = this.prizePile.shift() ?? null;

    if (this.prize === null) {
      // Prizes still carried after the last round go to no one.
      this.over = true;
      const [s0, s1] = this.scores;
      this.winner = s0 === s1 ? null : s0 > s1 ? 0 : 1;
      return { ok: true, resolved, finished: { winner: this.winner } };
    }
    this.round++;
    return { ok: true, resolved };
  }

  getState(seat: number): GoofspielState {
    return {
      round: this.round,
      prize: this.prize,
      carried: this.carried.slice(),
      yourHand: this.hands[seat].slice(),
      yourBid: this.bids[seat],
      opponentBid: this.bids[1 - seat] !== null,
      yourScore: this.scores[seat],
      opponentScore: this.scores[1 - seat],
      prizesLeft: this.prizePile.length,
      lastRound: this.lastRound,
      winner: this.winner,
      over: this.over,
    };
  }
}
