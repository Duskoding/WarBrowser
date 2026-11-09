import assert from "node:assert/strict";
import { test } from "node:test";
import { COLS, ConnectFourEngine, ROWS, type ConnectFourResult } from "./ConnectFourEngine.ts";
import { connect4 } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {}, players: 2 };
const players = [{ username: "ann" }, { username: "bob" }];

// Plays the columns in order, alternating seats from seat 0. Returns every result.
function playAll(game: ConnectFourEngine, columns: number[]): ConnectFourResult[] {
  return columns.map((column, i) => game.apply(i % 2, { kind: "drop", column }));
}

const cell = (row: number, col: number) => row * COLS + col;

// ---- Engine: drops and turns ---------------------------------------------

test("a disc falls to the lowest empty row of its column", () => {
  const game = new ConnectFourEngine();
  const cells = [0, 1, 2, 3, 4, 5].map((i) => {
    const result = game.apply(i % 2, { kind: "drop", column: 6 });
    assert.ok(result.ok);
    return result.cell;
  });
  assert.deepEqual(cells, [cell(5, 6), cell(4, 6), cell(3, 6), cell(2, 6), cell(1, 6), cell(0, 6)]);
});

test("turns alternate and a seat that is not on turn is rejected without changing the board", () => {
  const game = new ConnectFourEngine();
  assert.deepEqual(game.apply(1, { kind: "drop", column: 3 }), { ok: false, error: "It's not your turn." });
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(1).yourTurn, false);
  assert.equal(game.getState(0).moves, 0);
  assert.equal(game.apply(0, { kind: "drop", column: 3 }).ok, true);
  assert.deepEqual(game.apply(0, { kind: "drop", column: 4 }), { ok: false, error: "It's not your turn." });
  assert.equal(game.getState(0).yourTurn, false);
  assert.equal(game.getState(1).yourTurn, true);
  assert.equal(game.getState(0).moves, 1);
});

test("a rejected move keeps the turn with the same seat", () => {
  const game = new ConnectFourEngine();
  assert.equal(game.apply(0, { kind: "drop", column: -1 }).ok, false);
  assert.equal(game.getState(0).turn, 0);
  assert.equal(game.apply(0, { kind: "drop", column: 0 }).ok, true);
  assert.equal(game.getState(0).turn, 1);
});

test("a full column is rejected and the same seat can play elsewhere", () => {
  const game = new ConnectFourEngine();
  playAll(game, [0, 0, 0, 0, 0, 0]); // alternating seats fill column 0 without a line
  assert.deepEqual(game.apply(0, { kind: "drop", column: 0 }), { ok: false, error: "That column is full." });
  assert.equal(game.getState(0).turn, 0);
  assert.equal(game.apply(0, { kind: "drop", column: 2 }).ok, true);
});

test("columns that are not whole numbers in range are rejected", () => {
  const game = new ConnectFourEngine();
  for (const column of [-1, COLS, 1.5, NaN, Infinity, 100]) {
    assert.deepEqual(game.apply(0, { kind: "drop", column }), { ok: false, error: "Pick a column." }, `column ${column}`);
  }
  assert.equal(game.getState(0).moves, 0);
});

test("rejects unknown action kinds", () => {
  const game = new ConnectFourEngine();
  assert.deepEqual(game.apply(0, { kind: "pop", column: 0 } as never), { ok: false, error: "Unknown action" });
  assert.equal(game.getState(0).moves, 0);
});

// ---- Engine: lines in every direction ------------------------------------

test("four across wins on the right-hand edge", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [3, 0, 4, 0, 5, 1, 6]);
  const last = results[6];
  assert.deepEqual(last.ok && last.finished, { winner: 0 });
  assert.deepEqual(game.getState(0).line, [cell(5, 3), cell(5, 4), cell(5, 5), cell(5, 6)]);
});

test("four down wins for the second seat", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [0, 6, 1, 6, 2, 6, 0, 6]);
  assert.deepEqual(results[7].ok && results[7].finished, { winner: 1 });
  assert.deepEqual(game.getState(1).line, [cell(2, 6), cell(3, 6), cell(4, 6), cell(5, 6)]);
});

test("four on the ↘ diagonal wins", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [3, 6, 5, 6, 3, 0, 0, 0, 4, 2, 2, 1, 0, 1, 1]);
  assert.deepEqual(results[14].ok && results[14].finished, { winner: 0 });
  // Up-right from row 4 column 0 to row 1 column 3: each step is -COLS+1 in the row-major board.
  assert.deepEqual(game.getState(0).line, [14, 22, 30, 38]);
});

test("four on the ↙ diagonal wins", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [1, 4, 2, 3, 3, 3, 2, 2, 6, 3, 6, 0, 4, 1]);
  assert.deepEqual(results[13].ok && results[13].finished, { winner: 1 });
  // Down-left from row 2 column 3 to row 5 column 0: each step is +COLS-1 in the row-major board.
  assert.deepEqual(game.getState(1).line, [17, 23, 29, 35]);
});

