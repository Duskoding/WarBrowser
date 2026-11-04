import assert from "node:assert/strict";
import { test } from "node:test";
import { TicTacToeEngine, ticTacToe } from "./index.ts";
import { findGame, gameSummaries, games } from "../index.ts";

const silent = { commentator: { describe: async () => null }, options: {} };
const players = [{ username: "x" }, { username: "o" }];

test("X moves first and players alternate", () => {
  const game = new TicTacToeEngine();
  assert.equal(game.apply(1, { kind: "move", cell: 0 }).ok, false);
  assert.equal(game.apply(0, { kind: "move", cell: 4 }).ok, true);
  assert.equal(game.apply(0, { kind: "move", cell: 0 }).ok, false);
  assert.equal(game.apply(1, { kind: "move", cell: 0 }).ok, true);
  assert.deepEqual(game.getState(0).board.slice(0, 5), ["O", null, null, null, "X"]);
});

test("rejects taken squares and bad input", () => {
  const game = new TicTacToeEngine();
  game.apply(0, { kind: "move", cell: 4 });
  assert.deepEqual(game.apply(1, { kind: "move", cell: 4 }), {
    ok: false,
    error: "That square is taken.",
  });
  assert.deepEqual(game.apply(1, { kind: "move", cell: 9 }), {
    ok: false,
    error: "Pick a square.",
  });
});

test("three in a row wins and ends the game", () => {
  const game = new TicTacToeEngine();
  for (const [seat, cell] of [
    [0, 0],
    [1, 3],
    [0, 1],
    [1, 4],
    [0, 2],
  ]) {
    game.apply(seat, { kind: "move", cell });
  }
  assert.equal(game.getState(0).winner, 0);
  assert.deepEqual(game.getState(0).line, [0, 1, 2]);
  assert.deepEqual(game.apply(1, { kind: "move", cell: 8 }), {
    ok: false,
    error: "The game is over.",
  });
});

test("a full board with no line is a draw", () => {
  const game = new TicTacToeEngine();
  for (const [seat, cell] of [
    [0, 0],
    [1, 1],
    [0, 2],
    [1, 4],
    [0, 3],
    [1, 5],
    [0, 7],
    [1, 6],
    [0, 8],
  ]) {
    assert.equal(game.apply(seat, { kind: "move", cell }).ok, true);
  }
  assert.equal(game.getState(0).over, true);
  assert.equal(game.getState(0).winner, null);
});

test("the module reports views per seat and the finished result", () => {
  const engine = ticTacToe.createEngine(silent);
  assert.equal(ticTacToe.handleAction(engine, 0, { kind: "chat" }, silent), null);
  assert.deepEqual(ticTacToe.handleAction(engine, 1, { kind: "move", cell: 0 }, silent), {
    ok: false,
    error: "It's not your turn.",
  });
  let result;
  for (const [seat, cell] of [
    [0, 0],
    [1, 3],
    [0, 1],
    [1, 4],
    [0, 2],
  ]) {
    result = ticTacToe.handleAction(engine, seat, { kind: "move", cell }, silent);
  }
  assert.equal(result?.ok, true);
  if (result?.ok) {
    assert.deepEqual(result.finished, { winner: 0 });
    assert.equal(result.commentary?.round, 5);
  }
  const view = ticTacToe.toView(engine, 1, players) as Record<string, unknown>;
  assert.equal(view.yourMark, "O");
  assert.equal(view.result, "opponent");
  assert.equal(view.yourTurn, false);
});

test("the registry lists every game with a unique id", () => {
  const ids = games.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(findGame("war")?.name, "War");
  assert.equal(findGame("nope"), undefined);
  assert.deepEqual(
    gameSummaries().map((g) => g.id),
    ids,
  );
});
