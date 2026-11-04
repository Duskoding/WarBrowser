import type { GameEngine } from "../../engine/GameEngine.ts";
import { createDeck, fisherYates, sortHand, type Card, type Rank, type Shuffle } from "../shared/cards.ts";

// Go Fish uses War's deck and shuffle with Tic-Tac-Toe's turns. Hands are
// hidden, but every ask and answer is public, so getState(seat) includes the
// last ask for both players and the drawn card only for the player who drew it.

export const HAND_SIZE = 7;
export const BOOKS = 13;

export type GoFishAction = { kind: "ask"; rank: Rank };

export interface Ask {
  seat: number;
  rank: Rank;
  got: number; // cards handed over; 0 means "go fish"
  drew?: Card; // the card drawn when fishing (private to `seat`)
  lucky?: boolean; // drew the rank they asked for
  book?: Rank; // a book this ask completed
}

export type GoFishResult =
  | { ok: false; error: string }
  | { ok: true; ask: Ask; finished?: { winner: number | null } };

export interface GoFishState {
  yourHand: Card[];
  opponentCount: number;
  stockCount: number;
  yourBooks: Rank[];
  opponentBooks: Rank[];
  yourTurn: boolean;
  lastAsk: Ask | null;
  asks: number;
  winner: number | null;
  over: boolean;
}

export interface GoFishOptions {
  shuffle?: Shuffle;
}

export class GoFishEngine implements GameEngine<GoFishState, GoFishAction, GoFishResult> {
  private hands: [Card[], Card[]];
  private stock: Card[];
  private books: [Rank[], Rank[]] = [[], []];
  private turn = 0;
  private lastAsk: Ask | null = null;
  private asks = 0;
  private winner: number | null = null;
  private over = false;

  constructor(options: GoFishOptions = {}) {
    const deck = (options.shuffle ?? fisherYates)(createDeck());
    this.hands = [deck.splice(0, HAND_SIZE), deck.splice(0, HAND_SIZE)];
    this.stock = deck;
    this.layDownBooks(0);
    this.layDownBooks(1);
    this.settle();
  }

  apply(seat: number, action: GoFishAction): GoFishResult {
    if (action.kind !== "ask") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const hand = this.hands[seat];
    if (!hand.some((c) => c.rank === action.rank)) return { ok: false, error: "Ask for a rank you hold." };

    const rank = action.rank;
    const other = this.hands[1 - seat];
    const given = other.filter((c) => c.rank === rank);
    const ask: Ask = { seat, rank, got: given.length };
    let again = false;

    if (given.length > 0) {
      this.hands[1 - seat] = other.filter((c) => c.rank !== rank);
      hand.push(...given);
      again = true;
    } else if (this.stock.length > 0) {
      const drawn = this.stock.shift()!;
      hand.push(drawn);
      ask.drew = drawn;
      if (drawn.rank === rank) {
        ask.lucky = true;
        again = true;
      }
    }

    const books = this.layDownBooks(seat);
    if (books.length > 0) ask.book = books[0];
    if (!again) this.turn = 1 - seat;
    this.asks++;
    this.lastAsk = ask;
    this.settle();
    return { ok: true, ask, finished: this.over ? { winner: this.winner } : undefined };
  }

  // Moves any four of a kind from seat's hand to their books.
  private layDownBooks(seat: number): Rank[] {
    const counts = new Map<Rank, number>();
    for (const c of this.hands[seat]) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    const made = [...counts].filter(([, n]) => n === 4).map(([rank]) => rank);
    if (made.length > 0) {
      this.hands[seat] = this.hands[seat].filter((c) => !made.includes(c.rank));
      this.books[seat].push(...made);
    }
    return made;
  }

  // Ends the game when all books are made; otherwise makes sure the player to
  // move has a card to ask with, drawing one or passing the turn if not.
  private settle() {
    for (let guard = 0; guard < 4; guard++) {
      if (this.books[0].length + this.books[1].length === BOOKS) {
        this.over = true;
        const [a, b] = this.books.map((books) => books.length);
        this.winner = a === b ? null : a > b ? 0 : 1;
        return;
      }
      if (this.hands[this.turn].length > 0) return;
      if (this.stock.length > 0) {
        this.hands[this.turn].push(this.stock.shift()!);
        this.layDownBooks(this.turn);
      } else {
        this.turn = 1 - this.turn;
      }
    }
  }

  getState(seat: number): GoFishState {
    const last = this.lastAsk;
    return {
      yourHand: sortHand(this.hands[seat]).sort((a, b) => a.rank - b.rank),
      opponentCount: this.hands[1 - seat].length,
      stockCount: this.stock.length,
      yourBooks: this.books[seat].slice(),
      opponentBooks: this.books[1 - seat].slice(),
      yourTurn: !this.over && this.turn === seat,
      // Only the player who drew sees which card it was.
      lastAsk: last && (last.seat === seat ? { ...last } : { ...last, drew: undefined }),
      asks: this.asks,
      winner: this.winner,
      over: this.over,
    };
  }
}
