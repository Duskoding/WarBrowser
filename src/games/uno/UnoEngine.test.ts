import { test } from "node:test";
import assert from "node:assert/strict";
import { UnoEngine, createDeck } from "./UnoEngine.ts";
import type { Card, Color } from "./types.ts";

const card = (color: Color | null, rank: Card["rank"]): Card => ({ color, rank });
const identity = <T>(items: T[]): T[] => items.slice();

// Builds an engine with exact hands/discard/draw pile/turn state, bypassing the
// normal deal. hands.length sets the player count.
function rigged(
  hands: Card[][],
  discardTop: Card,
  opts: { direction?: 1 | -1; currentSeat?: number; drawPile?: Card[] } = {},
): UnoEngine {
  const e = new UnoEngine(hands.length, { shuffle: identity });
  const priv = e as unknown as {
    hands: Card[][];
    discardPile: Card[];
    drawPile: Card[];
    activeColor: Color;
    direction: 1 | -1;
    currentSeat: number;
  };
  priv.hands = hands.map((h) => h.slice());
  priv.discardPile = [discardTop];
  priv.activeColor = discardTop.color ?? "red";
  priv.direction = opts.direction ?? 1;
  priv.currentSeat = opts.currentSeat ?? 0;
  priv.drawPile = opts.drawPile ?? Array.from({ length: 20 }, () => card("red", 1));
  return e;
}

test("deck has 108 cards with the official composition", () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(deck.filter((c) => c.rank === "wild").length, 4);
  assert.equal(deck.filter((c) => c.rank === "wildDrawFour").length, 4);
  assert.equal(deck.filter((c) => c.rank === "skip").length, 8);
  assert.equal(deck.filter((c) => c.rank === "reverse").length, 8);
  assert.equal(deck.filter((c) => c.rank === "drawTwo").length, 8);
  assert.equal(deck.filter((c) => c.rank === 0).length, 4);
  assert.equal(deck.filter((c) => c.rank === 5).length, 8);
});

test("deals 7 cards to each seat and leaves one card face up", () => {
  const e = new UnoEngine(3);
  const s = e.getState(0);
  assert.equal(s.hand.length, 7);
  assert.deepEqual(s.handCounts, [7, 7, 7]);
  assert.equal(s.drawPileCount, 108 - 21 - 1);
  assert.equal(s.discardPileCount, 1);
  assert.equal(s.currentSeat, 0);
  assert.equal(s.yourTurn, true);
  assert.equal(e.getState(1).yourTurn, false);
});

test("the opening discard is never a wild", () => {
  for (let i = 0; i < 20; i++) {
    const e = new UnoEngine(2);
    assert.ok(!["wild", "wildDrawFour"].includes(e.getState(0).discardTop.rank as string));
  }
});

test("a number card passes the turn to the next seat", () => {
  const e = rigged([[card("red", 5), card("blue", 2)], [card("blue", 9)]], card("red", 1));
  const r = e.apply(0, { kind: "play", cardIndex: 0 });
  assert.deepEqual(r, { ok: true });
  const s = e.getState(0);
  assert.equal(s.currentSeat, 1);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discardTop.rank, 5);
  assert.equal(s.activeColor, "red");
});

test("rejects a card that matches neither color nor rank", () => {
  const e = rigged([[card("blue", 2)], [card("green", 9)]], card("red", 1));
  assert.deepEqual(e.apply(0, { kind: "play", cardIndex: 0 }), {
    ok: false,
    error: "That card doesn't match the discard pile.",
  });
});

test("a matching rank is playable across colors", () => {
  const e = rigged([[card("blue", 1), card("blue", 8)], [card("green", 9)]], card("red", 1));
  assert.deepEqual(e.apply(0, { kind: "play", cardIndex: 0 }), { ok: true });
});

test("rejects acting out of turn", () => {
  const e = rigged([[card("red", 1)], [card("red", 2)]], card("red", 5));
  assert.deepEqual(e.apply(1, { kind: "play", cardIndex: 0 }), {
    ok: false,
    error: "It's not your turn.",
  });
});

test("rejects an out-of-range card index", () => {
  const e = rigged([[card("red", 1)], [card("red", 2)]], card("red", 5));
  assert.deepEqual(e.apply(0, { kind: "play", cardIndex: 3 }), {
    ok: false,
    error: "Pick a card from your hand.",
  });
});

test("skip passes over the next seat (3 players)", () => {
  const e = rigged(
    [[card("red", "skip"), card("blue", 8)], [card("blue", 9)], [card("green", 9)]],
    card("red", 1),
  );
  e.apply(0, { kind: "play", cardIndex: 0 });
  assert.equal(e.getState(0).currentSeat, 2);
});

