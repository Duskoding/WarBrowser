import assert from "node:assert/strict";
import { test } from "node:test";
import { GoofspielEngine, goofspiel } from "./index.ts";

const inOrder = <T>(items: T[]) => items.slice(); // prizes come up 1, 2, … 13
const silent = { commentator: { describe: async () => null }, options: { shuffle: inOrder }, players: 2 };
const players = [{ username: "a" }, { username: "b" }];

test("the higher bid takes the prize; bids are used up", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  assert.equal(game.getState(0).prize, 1);
  game.apply(0, { kind: "bid", value: 5 });
  const result = game.apply(1, { kind: "bid", value: 3 });
  assert.ok(result.ok && result.resolved);
  assert.equal(result.resolved.winner, 0);
  assert.equal(game.getState(0).yourScore, 1);
  assert.ok(!game.getState(0).yourHand.includes(5));
  assert.equal(game.apply(0, { kind: "bid", value: 5 }).ok, false);
  assert.equal(game.getState(0).prize, 2);
});

test("a tie carries the prize to the next round", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  game.apply(0, { kind: "bid", value: 7 });
  game.apply(1, { kind: "bid", value: 7 });
  assert.deepEqual(game.getState(0).carried, [1]);
  game.apply(0, { kind: "bid", value: 2 });
  const result = game.apply(1, { kind: "bid", value: 9 });
  assert.ok(result.ok && result.resolved);
  assert.deepEqual(result.resolved.prizes, [1, 2]);
  assert.equal(game.getState(1).yourScore, 3);
  assert.deepEqual(game.getState(1).carried, []);
});

test("the opponent's bid stays hidden until both have bid", () => {
  const engine = goofspiel.createEngine(silent);
  goofspiel.handleAction(engine, 0, { kind: "bid", value: 13 }, silent);
  const view = goofspiel.toView(engine, 1, players) as Record<string, unknown>;
  assert.equal(view.opponentBid, true);
  assert.equal(view.lastRound, null);
  assert.equal(view.yourBid, null);
  assert.deepEqual(Object.keys(view).filter((k) => /opponent/i.test(k)).sort(), [
    "opponentBid",
    "opponentName",
    "opponentScore",
  ]);
});

test("after 13 rounds the higher total wins", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  let last;
  for (let v = 1; v <= 13; v++) {
    game.apply(0, { kind: "bid", value: v });
    last = game.apply(1, { kind: "bid", value: v === 13 ? 1 : v + 1 });
  }
  // Seat 1 outbids on 1..12 (78 points); seat 0 wins only the King round (13).
  assert.deepEqual(last && last.ok && last.finished, { winner: 1 });
  assert.equal(game.getState(1).yourScore, 78);
  assert.equal(game.getState(0).yourScore, 13);
  assert.equal(game.apply(0, { kind: "bid", value: 1 }).ok, false);
});
