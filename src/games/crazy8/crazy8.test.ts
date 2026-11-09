import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "../shared/cards.ts";
import { CrazyEightsEngine } from "./CrazyEightsEngine.ts";
import { crazy8 } from "./index.ts";

const players = [{ username: "a" }, { username: "b" }];

// Builds a shuffle that deals exactly these cards: seat 0's hand, seat 1's hand,
// the starting discard, then the draw pile. Later shuffles keep their order.
function dealing(hand0: Card[], hand1: Card[], start: Card, stock: Card[]) {
  let first = true;
  return <T>(items: T[]): T[] => {
    if (!first) return items.slice();
    first = false;
    return [...hand0, ...hand1, start, ...stock] as T[];
  };
}
const c = (rank: number, suit: Card["suit"]) => ({ rank, suit }) as Card;
const filler = (suit: Card["suit"], ranks: number[]) => ranks.map((r) => c(r, suit));

test("deals 7 each and starts the discard pile", () => {
  const game = new CrazyEightsEngine();
  const state = game.getState(0);
  assert.equal(state.yourHand.length, 7);
  assert.equal(state.opponentCount, 7);
  assert.equal(state.stockCount, 52 - 15);
});

test("you must match suit or rank; an 8 needs a named suit", () => {
  const hand0 = [c(5, "H"), c(9, "C"), c(8, "S"), ...filler("C", [2, 3, 4, 6])];
  const hand1 = filler("D", [2, 3, 4, 5, 6, 7, 9]);
  const game = new CrazyEightsEngine({ shuffle: dealing(hand0, hand1, c(5, "S"), filler("S", [2, 3, 4])) });
  assert.equal(game.apply(0, { kind: "play", card: c(9, "C") }).ok, false, "no match");
  assert.equal(game.apply(0, { kind: "play", card: c(8, "S") }).ok, false, "8 without a suit");
  assert.equal(game.apply(0, { kind: "play", card: c(5, "H") }).ok, true, "rank match");
  assert.equal(game.getState(1).suit, "H");
  assert.equal(game.apply(1, { kind: "play", card: c(2, "D") }).ok, false);
});

test("an 8 changes the suit", () => {
  const hand0 = [c(8, "S"), ...filler("C", [2, 3, 4, 5, 6, 7])];
  const hand1 = [c(10, "D"), ...filler("H", [2, 3, 4, 5, 6, 7])];
  const game = new CrazyEightsEngine({ shuffle: dealing(hand0, hand1, c(9, "H"), filler("S", [2, 3])) });
  assert.equal(game.apply(0, { kind: "play", card: c(8, "S"), suit: "D" }).ok, true);
  assert.equal(game.getState(1).suit, "D");
  assert.equal(game.apply(1, { kind: "play", card: c(10, "D") }).ok, true);
});

test("draw once, then play or pass", () => {
  const game = new CrazyEightsEngine();
  assert.equal(game.apply(0, { kind: "pass" }).ok, false, "must draw first");
  assert.equal(game.apply(0, { kind: "draw" }).ok, true);
  assert.equal(game.getState(0).yourHand.length, 8);
  assert.equal(game.apply(0, { kind: "draw" }).ok, false, "only one draw");
  assert.equal(game.apply(0, { kind: "pass" }).ok, true);
  assert.equal(game.getState(1).yourTurn, true);
});

test("playing your last card wins", () => {
  const hand0 = [c(4, "S"), ...filler("S", [5, 6, 7, 9, 10, 11])];
  const hand1 = filler("H", [2, 3, 4, 5, 6, 7, 9]);
  const game = new CrazyEightsEngine({ shuffle: dealing(hand0, hand1, c(3, "S"), filler("D", [2, 3, 4, 5, 6])) });
  let last;
  for (const rank of [4, 5, 6, 7, 9, 10, 11]) {
    last = game.apply(0, { kind: "play", card: c(rank, "S") });
    assert.ok(last.ok);
    if (last.finished) break;
    game.apply(1, { kind: "draw" });
    game.apply(1, { kind: "pass" });
  }
  assert.deepEqual(last && last.ok && last.finished, { winner: 0 });
});

test("the opponent's cards never appear in your view", () => {
  const engine = crazy8.createEngine({ commentator: { describe: async () => null }, options: {}, players: 2 });
  const guest = crazy8.toView(engine, 1, players) as Record<string, unknown>;
  const hostHand = engine.getState(0).yourHand;
  const guestJson = JSON.stringify({ ...guest, top: null });
  for (const card of hostHand) assert.ok(!guestJson.includes(JSON.stringify(card)));
  assert.equal(guest.opponentCount, 7);
});

test("with nothing to draw, two passes in a row end the game", () => {
  const hand0 = filler("C", [2, 3, 4, 5, 6, 7, 9]);
  const hand1 = filler("D", [2, 3, 4, 5, 6, 7, 9]);
  const game = new CrazyEightsEngine({ shuffle: dealing(hand0, hand1, c(10, "H"), []) });
  assert.equal(game.getState(0).canDraw, false);
  assert.equal(game.getState(0).canPass, true);
  assert.equal(game.apply(0, { kind: "pass" }).ok, true);
  const last = game.apply(1, { kind: "pass" });
  assert.deepEqual(last.ok && last.finished, { winner: null });
});

test("an empty draw pile is refilled from the discard pile", () => {
  const hand0 = [c(4, "S"), ...filler("C", [2, 3, 5, 6, 7, 9])];
  const hand1 = [c(4, "H"), ...filler("D", [2, 3, 5, 6, 7, 9])];
  const game = new CrazyEightsEngine({ shuffle: dealing(hand0, hand1, c(3, "S"), [c(13, "C")]) });
  game.apply(0, { kind: "play", card: c(4, "S") });
  game.apply(1, { kind: "play", card: c(4, "H") });
  game.apply(0, { kind: "draw" }); // takes the last card in the pile
  game.apply(0, { kind: "pass" });
  assert.equal(game.getState(1).stockCount, 0);
  assert.equal(game.apply(1, { kind: "draw" }).ok, true, "reshuffles the 3♠ and 4♠ under the top card");
  assert.equal(game.getState(1).stockCount, 1);
  assert.deepEqual(game.getState(1).top, c(4, "H"));
});
