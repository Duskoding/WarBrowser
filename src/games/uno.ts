import type { GameDefinition, PlayerInfo } from "./types.ts";

// Uno for 2–4 players: one hand, first to empty their hand wins.
//
// House simplifications (see decision.md):
// - The starting card is always a number card (action cards are put back).
// - Wild Draw Four can be played at any time; there is no challenge.
// - A drawn card that can be played may be played straight away; otherwise
//   the turn passes. Drawing is one card, never "draw until you can play".
// - Draw Two / Draw Four don't stack.
// - Forgetting to call Uno: after you play down to one card without calling,
//   any other player can catch you (you draw two) until the next card is
//   played or drawn, or you call Uno yourself.

export type UnoColor = "red" | "yellow" | "green" | "blue";
export type UnoValue =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: number; // unique within one game; the client plays cards by id
  color: UnoColor | null; // null for wild cards
  value: UnoValue;
}

// The most recent thing that happened, for the status line.
export type UnoEvent =
  | { kind: "start" }
  | { kind: "play"; seat: number; card: UnoCard; color: UnoColor }
  | { kind: "draw"; seat: number; kept: boolean } // kept: the drawn card can be played
  | { kind: "pass"; seat: number }
  | { kind: "uno"; seat: number }
  | { kind: "caught"; seat: number; by: number };

export const COLORS: UnoColor[] = ["red", "yellow", "green", "blue"];
const ACTIONS: UnoValue[] = ["skip", "reverse", "draw2"];
const HAND_SIZE = 7;

// The standard 108-card deck: per colour one 0, two of 1–9 and two of each
// action card; plus four Wild and four Wild Draw Four.
export function createDeck(): UnoCard[] {
  const cards: Omit<UnoCard, "id">[] = [];
  for (const color of COLORS) {
    cards.push({ color, value: "0" });
    for (let n = 1; n <= 9; n++) {
      cards.push({ color, value: String(n) as UnoValue }, { color, value: String(n) as UnoValue });
    }
    for (const value of ACTIONS) cards.push({ color, value }, { color, value });
  }
  for (let i = 0; i < 4; i++) cards.push({ color: null, value: "wild" }, { color: null, value: "wild4" });
  return cards.map((card, id) => ({ ...card, id }));
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const isNumber = (card: UnoCard) => /^\d$/.test(card.value);
const isColor = (value: unknown): value is UnoColor => COLORS.includes(value as UnoColor);

export class Uno {
  readonly hands: UnoCard[][];
  drawPile: UnoCard[];
  readonly discard: UnoCard[] = [];
  color: UnoColor; // the colour to match (a wild's chosen colour)
  turn = 0; // seat to move; seat 0 (the host) starts
  direction: 1 | -1 = 1;
  winner: number | null = null;
  drawn: UnoCard | null = null; // card the current player just drew and may play
  readonly calledUno: boolean[];
  catchable: number | null = null; // seat that can be caught for not calling Uno
  last: UnoEvent = { kind: "start" };

  readonly playerCount: number;
  private readonly random: () => number;

  constructor(playerCount: number, random: () => number = Math.random) {
    this.playerCount = playerCount;
    this.random = random;
    this.drawPile = shuffle(createDeck(), random);
    this.hands = Array.from({ length: playerCount }, () => this.drawPile.splice(0, HAND_SIZE));
    this.calledUno = Array(playerCount).fill(false);

    const first = this.drawPile.findIndex(isNumber);
    const [start] = this.drawPile.splice(first, 1);
    this.discard.push(start);
    this.color = start.color!;
  }

  get over(): boolean {
    return this.winner !== null;
  }

  get top(): UnoCard {
    return this.discard[this.discard.length - 1];
  }

  canPlay(card: UnoCard): boolean {
    return card.color === null || card.color === this.color || card.value === this.top.value;
  }

  // The seat `steps` turns after the current one, in play direction.
  private seatAfter(steps: number): number {
    const n = this.playerCount;
    return (((this.turn + this.direction * steps) % n) + n) % n;
  }

  // Deals up to `count` cards, reshuffling the discard pile (minus its top card)
  // when the draw pile runs out. Returns the cards dealt.
  private give(seat: number, count: number): UnoCard[] {
    const dealt: UnoCard[] = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        const rest = this.discard.splice(0, this.discard.length - 1);
        this.drawPile = shuffle(rest, this.random);
      }
      const card = this.drawPile.pop();
      if (!card) break;
      dealt.push(card);
    }
    this.hands[seat].push(...dealt);
    if (this.hands[seat].length > 1) this.calledUno[seat] = false;
    return dealt;
  }

  private checkTurn(seat: number): string | null {
    if (this.over) return "The game is over.";
    if (seat !== this.turn) return "It's not your turn.";
    return null;
  }

  play(seat: number, cardId: unknown, chosen?: unknown): string | null {
    const error = this.checkTurn(seat);
    if (error) return error;
    const hand = this.hands[seat];
    const index = hand.findIndex((card) => card.id === cardId);
    if (index === -1) return "You don't have that card.";
    const card = hand[index];
    if (this.drawn && card.id !== this.drawn.id) return "You can only play the card you just drew.";
    if (!this.canPlay(card)) return "That card doesn't match.";
    if (card.color === null && !isColor(chosen)) return "Choose a colour for your wild card.";

    hand.splice(index, 1);
    this.discard.push(card);
    this.color = card.color ?? (chosen as UnoColor);
    this.drawn = null;
    this.catchable = hand.length === 1 && !this.calledUno[seat] ? seat : null;
    this.last = { kind: "play", seat, card, color: this.color };

    if (hand.length === 0) {
      this.winner = seat;
      return null;
    }

    if (card.value === "reverse" && this.playerCount > 2) {
      this.direction = this.direction === 1 ? -1 : 1;
      this.turn = this.seatAfter(1);
    } else if (card.value === "skip" || card.value === "reverse") {
      // With two players, Reverse works like Skip.
      this.turn = this.seatAfter(2);
    } else if (card.value === "draw2" || card.value === "wild4") {
      this.give(this.seatAfter(1), card.value === "draw2" ? 2 : 4);
      this.turn = this.seatAfter(2);
    } else {
      this.turn = this.seatAfter(1);
    }
    return null;
  }

  draw(seat: number): string | null {
    const error = this.checkTurn(seat);
    if (error) return error;
    if (this.drawn) return "You already drew. Play that card or pass.";
    const [card] = this.give(seat, 1);
    this.catchable = null;
    const kept = card !== undefined && this.canPlay(card);
    this.last = { kind: "draw", seat, kept };
    if (kept) this.drawn = card;
    else this.turn = this.seatAfter(1);
    return null;
  }

  pass(seat: number): string | null {
    const error = this.checkTurn(seat);
    if (error) return error;
    if (!this.drawn) return "Draw a card before passing.";
    this.drawn = null;
    this.last = { kind: "pass", seat };
    this.turn = this.seatAfter(1);
    return null;
  }

  // Allowed with two cards (before playing the second-to-last) or one card
  // (before anyone catches you).
  callUno(seat: number): string | null {
    if (this.over) return "The game is over.";
    const count = this.hands[seat].length;
    if (count > 2 || (count === 2 && seat !== this.turn)) return "You can call Uno when you're down to your last card.";
    if (this.calledUno[seat]) return "You already called Uno.";
    this.calledUno[seat] = true;
    if (this.catchable === seat) this.catchable = null;
    this.last = { kind: "uno", seat };
    return null;
  }

  catchPlayer(seat: number): string | null {
    if (this.over) return "The game is over.";
    const target = this.catchable;
    if (target === null || target === seat) return "Nobody to catch right now.";
    this.give(target, 2);
    this.catchable = null;
    this.last = { kind: "caught", seat: target, by: seat };
    return null;
  }
}

