import { test } from "node:test";
import assert from "node:assert/strict";
import { WarEngine, createDeck } from "./WarEngine.ts";
import type { Card, Rank } from "./types.ts";

const c = (rank: number, suit: Card["suit"] = "S"): Card => ({ rank: rank as Rank, suit });
const identity = <T>(items: T[]): T[] => items.slice();
const flip = (e: WarEngine, seat: number) => e.apply(seat, { kind: "flip" });

// Builds an engine whose piles are exactly the given cards (top of pile first).
function rigged(a: Card[], b: Card[], maxRounds?: number): WarEngine {
  const e = new WarEngine({ shuffle: identity, maxRounds });
  const priv = e as unknown as { piles: [Card[], Card[]] };
  priv.piles[0] = a.slice();
  priv.piles[1] = b.slice();
  return e;
}

function play(e: WarEngine) {
  flip(e, 0);
  return flip(e, 1);
}

const total = (e: WarEngine) => {
  const s = e.getState(0);
  return s.yourCount + s.opponentCount + s.pile;
};

test("deck has 52 unique cards", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((x) => `${x.rank}${x.suit}`)).size, 52);
});

test("deals 26/26", () => {
  const s = new WarEngine().getState(0);
  assert.equal(s.yourCount, 26);
  assert.equal(s.opponentCount, 26);
  assert.equal(s.phase, "waiting");
});

test("a flipped card is visible to the opponent immediately", () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  assert.deepEqual(flip(e, 0), { ok: true, resolved: false });
  assert.equal(e.getState(0).phase, "flipped");
  assert.deepEqual(e.getState(0).yourCard, c(5));
  assert.equal(e.getState(0).opponentCard, null);
  assert.equal(e.getState(1).yourCard, null);
  assert.deepEqual(e.getState(1).opponentCard, c(5));
  flip(e, 1);
  assert.deepEqual(e.getState(0).opponentCard, c(9));
  assert.deepEqual(e.getState(1).opponentCard, c(5));
});

test("higher card wins both cards", () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  const r = play(e);
  assert.ok(r.ok && r.resolved);
  if (r.ok && r.resolved) {
    assert.equal(r.summary.winner, 1);
    assert.equal(r.summary.wasWar, false);
  }
  const s = e.getState(0);
  assert.equal(s.yourCount, 1);
  assert.equal(s.opponentCount, 3);
  assert.equal(s.phase, "roundOver");
});

test("ace is high", () => {
  const e = rigged([c(14), c(2)], [c(13), c(3)]);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 0);
});

test("rejects double flip and flip after game over", () => {
  const e = rigged([c(5)], [c(9)]);
  flip(e, 0);
  assert.deepEqual(flip(e, 0), { ok: false, error: "You already flipped this round" });
  play(e);
  assert.equal(e.getState(0).phase, "gameOver");
  assert.equal(flip(e, 0).ok, false);
});

test("war: burn 3, flip 4th, winner takes all 10", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(12), c(5)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(8, "H"), c(6)],
  );
  const first = play(e);
  assert.deepEqual(first, { ok: true, resolved: false });
  let s = e.getState(0);
  assert.equal(s.phase, "war");
  assert.equal(s.pile, 8);
  assert.equal(s.inWar, true);
  assert.equal(s.yourCard, null);
  assert.equal(s.opponentCard, null);
  assert.deepEqual(s.warCards, [{ yours: c(7), opponent: c(7, "H") }]);
  assert.deepEqual(e.getState(1).warCards, [{ yours: c(7, "H"), opponent: c(7) }]);
  assert.deepEqual(s.yourStakes[0], { faceUp: true, card: c(7) });
  assert.equal(s.yourStakes.filter((x) => !x.faceUp).length, 3);
  flip(e, 0);
  s = e.getState(0);
  assert.equal(s.phase, "flipped");
  assert.equal(s.inWar, true);
  assert.deepEqual(s.warCards, [{ yours: c(7), opponent: c(7, "H") }]);
  assert.deepEqual(s.yourCard, c(12));
  assert.equal(s.opponentCard, null);
  assert.equal(e.getState(1).inWar, true);
  assert.deepEqual(e.getState(1).opponentCard, c(12));
  const r = flip(e, 1);
  assert.ok(r.ok && r.resolved);
  if (r.ok && r.resolved) {
    assert.equal(r.summary.winner, 0);
    assert.equal(r.summary.wasWar, true);
  }
  s = e.getState(0);
  assert.equal(s.yourCount, 11);
  assert.equal(s.opponentCount, 1);
  assert.equal(s.pile, 0);
  assert.equal(s.inWar, false);
  assert.deepEqual(s.warCards, []);
  assert.deepEqual(s.lastRound, { wasWar: true, winner: 0, cardsWon: 10 });
  assert.equal(s.yourStakes.length, 5);
  assert.ok(s.yourStakes.every((x) => x.faceUp));
  assert.deepEqual(s.yourStakes[0], { faceUp: true, card: c(7) });
  assert.deepEqual(s.yourStakes[4], { faceUp: true, card: c(12) });
});

