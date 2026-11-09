import assert from "node:assert/strict";
import { test } from "node:test";
import { COLS, ConnectFourEngine } from "./ConnectFourEngine.ts";
import { connect4 } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {}, players: 2 };
const players = [{ username: "a" }, { username: "b" }];

function play(game: ConnectFourEngine, columns: number[]) {
  let last;
  columns.forEach((column, i) => (last = game.apply(i % 2, { kind: "drop", column })));
  return last!;
}

test("discs fall to the lowest empty row and players alternate", () => {
  const game = new ConnectFourEngine();
  const first = game.apply(0, { kind: "drop", column: 3 });
  assert.ok(first.ok);
  assert.equal(first.cell, 5 * COLS + 3);
  assert.equal(game.apply(0, { kind: "drop", column: 3 }).ok, false);
  const second = game.apply(1, { kind: "drop", column: 3 });
  assert.ok(second.ok);
  assert.equal(second.cell, 4 * COLS + 3);
});

test("rejects a full column and bad columns", () => {
  const game = new ConnectFourEngine();
  play(game, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(game.apply(0, { kind: "drop", column: 0 }), { ok: false, error: "That column is full." });
  assert.equal(game.apply(0, { kind: "drop", column: 7 }).ok, false);
  assert.equal(connect4.handleAction(game, 0, { kind: "drop", column: "x" }, silent)?.ok, false);
});

test("four across wins", () => {
  const game = new ConnectFourEngine();
  const last = play(game, [0, 0, 1, 1, 2, 2, 3]);
  assert.deepEqual(last.ok && last.finished, { winner: 0 });
  assert.equal(game.getState(0).line?.length, 4);
});

test("four down and four diagonal win", () => {
  const down = new ConnectFourEngine();
  assert.deepEqual(play(down, [6, 5, 6, 5, 6, 5, 6]).ok && down.getState(0).winner, 0);

  // Seat 1's last disc completes a ↘ diagonal (cells 15, 23, 31, 39).
  const diag = new ConnectFourEngine();
  const last = play(diag, [2, 4, 6, 2, 5, 2, 1, 1, 1, 5, 3, 1, 1, 3]);
  assert.deepEqual(last.ok && last.finished, { winner: 1 });
  assert.deepEqual(diag.getState(1).line, [15, 23, 31, 39]);
});

test("a full board with no line is a draw", () => {
  const game = new ConnectFourEngine();
  // Fills the board column pair by column pair without four in a row.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  const last = play(game, order);
  assert.deepEqual(last.ok && last.finished, { winner: null });
});

test("the view marks discs relative to the viewer", () => {
  const engine = connect4.createEngine(silent);
  connect4.handleAction(engine, 0, { kind: "drop", column: 2 }, silent);
  const host = connect4.toView(engine, 0, players) as { board: (string | null)[] };
  const guest = connect4.toView(engine, 1, players) as { board: (string | null)[] };
  assert.equal(host.board[5 * COLS + 2], "you");
  assert.equal(guest.board[5 * COLS + 2], "opponent");
});
