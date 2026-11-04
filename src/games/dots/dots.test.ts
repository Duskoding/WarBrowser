import assert from "node:assert/strict";
import { test } from "node:test";
import { DotsEngine, SIZE } from "./DotsEngine.ts";
import { dots } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {} };

test("players alternate when no box is closed", () => {
  const game = new DotsEngine();
  assert.equal(game.apply(1, { kind: "line", dir: "h", row: 0, col: 0 }).ok, false);
  assert.equal(game.apply(0, { kind: "line", dir: "h", row: 0, col: 0 }).ok, true);
  assert.equal(game.getState(1).yourTurn, true);
});

test("rejects a drawn line and lines off the board", () => {
  const game = new DotsEngine();
  game.apply(0, { kind: "line", dir: "v", row: 0, col: 0 });
  assert.deepEqual(game.apply(1, { kind: "line", dir: "v", row: 0, col: 0 }), {
    ok: false,
    error: "That line is already drawn.",
  });
  assert.equal(game.apply(1, { kind: "line", dir: "h", row: SIZE + 1, col: 0 }).ok, false);
  assert.equal(game.apply(1, { kind: "line", dir: "v", row: 0, col: SIZE + 1 }).ok, false);
  assert.equal(dots.handleAction(game, 1, { kind: "line", dir: "x", row: 0, col: 0 }, silent)?.ok, false);
});

test("closing a box scores it and gives another turn", () => {
  const game = new DotsEngine();
  game.apply(0, { kind: "line", dir: "h", row: 0, col: 0 });
  game.apply(1, { kind: "line", dir: "h", row: 1, col: 0 });
  game.apply(0, { kind: "line", dir: "v", row: 0, col: 0 });
  const result = game.apply(1, { kind: "line", dir: "v", row: 0, col: 1 });
  assert.ok(result.ok);
  assert.deepEqual(result.closed, [0]);
  assert.equal(game.getState(1).scores[1], 1);
  assert.equal(game.getState(1).yourTurn, true);
});

test("one line can close two boxes", () => {
  const game = new DotsEngine();
  // Boxes 0 and 1 share v[0][1]; draw every other side of both first.
  const moves: [0 | 1, "h" | "v", number, number][] = [
    [0, "h", 0, 0], [1, "h", 0, 1], [0, "h", 1, 0], [1, "h", 1, 1], [0, "v", 0, 0], [1, "v", 0, 2],
  ];
  for (const [seat, dir, row, col] of moves) assert.equal(game.apply(seat, { kind: "line", dir, row, col }).ok, true);
  const result = game.apply(0, { kind: "line", dir: "v", row: 0, col: 1 });
  assert.ok(result.ok);
  assert.deepEqual(result.closed, [0, 1]);
});

test("the game ends when every box is closed", () => {
  const game = new DotsEngine();
  let last;
  for (let row = 0; row <= SIZE; row++) {
    for (let col = 0; col < SIZE; col++) last = game.apply(game.getState(0).turn, { kind: "line", dir: "h", row, col });
  }
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col <= SIZE; col++) last = game.apply(game.getState(0).turn, { kind: "line", dir: "v", row, col });
  }
  assert.ok(last && last.ok && last.finished);
  const { scores } = game.getState(0);
  assert.equal(scores[0] + scores[1], SIZE * SIZE);
  assert.equal(game.apply(0, { kind: "line", dir: "h", row: 0, col: 0 }).ok, false);
});
