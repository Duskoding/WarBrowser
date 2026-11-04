import assert from "node:assert/strict";
import { test } from "node:test";
import { TicTacToe, ticTacToe } from "./tictactoe.ts";
import { findGame, gameSummaries, games } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {} };
const players = [{ username: "x" }, { username: "o" }];

test("X moves first and players alternate", () => {
  const game = new TicTacToe();
  assert.equal(game.move(1, 0), "It's not your turn.");
  assert.equal(game.move(0, 4), null);
  assert.equal(game.move(0, 0), "It's not your turn.");
  assert.equal(game.move(1, 0), null);
  assert.deepEqual(game.board.slice(0, 5), ["O", null, null, null, "X"]);
});

test("rejects taken squares and bad input", () => {
  const game = new TicTacToe();
  game.move(0, 4);
  assert.equal(game.move(1, 4), "That square is taken.");
  assert.equal(game.move(1, 9), "Pick a square.");
  assert.equal(game.move(1, "3"), "Pick a square.");
});

test("three in a row wins and ends the game", () => {
  const game = new TicTacToe();
  for (const [seat, cell] of [[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]]) game.move(seat, cell);
  assert.equal(game.winner, 0);
  assert.deepEqual(game.line, [0, 1, 2]);
  assert.equal(game.move(1, 8), "The game is over.");
});

test("a full board with no line is a draw", () => {
  const game = new TicTacToe();
  // X O X / X O O / O X X
  for (const [seat, cell] of [[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]]) {
    assert.equal(game.move(seat, cell), null);
  }
  assert.equal(game.over, true);
  assert.equal(game.winner, null);
});

test("the session reports views per seat and the finished result", () => {
  const session = ticTacToe.create(silent, 2);
  assert.equal(session.act(0, { kind: "chat" }), null);
  assert.deepEqual(session.act(1, { kind: "move", cell: 0 }), { ok: false, error: "It's not your turn." });
  let result;
  for (const [seat, cell] of [[0, 0], [1, 3], [0, 1], [1, 4], [0, 2]]) {
    result = session.act(seat, { kind: "move", cell });
  }
  assert.deepEqual(result, { ok: true, finished: { winner: 0 } });
  const view = session.view(1, players) as Record<string, unknown>;
  assert.equal(view.yourMark, "O");
  assert.equal(view.result, "opponent");
  assert.equal(view.yourTurn, false);
});

test("the registry lists every game with a unique id", () => {
  const ids = games.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(findGame("war")?.name, "War");
  assert.equal(findGame("nope"), undefined);
  assert.deepEqual(gameSummaries().map((g) => g.id), ids);
});