// What one player may see: their own hand, and only card counts for others.
export function unoView(game: Uno, seat: number, players: PlayerInfo[]) {
  const name = (s: number) => players[s]?.username ?? `Player ${s + 1}`;
  const yourTurn = !game.over && game.turn === seat;
  return {
    you: seat,
    hand: game.hands[seat],
    playable: yourTurn
      ? game.hands[seat].filter((card) => (game.drawn ? card.id === game.drawn.id : game.canPlay(card))).map((c) => c.id)
      : [],
    top: game.top,
    color: game.color,
    direction: game.direction,
    drawPile: game.drawPile.length,
    turn: game.turn,
    yourTurn,
    drawn: yourTurn && game.drawn ? game.drawn.id : null,
    canCallUno:
      !game.over &&
      !game.calledUno[seat] &&
      (game.hands[seat].length === 1 || (yourTurn && game.hands[seat].length === 2)),
    canCatch: !game.over && game.catchable !== null && game.catchable !== seat,
    players: game.hands.map((hand, s) => ({
      seat: s,
      name: name(s),
      cards: hand.length,
      calledUno: game.calledUno[s],
      catchable: game.catchable === s,
    })),
    last: game.last,
    winner: game.winner,
    winnerName: game.winner === null ? undefined : name(game.winner),
  };
}

export const uno: GameDefinition = {
  id: "uno",
  name: "Uno",
  description: "Match the colour or number, use action cards, and be first to empty your hand.",
  minPlayers: 2,
  players: 4,
  create(_context, playerCount) {
    const game = new Uno(playerCount);
    return {
      view: (seat, players) => unoView(game, seat, players),
      act(seat, payload) {
        let error: string | null;
        if (payload.kind === "play") error = game.play(seat, payload.cardId, payload.color);
        else if (payload.kind === "draw") error = game.draw(seat);
        else if (payload.kind === "pass") error = game.pass(seat);
        else if (payload.kind === "uno") error = game.callUno(seat);
        else if (payload.kind === "catch") error = game.catchPlayer(seat);
        else return null;
        if (error) return { ok: false, error };
        return { ok: true, finished: game.over ? { winner: game.winner } : undefined };
      },
    };
  },
};
