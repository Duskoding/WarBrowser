import { test } from "node:test";
import assert from "node:assert/strict";
import { RpsEngine } from "./RpsEngine.ts";

const pick = (engine: RpsEngine, seat: number, choice: "rock" | "paper" | "scissors") =>
  engine.apply(seat, { kind: "pick", choice });

test("keeps an unrevealed pick private", () => {
  const engine = new RpsEngine();
  assert.deepEqual(pick(engine, 0, "rock"), { ok: true, resolved: false });
  assert.equal(engine.getState(0).yourChoice, "rock");
  assert.equal(engine.getState(0).opponentChoice, null);
  assert.equal(engine.getState(1).yourChoice, null);
  assert.equal(engine.getState(1).opponentChoice, null);
});

test("reveals both choices and awards the round to the winner", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "rock");
  const result = pick(engine, 1, "scissors");
  assert.ok(result.ok && result.resolved);
  if (result.ok && result.resolved) {
    assert.deepEqual(result.summary, {
      round: 1,
      choices: ["rock", "scissors"],
      winner: 0,
      score0: 1,
      score1: 0,
      gameOver: false,
    });
  }
  assert.equal(engine.getState(0).opponentChoice, "scissors");
  assert.deepEqual(engine.getState(1).lastRound, {
    winner: 0,
    choices: ["scissors", "rock"],
  });
});

test("ties count for neither player", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "paper");
  const result = pick(engine, 1, "paper");
  assert.ok(result.ok && result.resolved);
  if (result.ok && result.resolved) {
    assert.equal(result.summary.winner, null);
    assert.equal(result.summary.score0, 0);
    assert.equal(result.summary.score1, 0);
  }
});

test("starts the next round after a resolved round", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "rock");
  pick(engine, 1, "scissors");
  assert.deepEqual(pick(engine, 0, "paper"), { ok: true, resolved: false });
  const state = engine.getState(0);
  assert.equal(state.yourChoice, "paper");
  assert.equal(state.opponentChoice, null);
  assert.equal(state.lastRound, null);
  assert.equal(state.round, 1);
});

test("first player to three round wins finishes the match", () => {
  const engine = new RpsEngine();
  for (let i = 0; i < 2; i++) {
    pick(engine, 0, "rock");
    pick(engine, 1, "scissors");
  }
  pick(engine, 0, "rock");
  const result = pick(engine, 1, "paper");
  assert.ok(result.ok && result.resolved);
  if (result.ok && result.resolved) {
    assert.equal(result.summary.gameOver, false);
  }
  pick(engine, 0, "rock");
  const final = pick(engine, 1, "scissors");
  assert.deepEqual(final, {
    ok: true,
    resolved: true,
    summary: {
      round: 4,
      choices: ["rock", "scissors"],
      winner: 0,
      score0: 3,
      score1: 1,
      gameOver: true,
    },
    finished: { winner: 0 },
  });
  assert.equal(engine.getState(0).phase, "gameOver");
  assert.deepEqual(pick(engine, 1, "paper"), { ok: false, error: "Game is over" });
});

test("rejects invalid seats, duplicate picks, and invalid choices", () => {
  const engine = new RpsEngine();
  assert.deepEqual(engine.apply(2, { kind: "pick", choice: "rock" }), {
    ok: false,
    error: "Invalid seat",
  });
  assert.deepEqual(engine.apply(0, { kind: "pick", choice: "lizard" as never }), {
    ok: false,
    error: "Invalid choice",
  });
  pick(engine, 0, "rock");
  assert.deepEqual(pick(engine, 0, "paper"), {
    ok: false,
    error: "You already picked this round",
  });
});
