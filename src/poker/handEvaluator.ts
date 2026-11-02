// Best-hand evaluation and comparison for Texas Hold'em. See SPEC_POKER.md §2.
import type { Card, HandCategory, HandValue } from './types.ts';

const SINGULAR: Record<number, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};

function plural(rank: number): string {
  return rank === 6 ? 'Sixes' : `${SINGULAR[rank]}s`;
}

function high(rank: number): string {
  return `${SINGULAR[rank]}-high`;
}

/** Evaluates exactly five cards. Throws on any other count or on duplicate cards. */
export function evaluateFive(cards: Card[]): HandValue {
  if (cards.length !== 5) {
    throw new Error(`evaluateFive needs exactly 5 cards, got ${cards.length}.`);
  }
  if (new Set(cards.map((c) => `${c.rank}${c.suit}`)).size !== 5) {
    throw new Error('evaluateFive got a duplicate card.');
  }

  // Ranks grouped by how many cards share them: biggest group first, then higher rank first.
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.entries()]
    .sort((x, y) => y[1] - x[1] || y[0] - x[0])
    .map(([rank, count]) => ({ rank, count }));

  const ranksDesc = cards.map((c) => c.rank).sort((a, b) => b - a);
  const byRankDesc = [...cards].sort((a, b) => b.rank - a.rank);
  const grouped = groups.flatMap((g) => cards.filter((c) => c.rank === g.rank));
  const flush = cards.every((c) => c.suit === cards[0].suit);

  // Straight: five distinct ranks in a run, or the wheel A-2-3-4-5 (top card 5).
  let straightTop = 0;
  if (groups.length === 5) {
    if (ranksDesc[0] - ranksDesc[4] === 4) straightTop = ranksDesc[0];
    else if (ranksDesc.join(',') === '14,5,4,3,2') straightTop = 5;
  }
  const straight = straightTop > 0;
  // Wheel is ordered 5-4-3-2-A so the ace plays low.
  const straightCards = straightTop === 5 ? [...byRankDesc.slice(1), byRankDesc[0]] : byRankDesc;

  const build = (
    category: HandCategory,
    categoryRank: number,
    tiebreak: number[],
    handCards: Card[],
    name: string,
  ): HandValue => ({ category, categoryRank, tiebreak, cards: handCards, name });

  if (straight && flush) {
    return build(
      'straight-flush',
      8,
      [straightTop],
      straightCards,
      straightTop === 14 ? 'Royal flush' : `Straight flush, ${high(straightTop)}`,
    );
  }

  const [g0, g1] = groups;
  if (g0.count === 4) {
    return build('four-of-a-kind', 7, [g0.rank, g1.rank], grouped, `Four of a kind, ${plural(g0.rank)}`);
  }
  if (g0.count === 3 && g1.count === 2) {
    return build(
      'full-house',
      6,
      [g0.rank, g1.rank],
      grouped,
      `Full house, ${plural(g0.rank)} over ${plural(g1.rank)}`,
    );
  }
  if (flush) {
    return build('flush', 5, ranksDesc, byRankDesc, `Flush, ${high(ranksDesc[0])}`);
  }
  if (straight) {
    return build('straight', 4, [straightTop], straightCards, `Straight, ${high(straightTop)}`);
  }
  if (g0.count === 3) {
    return build(
      'three-of-a-kind',
      3,
      groups.map((g) => g.rank),
      grouped,
      `Three of a kind, ${plural(g0.rank)}`,
    );
  }
  if (g0.count === 2 && g1.count === 2) {
    return build(
      'two-pair',
      2,
      groups.map((g) => g.rank),
      grouped,
      `Two pair, ${plural(g0.rank)} and ${plural(g1.rank)}`,
    );
  }
  if (g0.count === 2) {
    return build('pair', 1, groups.map((g) => g.rank), grouped, `Pair of ${plural(g0.rank)}`);
  }
  return build('high-card', 0, ranksDesc, byRankDesc, high(ranksDesc[0]));
}

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i < items.length; i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

/** Best hand from 5 to 7 cards: the best of every five-card combination. */
export function bestHand(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`bestHand needs 5 to 7 cards, got ${cards.length}.`);
  }
  let best: HandValue | null = null;
  for (const five of combinations(cards, 5)) {
    const value = evaluateFive(five);
    if (best === null || compareHands(value, best) > 0) best = value;
  }
  return best as HandValue;
}

/** > 0 when a wins, < 0 when b wins, 0 on a tie. Suits never break ties. */
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank > b.categoryRank ? 1 : -1;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const x = a.tiebreak[i] ?? 0;
    const y = b.tiebreak[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
