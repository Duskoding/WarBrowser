import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WarEngine, createDeck } from './WarEngine.ts';
import type { Card, PlayerId, Rank } from './types.ts';

const c = (rank: number, suit: Card['suit'] = 'S'): Card => ({ rank: rank as Rank, suit });
const identity = <T>(items: T[]): T[] => items.slice();

// Builds an engine whose piles are exactly the given cards (top of pile first).
function rigged(a: Card[], b: Card[], maxRounds?: number): WarEngine {
  const e = new WarEngine({ shuffle: identity, maxRounds });
  const priv = e as unknown as { piles: Record<PlayerId, Card[]> };
  priv.piles.A = a.slice();
  priv.piles.B = b.slice();
  return e;
}

function play(e: WarEngine) {
  e.flip('A');
  return e.flip('B');
}

const total = (e: WarEngine) => {
  const s = e.getState('A');
  return s.scoreA + s.scoreB + s.pile;
};

test('deck has 52 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((x) => `${x.rank}${x.suit}`)).size, 52);
});

test('deals 26/26', () => {
  const s = new WarEngine().getState('A');
  assert.equal(s.scoreA, 26);
  assert.equal(s.scoreB, 26);
  assert.equal(s.phase, 'waiting');
});

test('opponent card hidden until both flipped', () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  assert.deepEqual(e.flip('A'), { ok: true, resolved: false });
  assert.equal(e.getState('A').phase, 'flipped');
  assert.deepEqual(e.getState('A').yourCard, c(5));
  assert.equal(e.getState('B').opponentCard, null);
  e.flip('B');
  assert.deepEqual(e.getState('B').opponentCard, c(5));
});

test('higher card wins both cards', () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  const r = play(e);
  assert.ok(r.ok && r.resolved);
  if (r.ok && r.resolved) {
    assert.equal(r.summary.winner, 'B');
    assert.equal(r.summary.wasWar, false);
  }
  const s = e.getState('A');
  assert.equal(s.scoreA, 1);
  assert.equal(s.scoreB, 3);
  assert.equal(s.phase, 'roundOver');
});

test('ace is high', () => {
  const e = rigged([c(14), c(2)], [c(13), c(3)]);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 'A');
});

test('rejects double flip and flip after game over', () => {
  const e = rigged([c(5)], [c(9)]);
  e.flip('A');
  assert.deepEqual(e.flip('A'), { ok: false, error: 'You already flipped this round' });
  play(e);
  assert.equal(e.getState('A').phase, 'gameOver');
  assert.equal(e.flip('A').ok, false);
});

test('war: burn 3, flip 4th, winner takes all 10', () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(12), c(5)],
    [c(7, 'H'), c(2, 'H'), c(3, 'H'), c(4, 'H'), c(8, 'H'), c(6)],
  );
  const first = play(e);
  assert.deepEqual(first, { ok: true, resolved: false });
  let s = e.getState('A');
  assert.equal(s.phase, 'war');
  assert.equal(s.pile, 8);
  assert.deepEqual(s.yourCard, c(7));
  assert.deepEqual(s.opponentCard, c(7, 'H'));
  assert.deepEqual(e.getState('B').yourCard, c(7, 'H'));
  e.flip('A');
  s = e.getState('A');
  assert.deepEqual(s.yourCard, c(12));
  assert.equal(s.opponentCard, null);
  const r = e.flip('B');
  assert.ok(r.ok && r.resolved);
  if (r.ok && r.resolved) {
    assert.equal(r.summary.winner, 'A');
    assert.equal(r.summary.wasWar, true);
  }
  s = e.getState('A');
  assert.equal(s.scoreA, 11);
  assert.equal(s.scoreB, 1);
  assert.equal(s.pile, 0);
});

test('chained war', () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(9), c(2), c(3), c(4), c(13)],
    [c(7, 'H'), c(2, 'H'), c(3, 'H'), c(4, 'H'), c(9, 'H'), c(2, 'H'), c(3, 'H'), c(4, 'H'), c(5)],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.equal(e.getState('A').pile, 16);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 'A' && r.summary.wasWar);
  assert.equal(e.getState('A').scoreA, 18);
});

test('all-in war with short pile', () => {
  // B has only the tying card left plus 1; burns 1, flips last.
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(5), c(6)],
    [c(7, 'H'), c(10, 'H')],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 'B');
  const s = e.getState('A');
  assert.equal(s.scoreB, 7);
  assert.equal(s.scoreA, 1);
});

test('war tie with empty pile loses; both empty is a draw', () => {
  const lose = rigged([c(7)], [c(7, 'H'), c(2)]);
  const r = play(lose);
  assert.ok(r.ok && r.resolved && r.summary.winner === 'B' && r.summary.gameOver);
  assert.equal(lose.getState('A').winner, 'B');

  const draw = rigged([c(7)], [c(7, 'H')]);
  const d = play(draw);
  assert.ok(d.ok && d.resolved && d.summary.winner === null && d.summary.gameOver);
  assert.equal(draw.getState('A').winner, null);
});

test('maxRounds ends the game, more cards wins', () => {
  const e = rigged([c(9), c(2), c(2)], [c(3), c(2, 'H'), c(2, 'D')], 1);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.gameOver);
  const s = e.getState('A');
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 'A');
});

test('next flip after roundOver starts a new round', () => {
  const e = rigged([c(9), c(2)], [c(3), c(5)]);
  play(e);
  assert.deepEqual(e.flip('A'), { ok: true, resolved: false });
  assert.equal(e.getState('A').opponentCard, null);
});

test('random full game conserves 52 cards and terminates', () => {
  const e = new WarEngine({ maxRounds: 5000 });
  let guard = 0;
  while (e.getState('A').phase !== 'gameOver' && guard++ < 20000) {
    e.flip('A');
    e.flip('B');
    assert.equal(total(e), 52);
  }
  assert.equal(e.getState('A').phase, 'gameOver');
});
