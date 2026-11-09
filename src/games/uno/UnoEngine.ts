import type { GameEngine } from "../../engine/GameEngine.ts";
import type { Card, Color, UnoAction, UnoEngineOptions, UnoResult, UnoState } from "./types.ts";

const COLORS: Color[] = ["red", "yellow", "green", "blue"];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    deck.push({ color, rank: 0 });
    for (let rank = 1; rank <= 9; rank++) {
      deck.push({ color, rank: rank as Card["rank"] }, { color, rank: rank as Card["rank"] });
    }
    for (const rank of ["skip", "reverse", "drawTwo"] as const) {
      deck.push({ color, rank }, { color, rank });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, rank: "wild" }, { color: null, rank: "wildDrawFour" });
  }
  return deck;
}

export function fisherYates<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isWild = (card: Card) => card.rank === "wild" || card.rank === "wildDrawFour";

export class UnoEngine implements GameEngine<UnoState, UnoAction, UnoResult> {
  private readonly players: number;
  private readonly shuffle: <T>(items: T[]) => T[];
  private hands: Card[][];
  private drawPile: Card[] = [];
  private discardPile: Card[] = [];
  private activeColor: Color;
  private direction: 1 | -1 = 1;
  private currentSeat = 0;
  private winner: number | null = null;
  private over = false;
  private round = 0;

  constructor(players: number, options: UnoEngineOptions = {}) {
    if (!Number.isInteger(players) || players < 2) {
      throw new Error("Uno needs at least 2 players");
    }
    this.players = players;
    this.shuffle = options.shuffle ?? fisherYates;

    const deck = this.shuffle(createDeck());
    this.hands = Array.from({ length: players }, () => [] as Card[]);
    let i = 0;
    for (let round = 0; round < 7; round++) {
      for (let seat = 0; seat < players; seat++) this.hands[seat].push(deck[i++]);
    }

    const rest = deck.slice(i);
    // The opening discard can't be a wild; pull the first non-wild card found
    // and leave every card around it (including any wilds) in draw order.
    const startIndex = rest.findIndex((card) => !isWild(card));
    const top = rest.splice(startIndex === -1 ? 0 : startIndex, 1)[0];
    this.discardPile = [top];
    this.activeColor = top.color!;
    this.drawPile = rest;
  }

  apply(seat: number, action: UnoAction): UnoResult {
    if (seat < 0 || seat >= this.players) return { ok: false, error: "Invalid seat" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.currentSeat) return { ok: false, error: "It's not your turn." };

    if (action.kind === "draw") return this.draw(seat);
    if (action.kind === "play") return this.play(seat, action.cardIndex, action.chosenColor);
    return { ok: false, error: "Unknown action" };
  }

  getState(seat: number): UnoState {
    return {
      hand: this.hands[seat].slice(),
      handCounts: this.hands.map((hand) => hand.length),
      discardTop: this.discardTop(),
      activeColor: this.activeColor,
      direction: this.direction,
      currentSeat: this.currentSeat,
      yourTurn: !this.over && this.currentSeat === seat,
      drawPileCount: this.drawPile.length,
      discardPileCount: this.discardPile.length,
      round: this.round,
      winner: this.winner,
      over: this.over,
    };
  }

  private draw(seat: number): UnoResult {
    const card = this.takeFromDrawPile();
    if (!card) return { ok: false, error: "No cards left to draw." };
    this.hands[seat].push(card);
    this.advanceTurn(1);
    this.round++;
    return { ok: true };
  }

  private play(seat: number, cardIndex: number, chosenColor: Color | undefined): UnoResult {
    const hand = this.hands[seat];
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= hand.length) {
      return { ok: false, error: "Pick a card from your hand." };
    }
    const card = hand[cardIndex];
    if (!this.canPlay(card)) return { ok: false, error: "That card doesn't match the discard pile." };
    if (isWild(card) && !chosenColor) return { ok: false, error: "Choose a color for that card." };

    hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    this.activeColor = isWild(card) ? chosenColor! : card.color!;
    this.round++;

    if (hand.length === 0) {
      this.winner = seat;
      this.over = true;
      return { ok: true, finished: { winner: seat } };
    }

    this.applyEffect(card.rank);
    return { ok: true };
  }

  private applyEffect(rank: Card["rank"]): void {
    switch (rank) {
      case "skip":
        this.advanceTurn(2);
        break;
      case "reverse":
        this.direction = (this.direction * -1) as 1 | -1;
        // With exactly two seats, reversing has no one new to hand the turn to:
        // official Uno plays this as a Skip, so the same player goes again.
        this.advanceTurn(this.players === 2 ? 2 : 1);
        break;
      case "drawTwo": {
        const victim = this.seatAfter(1);
        this.drawCardsInto(victim, 2);
        this.advanceTurn(2);
        break;
      }
      case "wildDrawFour": {
        const victim = this.seatAfter(1);
        this.drawCardsInto(victim, 4);
        this.advanceTurn(2);
        break;
      }
      default:
        this.advanceTurn(1);
    }
  }

  private canPlay(card: Card): boolean {
    if (isWild(card)) return true;
    const top = this.discardTop();
    return card.color === this.activeColor || card.rank === top.rank;
  }

  private discardTop(): Card {
    return this.discardPile[this.discardPile.length - 1];
  }

  private seatAfter(steps: number): number {
    return (((this.currentSeat + this.direction * steps) % this.players) + this.players) % this.players;
  }

  private advanceTurn(steps: number): void {
    this.currentSeat = this.seatAfter(steps);
  }

  private takeFromDrawPile(): Card | undefined {
    if (this.drawPile.length === 0) this.reshuffleDiscardIntoDrawPile();
    return this.drawPile.shift();
  }

  private drawCardsInto(seat: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const card = this.takeFromDrawPile();
      if (!card) return;
      this.hands[seat].push(card);
    }
  }

  private reshuffleDiscardIntoDrawPile(): void {
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop()!;
    this.drawPile = this.shuffle(this.discardPile);
    this.discardPile = [top];
  }
}