test("reverse flips direction with 3+ players", () => {
  const e = rigged(
    [[card("red", "reverse"), card("blue", 8)], [card("blue", 9)], [card("green", 9)]],
    card("red", 1),
  );
  e.apply(0, { kind: "play", cardIndex: 0 });
  const s = e.getState(0);
  assert.equal(s.direction, -1);
  // Direction flips to -1: next seat from 0 going backward is 2.
  assert.equal(s.currentSeat, 2);
});

test("reverse acts as skip with exactly 2 players", () => {
  const e = rigged([[card("red", "reverse"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  e.apply(0, { kind: "play", cardIndex: 0 });
  assert.equal(e.getState(0).currentSeat, 0);
});

test("drawTwo makes the next player draw 2 and lose their turn", () => {
  const drawPile = [card("blue", 3), card("blue", 4), ...Array.from({ length: 10 }, () => card("red", 1))];
  const e = rigged(
    [[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)], [card("green", 9)]],
    card("red", 1),
    { drawPile },
  );
  e.apply(0, { kind: "play", cardIndex: 0 });
  const s = e.getState(0);
  assert.equal(s.currentSeat, 2);
  assert.equal(s.handCounts[1], 3);
});

test("wild requires a chosen color", () => {
  const e = rigged([[card(null, "wild"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  assert.deepEqual(e.apply(0, { kind: "play", cardIndex: 0 }), {
    ok: false,
    error: "Choose a color for that card.",
  });
  assert.deepEqual(e.apply(0, { kind: "play", cardIndex: 0, chosenColor: "green" }), { ok: true });
  assert.equal(e.getState(0).activeColor, "green");
});

test("wildDrawFour makes the next player draw 4 and lose their turn", () => {
  const drawPile = Array.from({ length: 10 }, () => card("red", 1));
  const e = rigged(
    [[card(null, "wildDrawFour"), card("blue", 8)], [card("blue", 9)], [card("green", 9)]],
    card("red", 1),
    { drawPile },
  );
  e.apply(0, { kind: "play", cardIndex: 0, chosenColor: "blue" });
  const s = e.getState(0);
  assert.equal(s.currentSeat, 2);
  assert.equal(s.handCounts[1], 5);
  assert.equal(s.activeColor, "blue");
});

test("emptying your hand wins the game", () => {
  const e = rigged([[card("red", 7)], [card("blue", 9)]], card("red", 1));
  const r = e.apply(0, { kind: "play", cardIndex: 0 });
  assert.deepEqual(r, { ok: true, finished: { winner: 0 } });
  assert.equal(e.getState(0).over, true);
  assert.equal(e.getState(0).winner, 0);
});

test("the game is over once a winner is set", () => {
  const e = rigged([[card("red", 7)], [card("blue", 9)]], card("red", 1));
  e.apply(0, { kind: "play", cardIndex: 0 });
  assert.deepEqual(e.apply(1, { kind: "draw" }), { ok: false, error: "The game is over." });
});

test("drawing a card adds it to your hand and passes the turn", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5), {
    drawPile: [card("green", 3)],
  });
  const r = e.apply(0, { kind: "draw" });
  assert.deepEqual(r, { ok: true });
  const s = e.getState(0);
  assert.equal(s.hand.length, 2);
  assert.equal(s.currentSeat, 1);
});

test("reshuffles the discard pile under the top card once the draw pile empties", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5), { drawPile: [] });
  const priv = e as unknown as { discardPile: Card[] };
  // The last entry is the top card; it must survive the reshuffle.
  priv.discardPile = [card("blue", 2), card("green", 3), card("red", 5)];
  const r = e.apply(0, { kind: "draw" });
  assert.deepEqual(r, { ok: true });
  assert.equal(e.getState(0).discardPileCount, 1);
  assert.equal(e.getState(0).discardTop.rank, 5);
});

test("rejects a player count below 2", () => {
  assert.throws(() => new UnoEngine(1), /at least 2 players/);
});

test("a random full game terminates with a hand-emptying winner", () => {
  const e = new UnoEngine(3, { shuffle: identity });
  let guard = 0;
  while (!e.getState(0).over && guard++ < 2000) {
    const seat = e.getState(0).currentSeat;
    const s = e.getState(seat);
    const playable = s.hand.findIndex(
      (c) => c.rank === "wild" || c.rank === "wildDrawFour" || c.color === s.activeColor || c.rank === s.discardTop.rank,
    );
    if (playable === -1) {
      e.apply(seat, { kind: "draw" });
    } else {
      const c = s.hand[playable];
      const needsColor = c.rank === "wild" || c.rank === "wildDrawFour";
      e.apply(seat, { kind: "play", cardIndex: playable, chosenColor: needsColor ? "red" : undefined });
    }
  }
  assert.equal(e.getState(0).over, true);
  assert.ok(e.getState(0).winner !== null);
});