test("last round result is reported, then cleared by the next flip", () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  assert.equal(e.getState(0).lastRound, null);
  play(e);
  assert.deepEqual(e.getState(0).lastRound, { wasWar: false, winner: 1, cardsWon: 2 });
  assert.equal(e.getState(0).inWar, false);
  assert.deepEqual(e.getState(0).yourStakes, []);
  flip(e, 0);
  assert.equal(e.getState(0).lastRound, null);
});

test("chained war", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(9), c(2), c(3), c(4), c(13)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(5)],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.equal(e.getState(0).warCards.length, 1);
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.equal(e.getState(0).pile, 16);
  assert.equal(e.getState(0).inWar, true);
  assert.deepEqual(e.getState(0).warCards, [
    { yours: c(7), opponent: c(7, "H") },
    { yours: c(9), opponent: c(9, "H") },
  ]);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 0 && r.summary.wasWar);
  assert.equal(e.getState(0).yourCount, 18);
  assert.deepEqual(e.getState(0).lastRound, { wasWar: true, winner: 0, cardsWon: 18 });
});

test("all-in war with short pile", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(5), c(6)],
    [c(7, "H"), c(10, "H")],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.winner === 1);
  const s = e.getState(0);
  assert.equal(s.opponentCount, 7);
  assert.equal(s.yourCount, 1);
});

test("war tie with empty pile loses; both empty is a draw", () => {
  const lose = rigged([c(7)], [c(7, "H"), c(2)]);
  const r = play(lose);
  assert.ok(r.ok && r.resolved && r.summary.winner === 1 && r.summary.gameOver);
  assert.equal(lose.getState(0).winner, 1);

  const draw = rigged([c(7)], [c(7, "H")]);
  const d = play(draw);
  assert.ok(d.ok && d.resolved && d.summary.winner === null && d.summary.gameOver);
  assert.equal(draw.getState(0).winner, null);
});

test("maxRounds ends the game, more cards wins", () => {
  const e = rigged([c(9), c(2), c(2)], [c(3), c(2, "H"), c(2, "D")], 1);
  const r = play(e);
  assert.ok(r.ok && r.resolved && r.summary.gameOver);
  const s = e.getState(0);
  assert.equal(s.phase, "gameOver");
  assert.equal(s.winner, 0);
});

test("next flip after roundOver starts a new round", () => {
  const e = rigged([c(9), c(2)], [c(3), c(5)]);
  play(e);
  assert.deepEqual(flip(e, 0), { ok: true, resolved: false });
  assert.equal(e.getState(0).opponentCard, null);
});

test("random full game conserves 52 cards and terminates", () => {
  const e = new WarEngine({ maxRounds: 5000 });
  let guard = 0;
  while (e.getState(0).phase !== "gameOver" && guard++ < 20000) {
    flip(e, 0);
    flip(e, 1);
    assert.equal(total(e), 52);
  }
  assert.equal(e.getState(0).phase, "gameOver");
});