test("a five-in-a-row across wins and the line holds all five discs", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [0, 5, 2, 2, 4, 5, 1, 4, 3]);
  assert.deepEqual(results[8].ok && results[8].finished, { winner: 0 });
  assert.deepEqual(game.getState(0).line, [35, 36, 37, 38, 39]);
});

test("a six-in-a-row across wins and the line holds all six discs", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [1, 1, 5, 0, 6, 6, 4, 6, 2, 2, 3]);
  assert.deepEqual(results[10].ok && results[10].finished, { winner: 0 });
  assert.deepEqual(game.getState(0).line, [36, 37, 38, 39, 40, 41]);
});

test("four down the same column wins with the full line", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, [5, 6, 5, 4, 5, 1, 5]);
  assert.deepEqual(results[6].ok && results[6].finished, { winner: 0 });
  assert.deepEqual(game.getState(0).line, [19, 26, 33, 40]);
});

test("discs of different seats do not join into one line", () => {
  const game = new ConnectFourEngine();
  playAll(game, [0, 1, 2, 3]); // seats 0 and 1 alternate across the bottom row
  assert.equal(game.getState(0).over, false);
  assert.equal(game.getState(0).line, null);
  assert.equal(game.getState(0).winner, null);
});

// ---- Engine: long games, draws and endings -------------------------------

// The board fills with no line of four before the 42nd disc, which (seat 1, column 6) completes one.
const FORTY_TWO_WIN = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 4, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 4, 6, 5, 5, 5, 6, 6, 4, 6, 5, 6, 5, 6];

test("a line completed by the 42nd disc wins rather than drawing", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, FORTY_TWO_WIN);
  for (const result of results.slice(0, -1)) assert.equal(result.ok && result.finished, undefined);
  const last = results[results.length - 1];
  assert.deepEqual(last.ok && last.finished, { winner: 1 });
  assert.equal(game.getState(0).moves, COLS * ROWS);
  assert.equal(game.getState(0).over, true);
  assert.equal(game.getState(0).winner, 1);
  assert.equal(game.getState(0).line?.length, 4);
});

// A full board with no four in a row: the 42nd disc fills the last cell and ends it as a draw.
const FULL_BOARD_DRAW = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];

test("a full board with no line is a draw, with finished set only on the last disc", () => {
  const game = new ConnectFourEngine();
  const results = playAll(game, FULL_BOARD_DRAW);
  for (const result of results.slice(0, -1)) assert.equal(result.ok && result.finished, undefined);
  assert.deepEqual(results[results.length - 1], { ok: true, cell: cell(0, 6), finished: { winner: null } });
  assert.equal(game.getState(0).winner, null);
  assert.equal(game.getState(0).line, null);
  assert.equal(game.getState(0).over, true);
  assert.equal(game.getState(0).yourTurn, false);
});

test("after a win every further drop is rejected and the board is frozen", () => {
  const game = new ConnectFourEngine();
  playAll(game, [3, 0, 4, 0, 5, 1, 6]);
  const before = JSON.stringify(game.getState(0));
  assert.deepEqual(game.apply(1, { kind: "drop", column: 2 }), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(0, { kind: "drop", column: 2 }), { ok: false, error: "The game is over." });
  assert.equal(JSON.stringify(game.getState(0)), before);
});

test("after a draw every further drop is rejected", () => {
  const game = new ConnectFourEngine();
  playAll(game, FULL_BOARD_DRAW);
  assert.deepEqual(game.apply(0, { kind: "drop", column: 0 }), { ok: false, error: "The game is over." });
  assert.equal(game.getState(0).moves, COLS * ROWS);
});

// ---- handleAction ---------------------------------------------------------

test("handleAction returns null for payloads that are not a drop", () => {
  const game = connect4.createEngine(silent);
  assert.equal(connect4.handleAction(game, 0, { kind: "line", column: 1 }, silent), null);
  assert.equal(connect4.handleAction(game, 0, {}, silent), null);
});

test("handleAction rejects a missing, non-integer or non-number column", () => {
  const game = connect4.createEngine(silent);
  const expected = { ok: false, error: "Pick a column." };
  for (const column of [undefined, "3", null, 2.5, NaN, [3]]) {
    assert.deepEqual(connect4.handleAction(game, 0, { kind: "drop", column }, silent), expected, String(column));
  }
  assert.equal(game.getState(0).moves, 0);
});

test("handleAction passes engine rejections through with the engine's message", () => {
  const game = connect4.createEngine(silent);
  assert.deepEqual(connect4.handleAction(game, 1, { kind: "drop", column: 0 }, silent), {
    ok: false,
    error: "It's not your turn.",
  });
  assert.deepEqual(connect4.handleAction(game, 0, { kind: "drop", column: 9 }, silent), {
    ok: false,
    error: "Pick a column.",
  });
});

test("handleAction marks ordinary drops without finished or commentary", () => {
  const game = connect4.createEngine(silent);
  const result = connect4.handleAction(game, 0, { kind: "drop", column: 3 }, silent);
  assert.deepEqual(result, { ok: true });
});

