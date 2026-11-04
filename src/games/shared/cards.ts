// A standard 52-card deck, shared by every card game (War, Goofspiel, Crazy
// Eights, Go Fish). Ace is high (14) unless a game says otherwise.

export type Suit = "S" | "H" | "D" | "C";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
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

// Engines take a shuffle function so tests can pass a fixed order.
export type Shuffle = <T>(items: T[]) => T[];

export function isSuit(value: unknown): value is Suit {
  return typeof value === "string" && (SUITS as string[]).includes(value);
}

export function isRank(value: unknown): value is Rank {
  return Number.isInteger(value) && (value as number) >= 2 && (value as number) <= 14;
}

// Parses a card a client sent ({ rank, suit }); returns null if it isn't one.
export function parseCard(value: unknown): Card | null {
  if (value === null || typeof value !== "object") return null;
  const { rank, suit } = value as Record<string, unknown>;
  return isRank(rank) && isSuit(suit) ? { rank, suit } : null;
}

export const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

// Sorts by suit, then rank, for showing a hand.
export function sortHand(cards: Card[]): Card[] {
  return cards
    .slice()
    .sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
}

const RANK_NAMES: Record<number, string> = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
const SUIT_NAMES: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };

export const rankName = (rank: Rank) => RANK_NAMES[rank] ?? String(rank);
export const suitName = (suit: Suit) => SUIT_NAMES[suit];
export const cardName = (card: Card) => `${rankName(card.rank)} of ${suitName(card.suit)}`;
