// PLACEHOLDER War engine. Runs in the room creator's browser only because the
// server doesn't have game rules yet. Delete once WarEngine runs on the server
// and sends state itself.
//
// Rules (from SPEC.md): 26/26 split, ace high, both flip, higher card takes the
// middle. Tie → war: each burns 3 face-down (fewer if short), then flips again.

import type { Card, GameView, Phase, Suit } from "./types";

type Seat = 0 | 1; // 0 = host, 1 = guest

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

function shuffledDeck(): Card[] {
  const deck = SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const label = (c: Card) => `${({ 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[c.rank] ?? c.rank}${c.suit}`;

export class HostGame {
  private piles: [Card[], Card[]];
  private middle: Card[] = [];
  private faceUp: [Card | null, Card | null] = [null, null];
  private revealed = false; // both cards of the current flip are showing
  private phase: Phase = "waiting";
  private winner: Seat | null = null;

  constructor(
    private onUpdate: (views: [GameView, GameView], commentary?: [string, string]) => void,
  ) {
    const deck = shuffledDeck();
    this.piles = [deck.slice(0, 26), deck.slice(26)];
    this.emit();
  }

  flip(seat: Seat) {
    if (this.phase === "gameOver") return;
    if (this.revealed) {
      // First flip of a new round (or of a war's deciding card).
      this.faceUp = [null, null];
      this.revealed = false;
    }
    if (this.faceUp[seat]) return; // already flipped this round

    const card = this.piles[seat].shift()!;
    this.faceUp[seat] = card;
    this.middle.push(card);
    this.phase = "flipped";

    const [a, b] = this.faceUp;
    if (!a || !b) return this.emit();

    this.revealed = true;
    if (a.rank === b.rank) {
      // War: burn up to 3, always keeping one card to flip.
      for (const s of [0, 1] as Seat[]) {
        const burn = Math.min(3, Math.max(0, this.piles[s].length - 1));
        this.middle.push(...this.piles[s].splice(0, burn));
      }
      this.phase = "war";
      const out = ([0, 1] as Seat[]).find((s) => this.piles[s].length === 0);
      if (out !== undefined) return this.finish(out === 0 ? 1 : 0, () => "A tie, and someone is out of cards!");
      return this.emit(() => `${label(a)} ties ${label(b)} — WAR!`);
    }

    const roundWinner: Seat = a.rank > b.rank ? 0 : 1;
    const won = this.middle.length;
    this.piles[roundWinner].push(...this.middle);
    this.middle = [];
    this.phase = "roundOver";
    const text = (seat: Seat) =>
      `${label(this.faceUp[seat]!)} vs ${label(this.faceUp[seat === 0 ? 1 : 0]!)}: ` +
      `${seat === roundWinner ? "you take" : "opponent takes"} ${won} cards.`;
    const loser: Seat = roundWinner === 0 ? 1 : 0;
    if (this.piles[loser].length === 0) return this.finish(roundWinner, text);
    this.emit(text);
  }

  private finish(winner: Seat, text: (seat: Seat) => string) {
    this.phase = "gameOver";
    this.winner = winner;
    this.emit((seat) => `${text(seat)} Game over.`);
  }

  private view(seat: Seat): GameView {
    const other: Seat = seat === 0 ? 1 : 0;
    return {
      yourCard: this.faceUp[seat],
      opponentCard: this.revealed ? this.faceUp[other] : null,
      pile: this.middle.length,
      yourCount: this.piles[seat].length,
      opponentCount: this.piles[other].length,
      phase: this.phase,
      winner: this.winner === null ? undefined : this.winner === seat ? "you" : "opponent",
    };
  }

  // Commentary is written per seat so each player reads "you" for themselves.
  private emit(commentary?: (seat: Seat) => string) {
    // PLACEHOLDER commentary: plain text until the AI commentator is wired in.
    this.onUpdate([this.view(0), this.view(1)], commentary && [commentary(0), commentary(1)]);
  }
}