test("handleAction sets finished and commentary only on the winning drop", async () => {
  const prompts: string[] = [];
  const context = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const game = connect4.createEngine(context);
  const columns = [0, 0, 1, 1, 2, 2, 3];
  const results = columns.map((column, i) => connect4.handleAction(game, i % 2, { kind: "drop", column }, context));
  for (const result of results.slice(0, -1)) {
    assert.equal(result?.ok && result.finished, undefined);
    assert.equal(result?.ok && result.commentary, undefined);
  }
  const last = results[results.length - 1];
  assert.ok(last?.ok);
  assert.deepEqual(last.finished, { winner: 0 });
  assert.equal(last.commentary?.round, 7);
  assert.equal(
    await last.commentary?.text,
    "You are a lively sports commentator for a friendly browser game. Write exactly one short sentence (maximum 24 words). Do not mention being an AI, the prompt, or hidden information. Connect Four, move 7: Player 1 dropped a disc in column 4. Player 1 connects four and wins.",
  );
  assert.equal(prompts.length, 1);
});

test("handleAction comments on a drawn game with the draw wording", async () => {
  const prompts: string[] = [];
  const context = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const game = connect4.createEngine(context);
  const results = FULL_BOARD_DRAW.map((column, i) => connect4.handleAction(game, i % 2, { kind: "drop", column }, context));
  const last = results[results.length - 1];
  assert.ok(last?.ok && last.commentary);
  assert.equal(last.commentary.round, COLS * ROWS);
  assert.match(String(await last.commentary.text), /Connect Four, move 42: Player 2 dropped a disc in column 7\. The board is full: the game is a draw\./);
  assert.equal(prompts.length, 1);
});

test("handleAction does not call the commentator for ordinary drops", () => {
  const prompts: string[] = [];
  const context = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const game = connect4.createEngine(context);
  connect4.handleAction(game, 0, { kind: "drop", column: 0 }, context);
  connect4.handleAction(game, 1, { kind: "drop", column: 1 }, context);
  assert.equal(prompts.length, 0);
});

// ---- toView ---------------------------------------------------------------

test("toView describes the board size and marks discs relative to the viewer", () => {
  const game = connect4.createEngine(silent);
  connect4.handleAction(game, 0, { kind: "drop", column: 2 }, silent);
  connect4.handleAction(game, 1, { kind: "drop", column: 5 }, silent);
  const host = connect4.toView(game, 0, players) as { cols: number; rows: number; board: (string | null)[]; yourTurn: boolean; youFirst: boolean; lastCell: number | null; yourName: string; opponentName: string };
  const guest = connect4.toView(game, 1, players) as typeof host;
  assert.equal(host.cols, COLS);
  assert.equal(host.rows, ROWS);
  assert.equal(host.board[cell(5, 2)], "you");
  assert.equal(host.board[cell(5, 5)], "opponent");
  assert.equal(guest.board[cell(5, 2)], "opponent");
  assert.equal(guest.board[cell(5, 5)], "you");
  assert.equal(host.board[cell(5, 0)], null);
  assert.equal(host.yourTurn, true);
  assert.equal(guest.yourTurn, false);
  assert.equal(host.youFirst, true);
  assert.equal(guest.youFirst, false);
  assert.equal(host.lastCell, cell(5, 5));
  assert.equal(guest.lastCell, cell(5, 5));
  assert.equal(host.yourName, "ann");
  assert.equal(host.opponentName, "bob");
  assert.equal(guest.yourName, "bob");
  assert.equal(guest.opponentName, "ann");
});

test("toView has no result or line while the game is in progress", () => {
  const game = connect4.createEngine(silent);
  connect4.handleAction(game, 0, { kind: "drop", column: 0 }, silent);
  const view = connect4.toView(game, 1, players) as { result: unknown; line: unknown };
  assert.equal(view.result, undefined);
  assert.equal(view.line, undefined);
});

test("toView gives each seat its own result and the same winning line", () => {
  const game = connect4.createEngine(silent);
  for (const [i, column] of [3, 0, 4, 0, 5, 1, 6].entries()) connect4.handleAction(game, i % 2, { kind: "drop", column }, silent);
  const host = connect4.toView(game, 0, players) as { result: unknown; line: number[]; yourTurn: boolean };
  const guest = connect4.toView(game, 1, players) as { result: unknown; line: number[]; yourTurn: boolean };
  assert.equal(host.result, "you");
  assert.equal(guest.result, "opponent");
  assert.deepEqual(host.line, [cell(5, 3), cell(5, 4), cell(5, 5), cell(5, 6)]);
  assert.deepEqual(guest.line, host.line);
  assert.equal(host.yourTurn, false);
  assert.equal(guest.yourTurn, false);
});

test("toView reports a draw to both seats", () => {
  const game = connect4.createEngine(silent);
  FULL_BOARD_DRAW.forEach((column, i) => connect4.handleAction(game, i % 2, { kind: "drop", column }, silent));
  assert.equal((connect4.toView(game, 0, players) as { result: unknown }).result, "draw");
  assert.equal((connect4.toView(game, 1, players) as { result: unknown }).result, "draw");
});

test("the module is a two-player game with its own id", () => {
  assert.equal(connect4.id, "connect4");
  assert.deepEqual(connect4.players, { min: 2, max: 2 });
});
