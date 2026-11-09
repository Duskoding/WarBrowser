import assert from "node:assert/strict";
import { test } from "node:test";
import { NimEngine, nim } from "./index.ts";

const silent = { commentator: { describe: async () => "nice" }, options: {}, players: 2 };
const players = [{ username: "ada" }, { username: "bea" }];

test("the host moves first and players alternate", () => {
  const game = new NimEngine();
  assert.equal(game.apply(1, { kind: "take", pile: 0, count: 1 }).ok, false);
  assert.equal(game.apply(0, { kind: "take", pile: 0, count: 2 }).ok, true);
  assert.deepEqual(game.getState(0).piles, [1, 4, 5]);
  assert.equal(game.getState(0).yourTurn, false);
  assert.equal(game.getState(1).yourTurn, true);
  assert.equal(game.apply(0, { kind: "take", pile: 1, count: 1 }).ok, false);
});

test("rejects bad piles and counts", () => {
  const game = new NimEngine();
  assert.deepEqual(game.apply(0, { kind: "take", pile: 3, count: 1 }), { ok: false, error: "Pick a pile." });
  assert.deepEqual(game.apply(0, { kind: "take", pile: 0, count: 0 }), { ok: false, error: "Take at least one stone." });
  assert.deepEqual(game.apply(0, { kind: "take", pile: 0, count: 4 }), {
    ok: false,
    error: "That pile doesn't have that many stones.",
  });
  assert.equal(game.apply(0, { kind: "take", pile: 1, count: 4 }).ok, true);
  assert.deepEqual(game.getState(0).piles, [3, 0, 5]);
});

test("taking the last stone wins and ends the game", () => {
  const game = new NimEngine();
  assert.equal(game.apply(0, { kind: "take", pile: 0, count: 3 }).ok, true);
  assert.equal(game.apply(1, { kind: "take", pile: 1, count: 4 }).ok, true);
  const win = game.apply(0, { kind: "take", pile: 2, count: 5 });
  assert.deepEqual(win, { ok: true, finished: { winner: 0 } });
  assert.equal(game.getState(1).over, true);
  assert.equal(game.getState(1).winner, 0);
  assert.deepEqual(game.apply(1, { kind: "take", pile: 0, count: 1 }), { ok: false, error: "The game is over." });
});

test("both seats see the same piles, and the module records the winner", () => {
  const engine = nim.createEngine(silent);
  assert.equal(nim.handleAction(engine, 0, { kind: "chat" }, silent), null);
  assert.deepEqual(nim.handleAction(engine, 0, { kind: "take", pile: "no", count: 1 }, silent), {
    ok: false,
    error: "Take stones from one pile.",
  });
  nim.handleAction(engine, 0, { kind: "take", pile: 0, count: 3 }, silent);
  nim.handleAction(engine, 1, { kind: "take", pile: 1, count: 4 }, silent);
  const result = nim.handleAction(engine, 0, { kind: "take", pile: 2, count: 5 }, silent);
  assert.equal(result?.ok, true);
  if (result?.ok) {
    assert.deepEqual(result.finished, { winner: 0 });
    assert.equal(result.commentary?.round, 1);
  }
  const host = nim.toView(engine, 0, players) as Record<string, unknown>;
  const guest = nim.toView(engine, 1, players) as Record<string, unknown>;
  assert.deepEqual(host.piles, [0, 0, 0]);
  assert.deepEqual(guest.piles, host.piles);
  assert.equal(host.result, "you");
  assert.equal(guest.result, "opponent");
  assert.deepEqual(guest.lastTake, { who: "opponent", pile: 2, count: 5 });
});
