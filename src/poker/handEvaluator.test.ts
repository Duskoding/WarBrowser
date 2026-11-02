import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, compareHands, evaluateFive } from './handEvaluator.ts';
import type { Card, Rank, Suit } from './types.ts';

const RANKS: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

// "AS" -> ace of spades, "TD" -> ten of diamonds, "9H" -> nine of hearts.
function card(s: string): Card {
  const rank = RANKS[s[0]];
  if (rank === undefined) throw new Error(`bad rank in ${s}`);
  const suit = s[1] as Suit;
  if (!['S', 'H', 'D', 'C'].includes(suit)) throw new Error(`bad suit in ${s}`);
  return { rank: rank as Rank, suit };
}

const hand = (...codes: string[]): Card[] => codes.map(card);
const value = (...codes: string[]) => evaluateFive(hand(...codes));

test('straight flush, nine-high', () => {
  const v = value('9H', '8H', '7H', '6H', '5H');
  assert.equal(v.category, 'straight-flush');
  assert.equal(v.categoryRank, 8);
  assert.deepEqual(v.tiebreak, [9]);
  assert.equal(v.name, 'Straight flush, Nine-high');
});

test('royal flush is a straight flush with an ace on top', () => {
  const v = value('AS', 'KS', 'QS', 'JS', 'TS');
  assert.equal(v.category, 'straight-flush');
  assert.equal(v.categoryRank, 8);
  assert.equal(v.name, 'Royal flush');
});

test('four of a kind with kicker', () => {
  const v = value('9S', '9H', '9D', '9C', '2S');
  assert.equal(v.category, 'four-of-a-kind');
  assert.equal(v.categoryRank, 7);
  assert.deepEqual(v.tiebreak, [9, 2]);
  assert.equal(v.name, 'Four of a kind, Nines');
});

test('full house, kings over sevens', () => {
  const v = value('KS', 'KH', 'KD', '7C', '7S');
  assert.equal(v.category, 'full-house');
  assert.equal(v.categoryRank, 6);
  assert.deepEqual(v.tiebreak, [13, 7]);
  assert.equal(v.name, 'Full house, Kings over Sevens');
});

test('flush, ace-high', () => {
  const v = value('AS', 'JS', '9S', '6S', '2S');
  assert.equal(v.category, 'flush');
  assert.equal(v.categoryRank, 5);
  assert.deepEqual(v.tiebreak, [14, 11, 9, 6, 2]);
  assert.equal(v.name, 'Flush, Ace-high');
});

test('straight, ten-high', () => {
  const v = value('TS', '9H', '8D', '7C', '6S');
  assert.equal(v.category, 'straight');
  assert.equal(v.categoryRank, 4);
  assert.deepEqual(v.tiebreak, [10]);
  assert.equal(v.name, 'Straight, Ten-high');
});

test('three of a kind, queens', () => {
  const v = value('QS', 'QH', 'QD', '7C', '2S');
  assert.equal(v.category, 'three-of-a-kind');
  assert.equal(v.categoryRank, 3);
  assert.deepEqual(v.tiebreak, [12, 7, 2]);
  assert.equal(v.name, 'Three of a kind, Queens');
});

test('two pair, kings and sevens', () => {
  const v = value('KS', 'KH', '7D', '7C', '2S');
  assert.equal(v.category, 'two-pair');
  assert.equal(v.categoryRank, 2);
  assert.deepEqual(v.tiebreak, [13, 7, 2]);
  assert.equal(v.name, 'Two pair, Kings and Sevens');
});

test('pair of kings', () => {
  const v = value('KS', 'KH', 'AD', '7C', '2S');
  assert.equal(v.category, 'pair');
  assert.equal(v.categoryRank, 1);
  assert.deepEqual(v.tiebreak, [13, 14, 7, 2]);
  assert.equal(v.name, 'Pair of Kings');
});

test('pair of sixes uses the plural "Sixes"', () => {
  assert.equal(value('6S', '6H', 'AD', '7C', '2S').name, 'Pair of Sixes');
});

test('high card, ace-high', () => {
  const v = value('AS', 'KD', '9C', '7H', '3S');
  assert.equal(v.category, 'high-card');
  assert.equal(v.categoryRank, 0);
  assert.deepEqual(v.tiebreak, [14, 13, 9, 7, 3]);
  assert.equal(v.name, 'Ace-high');
});

test('wheel A-2-3-4-5 is a five-high straight with the ace played low', () => {
  const v = value('AS', '2H', '3D', '4C', '5S');
  assert.equal(v.category, 'straight');
  assert.deepEqual(v.tiebreak, [5]);
  assert.deepEqual(v.cards.map((c) => c.rank), [5, 4, 3, 2, 14]);
  assert.equal(v.name, 'Straight, Five-high');
});

test('wheel straight flush is five-high', () => {
  const v = value('AH', '2H', '3H', '4H', '5H');
  assert.equal(v.category, 'straight-flush');
  assert.equal(v.name, 'Straight flush, Five-high');
});

