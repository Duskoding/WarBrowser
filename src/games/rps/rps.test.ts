import assert from "node:assert/strict";
import { test } from "node:test";
import { RpsEngine, rps } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {} };
const players = [{ username: "a" }, { username: "b" }];

test("a round resolves only when both players have picked", () => {
  const game = new RpsEngine();
  const first = game.apply(0, { kind: "pick", choice: "rock" });
  assert.deepEqual(first, { ok: true });
  assert.equal(game.getState(1).opponentPicked, true);
  const second = game.apply(1, { kind: "pick", choice: "scissors" });
  assert.ok(second.ok && second.resolved);
  assert.equal(second.resolved.winner, 0);
  assert.equal(game.getState(0).yourScore, 1);
  assert.equal(game.getState(0).round, 2);
});

test("the opponent's pick is never in the view before the reveal", () => {
  const engine = rps.createEngine(silent);
  rps.handleAction(engine, 0, { kind: "pick", choice: "paper" }, silent);
  const guestView = JSON.stringify(rps.toView(engine, 1, players));
  assert.ok(!guestView.includes("paper"));
  assert.equal((rps.toView(engine, 0, players) as { yourPick: string }).yourPick, "paper");
});

test("rejects a second pick and bad choices", () => {
  const game = new RpsEngine();
  game.apply(0, { kind: "pick", choice: "rock" });
  assert.equal(game.apply(0, { kind: "pick", choice: "paper" }).ok, false);
  assert.equal(rps.handleAction(rps.createEngine(silent), 0, { kind: "pick", choice: "lizard" }, silent)?.ok, false);
  assert.equal(rps.handleAction(rps.createEngine(silent), 0, { kind: "flip" }, silent), null);
});

test("a tie counts for no one; first to 3 wins and ends the game", () => {
  const game = new RpsEngine();
  game.apply(0, { kind: "pick", choice: "rock" });
  const tie = game.apply(1, { kind: "pick", choice: "rock" });
  assert.ok(tie.ok && tie.resolved && tie.resolved.winner === null);
  let last;
  for (let i = 0; i < 3; i++) {
    game.apply(0, { kind: "pick", choice: "rock" });
    last = game.apply(1, { kind: "pick", choice: "paper" });
  }
  assert.deepEqual(last && last.ok && last.finished, { winner: 1 });
  assert.equal(game.apply(0, { kind: "pick", choice: "rock" }).ok, false);
  assert.equal((rps.toView(game, 1, players) as { result: string }).result, "you");
});