test('the wheel loses to 2-3-4-5-6', () => {
  const wheel = value('AS', '2H', '3D', '4C', '5S');
  const sixHigh = value('2S', '3H', '4D', '5C', '6S');
  assert.ok(compareHands(sixHigh, wheel) > 0);
  assert.ok(compareHands(wheel, sixHigh) < 0);
});

test('ace-high straight (broadway)', () => {
  const v = value('AS', 'KH', 'QD', 'JC', 'TS');
  assert.equal(v.category, 'straight');
  assert.deepEqual(v.tiebreak, [14]);
  assert.equal(v.name, 'Straight, Ace-high');
  assert.ok(compareHands(v, value('KS', 'QH', 'JD', 'TC', '9S')) > 0);
});

test('pair kicker comparison', () => {
  const better = value('KS', 'KH', 'AD', 'QC', 'JS');
  const worse = value('KD', 'KC', 'AH', 'QS', 'TD');
  assert.ok(compareHands(better, worse) > 0);
  assert.ok(compareHands(worse, better) < 0);
});

test('two pair kicker comparison', () => {
  const better = value('KS', 'KH', '7D', '7C', 'AS');
  const worse = value('KD', 'KC', '7H', '7S', 'QD');
  assert.ok(compareHands(better, worse) > 0);
});

test('two pair: higher low pair beats lower low pair with same high pair', () => {
  const better = value('KS', 'KH', '7D', '7C', '2S');
  const worse = value('KD', 'KC', '6H', '6S', 'AD');
  assert.ok(compareHands(better, worse) > 0);
});

test('three of a kind kicker comparison', () => {
  const better = value('QS', 'QH', 'QD', 'KC', '2S');
  const worse = value('QC', 'QH', 'QS', '9C', '3S');
  assert.ok(compareHands(better, worse) > 0);
  const sameTrips = value('QS', 'QH', 'QD', 'AC', '2S');
  assert.ok(compareHands(sameTrips, better) > 0);
});

test('high card kicker comparison', () => {
  const better = value('AS', 'KD', '9C', '7H', '3S');
  const worse = value('AH', 'KC', '9D', '7S', '2H');
  assert.ok(compareHands(better, worse) > 0);
});

test('flush beats straight', () => {
  const flush = value('AS', 'JS', '9S', '6S', '2S');
  const straight = value('AH', 'KC', 'QD', 'JH', 'TS');
  assert.ok(compareHands(flush, straight) > 0);
  assert.ok(compareHands(straight, flush) < 0);
});

test('suits never break ties', () => {
  const spades = value('AS', 'KS', '9S', '7S', '3S');
  const hearts = value('AH', 'KH', '9H', '7H', '3H');
  assert.equal(compareHands(spades, hearts), 0);
});

test('bestHand: the board plays and both players split the pot', () => {
  const board = hand('AS', 'KH', 'QD', 'JC', 'TS');
  const a = bestHand([...hand('2C', '3D'), ...board]);
  const b = bestHand([...hand('4C', '5D'), ...board]);
  assert.equal(a.name, 'Straight, Ace-high');
  assert.equal(b.name, 'Straight, Ace-high');
  assert.equal(compareHands(a, b), 0);
});

test('bestHand: picks the best five of seven', () => {
  const v = bestHand(hand('JS', 'JH', 'JD', '9C', '9S', '2C', '3H'));
  assert.equal(v.category, 'full-house');
  assert.equal(v.name, 'Full house, Jacks over Nines');
  assert.equal(v.cards.length, 5);
});

test('bestHand: with two possible trips, makes the best full house', () => {
  const v = bestHand(hand('KS', 'KH', 'KD', 'QC', 'QS', 'QH', '2D'));
  assert.equal(v.category, 'full-house');
  assert.deepEqual(v.tiebreak, [13, 12]);
  assert.equal(v.name, 'Full house, Kings over Queens');
});

test('bestHand: a five-card hand is just evaluateFive', () => {
  const codes = ['KS', 'KH', 'AD', '7C', '2S'];
  assert.deepEqual(bestHand(hand(...codes)), value(...codes));
});

test('bestHand: rejects fewer than 5 or more than 7 cards', () => {
  assert.throws(() => bestHand(hand('AS', 'KS', 'QS', 'JS')), /5 to 7 cards/);
  assert.throws(() => bestHand(hand('AS', 'KS', 'QS', 'JS', 'TS', '9S', '8S', '7S')), /5 to 7 cards/);
});

test('evaluateFive throws on a wrong card count', () => {
  assert.throws(() => evaluateFive(hand('AS', 'KS', 'QS', 'JS')), /exactly 5 cards/);
  assert.throws(() => evaluateFive(hand('AS', 'KS', 'QS', 'JS', 'TS', '9S')), /exactly 5 cards/);
  assert.throws(() => evaluateFive([]), /exactly 5 cards/);
});

test('evaluateFive throws on a duplicate card', () => {
  assert.throws(() => evaluateFive(hand('AS', 'AS', 'QS', 'JS', 'TS')), /duplicate/);
});

test('compareHands returns 0 for identical hands', () => {
  const v = value('KS', 'KH', 'AD', '7C', '2S');
  assert.equal(compareHands(v, v), 0);
});
