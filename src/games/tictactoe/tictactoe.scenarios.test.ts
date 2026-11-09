import assert from "node:assert/strict";
import { test } from "node:test";
import { ticTacToe, TicTacToeEngine } from "./index.ts";
import type { GameModuleContext } from "../GameModule.ts";
import type { TicTacToeAction } from "./types.ts";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const players = [{ username: "ann" }, { username: "bob" }];
const move = (cell: number): TicTacToeAction => ({ kind: "move", cell });
const isLine = (cells: number[]) =>
  LINES.some((line) => line.every((i) => cells.includes(i)));

function ctx(describe: (prompt: string) => Promise<string | null> = async () => null): GameModuleContext {
  return { commentator: { describe }, options: {}, players: 2 };
}

// Applies every [seat, cell] pair and asserts each one is accepted.
function playAll(game: TicTacToeEngine, moves: Array<[number, number]>) {
  for (const [seat, cell] of moves) {
    assert.deepEqual(game.apply(seat, move(cell)), {
      ok: true,
      finished: undefined,
    });
  }
}

// Two X-side filler squares that cannot complete anything for O (O has only 2 before X's last move).
function freeCells(line: number[], count: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !line.includes(i)).slice(0, count);
}

// Three O-side filler squares for X that do not already form a line (X would win first otherwise).
function safeThree(line: number[]): [number, number, number] {
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((i) => !line.includes(i));
  for (const a of free) {
    for (const b of free) {
      for (const d of free) {
        if (a < b && b < d && !isLine([a, b, d])) return [a, b, d];
      }
    }
  }
  throw new Error("no safe fillers");
}

for (const line of LINES) {
  test(`X wins on line ${line.join("-")} on its third move`, () => {
    const game = new TicTacToeEngine();
    const [o1, o2] = freeCells(line, 2);
    const results = [
      game.apply(0, move(line[0]!)),
      game.apply(1, move(o1!)),
      game.apply(0, move(line[1]!)),
      game.apply(1, move(o2!)),
      game.apply(0, move(line[2]!)),
    ];
    for (const r of results.slice(0, 4)) assert.equal(r.ok && r.finished, undefined);
    assert.deepEqual(results[4], { ok: true, finished: { winner: 0 } });
    const state = game.getState(1);
    assert.equal(state.over, true);
    assert.equal(state.winner, 0);
    assert.deepEqual(state.line, line);
    assert.equal(state.yourTurn, false);
  });

  test(`O wins on line ${line.join("-")} on its third move`, () => {
    const game = new TicTacToeEngine();
    const [x1, x2, x3] = safeThree(line);
    playAll(game, [[0, x1], [1, line[0]!], [0, x2], [1, line[1]!], [0, x3]]);
    assert.deepEqual(game.apply(1, move(line[2]!)), { ok: true, finished: { winner: 1 } });
    const state = game.getState(0);
    assert.equal(state.winner, 1);
    assert.deepEqual(state.line, line);
    assert.equal(state.over, true);
    assert.equal(state.board[line[0]!], "O");
  });
}

test("a full board with no line is a draw and only the last move finishes", () => {
  const game = new TicTacToeEngine();
  const moves: Array<[number, number]> = [
    [0, 0], [1, 4], [0, 2], [1, 6], [0, 3], [1, 5], [0, 7], [1, 1],
  ];
  playAll(game, moves);
  assert.deepEqual(game.apply(0, move(8)), { ok: true, finished: { winner: null } });
  const state = game.getState(0);
  assert.equal(state.over, true);
  assert.equal(state.winner, null);
  assert.equal(state.line, null);
  assert.equal(state.yourTurn, false);
  assert.equal(state.board.filter(Boolean).length, 9);
});

test("a winning ninth move beats the draw: a full board can still have a winner", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 0], [1, 1], [0, 4], [1, 2], [0, 5], [1, 3], [0, 6], [1, 7]]);
  assert.deepEqual(game.apply(0, move(8)), { ok: true, finished: { winner: 0 } });
  assert.deepEqual(game.getState(0).line, [0, 4, 8]);
  assert.equal(game.getState(0).winner, 0);
});

test("rejects taken squares for both seats without changing the board", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 4]]);
  const before = game.getState(1).board.slice();
  assert.deepEqual(game.apply(1, move(4)), { ok: false, error: "That square is taken." });
  assert.deepEqual(game.getState(1).board, before);
  assert.deepEqual(game.apply(0, move(4)), { ok: false, error: "It's not your turn." });
});

test("rejects out-of-range and non-integer squares", () => {
  const game = new TicTacToeEngine();
  for (const cell of [-1, 9, 100, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(game.apply(0, move(cell)), { ok: false, error: "Pick a square." }, String(cell));
  }
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(0).board.every((cell) => cell === null), true);
});

test("the turn is checked before the square", () => {
  const game = new TicTacToeEngine();
  assert.deepEqual(game.apply(1, move(9)), { ok: false, error: "It's not your turn." });
});

test("the engine rejects unknown action kinds", () => {
  const game = new TicTacToeEngine();
  assert.deepEqual(game.apply(0, { kind: "pass" } as unknown as TicTacToeAction), {
    ok: false,
    error: "Unknown action",
  });
  assert.equal(game.getState(0).yourTurn, true);
});

test("seats other than 0 and 1 never get a turn", () => {
  const game = new TicTacToeEngine();
  assert.deepEqual(game.apply(2, move(0)), { ok: false, error: "It's not your turn." });
  assert.deepEqual(game.apply(-1, move(0)), { ok: false, error: "It's not your turn." });
});

test("every move after a win is rejected as game over, even on an empty square", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 0], [1, 3], [0, 1], [1, 4]]);
  assert.deepEqual(game.apply(0, move(2)), { ok: true, finished: { winner: 0 } });
  assert.deepEqual(game.apply(1, move(8)), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(0, move(8)), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(1, move(0)), { ok: false, error: "The game is over." });
  assert.equal(game.getState(1).board[8], null);
});

test("moves after a draw are rejected as game over", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 0], [1, 4], [0, 2], [1, 6], [0, 3], [1, 5], [0, 7], [1, 1]]);
  game.apply(0, move(8));
  assert.deepEqual(game.apply(1, move(8)), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(0, move(0)), { ok: false, error: "The game is over." });
});

test("a seat's own turn flag and mark follow the alternation", () => {
  const game = new TicTacToeEngine();
  assert.equal(game.getState(0).yourMark, "X");
  assert.equal(game.getState(1).yourMark, "O");
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(1).yourTurn, false);
  assert.equal(game.getState(0).turn, 0);
  game.apply(0, move(4));
  assert.equal(game.getState(0).turn, 1);
  assert.equal(game.getState(1).yourTurn, true);
  assert.equal(game.getState(0).yourTurn, false);
});

test("module handleAction returns null for payloads that are not moves", () => {
  const game = new TicTacToeEngine();
  const payloads: Record<string, unknown>[] = [
    {},
    { kind: "chat", cell: 0 },
    { kind: "MOVE", cell: 0 },
    { kind: 1, cell: 0 },
    { kind: null },
  ];
  for (const payload of payloads) {
    assert.equal(ticTacToe.handleAction(game, 0, payload, ctx()), null);
  }
  assert.equal(game.getState(0).yourTurn, true);
});

test("module handleAction rejects missing or wrong-typed cells before touching the engine", () => {
  const game = new TicTacToeEngine();
  const payloads: Record<string, unknown>[] = [
    { kind: "move" },
    { kind: "move", cell: "4" },
    { kind: "move", cell: null },
    { kind: "move", cell: 1.5 },
    { kind: "move", cell: Number.NaN },
    { kind: "move", cell: [4] },
  ];
  for (const payload of payloads) {
    assert.deepEqual(ticTacToe.handleAction(game, 0, payload, ctx()), {
      ok: false,
      error: "Pick a square.",
    });
  }
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(0).board.every((cell) => cell === null), true);
});

test("module handleAction forwards engine errors for out-of-range cells and bad turns", () => {
  const game = new TicTacToeEngine();
  assert.deepEqual(ticTacToe.handleAction(game, 0, { kind: "move", cell: 9 }, ctx()), {
    ok: false,
    error: "Pick a square.",
  });
  assert.deepEqual(ticTacToe.handleAction(game, 1, { kind: "move", cell: 0 }, ctx()), {
    ok: false,
    error: "It's not your turn.",
  });
  assert.equal(ticTacToe.handleAction(game, 0, { kind: "move", cell: 0 }, ctx())?.ok, true);
});

test("module handleAction sends one commentary prompt per accepted move and none for rejections", async () => {
  const prompts: string[] = [];
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  const game = new TicTacToeEngine();
  ticTacToe.handleAction(game, 0, { kind: "move", cell: 0 }, context);
  ticTacToe.handleAction(game, 0, { kind: "move", cell: 1 }, context);
  ticTacToe.handleAction(game, 1, { kind: "move", cell: 0 }, context);
  assert.equal(prompts.length, 1);
  ticTacToe.handleAction(game, 1, { kind: "move", cell: 4 }, context);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1]!, /Move 2\. Player 2 \(O\) played in square 5\./);
  assert.doesNotMatch(prompts[1]!, /won|draw/);
});

test("the winning move carries finished, the move number, and a win prompt", async () => {
  const prompts: string[] = [];
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  const game = new TicTacToeEngine();
  const script: Array<[number, number]> = [[0, 0], [1, 3], [0, 1], [1, 4]];
  for (const [seat, cell] of script) ticTacToe.handleAction(game, seat, { kind: "move", cell }, context);
  const last = ticTacToe.handleAction(game, 0, { kind: "move", cell: 2 }, context);
  assert.ok(last?.ok);
  if (!last?.ok) return;
  assert.deepEqual(last.finished, { winner: 0 });
  assert.equal(last.commentary?.round, 5);
  assert.equal(await last.commentary?.text, prompts[4]);
  assert.match(prompts[4]!, /Move 5\. Player 1 \(X\) played in square 3\. Player 1 won the game\./);
});

test("the drawing move carries finished with a null winner and a draw prompt", async () => {
  const prompts: string[] = [];
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  const game = new TicTacToeEngine();
  const script: Array<[number, number]> = [
    [0, 0], [1, 4], [0, 2], [1, 6], [0, 3], [1, 5], [0, 7], [1, 1],
  ];
  for (const [seat, cell] of script) ticTacToe.handleAction(game, seat, { kind: "move", cell }, context);
  const last = ticTacToe.handleAction(game, 0, { kind: "move", cell: 8 }, context);
  assert.ok(last?.ok);
  if (!last?.ok) return;
  assert.deepEqual(last.finished, { winner: null });
  assert.equal(last.commentary?.round, 9);
  assert.match(prompts[8]!, /The game ended in a draw\./);
});

test("finished is undefined on every move before the ending move", () => {
  const game = new TicTacToeEngine();
  const script: Array<[number, number]> = [[0, 0], [1, 3], [0, 1], [1, 4]];
  for (const [seat, cell] of script) {
    const result = ticTacToe.handleAction(game, seat, { kind: "move", cell }, ctx());
    assert.ok(result?.ok);
    if (result?.ok) assert.equal(result.finished, undefined);
  }
});

test("rejected moves do not call the commentator", () => {
  let calls = 0;
  const context = ctx(async () => {
    calls++;
    return null;
  });
  const game = new TicTacToeEngine();
  ticTacToe.handleAction(game, 0, { kind: "move", cell: 4 }, context);
  ticTacToe.handleAction(game, 1, { kind: "move", cell: 4 }, context);
  ticTacToe.handleAction(game, 0, { kind: "move", cell: 4 }, context);
  ticTacToe.handleAction(game, 1, { kind: "move", cell: 9 }, context);
  // Only the first, accepted move reaches the commentator.
  assert.equal(calls, 1);
});

test("the view shows each seat its own mark, turn and the opponent's name", () => {
  const game = new TicTacToeEngine();
  game.apply(0, move(4));
  const seat0 = ticTacToe.toView(game, 0, players) as Record<string, unknown>;
  const seat1 = ticTacToe.toView(game, 1, players) as Record<string, unknown>;
  assert.equal(seat0.yourMark, "X");
  assert.equal(seat0.yourTurn, false);
  assert.equal(seat1.yourMark, "O");
  assert.equal(seat1.yourTurn, true);
  assert.equal(seat0.yourName, "ann");
  assert.equal(seat0.opponentName, "bob");
  assert.equal(seat1.yourName, "bob");
  assert.equal(seat1.opponentName, "ann");
  assert.equal(seat0.result, undefined);
  assert.equal(seat0.line, undefined);
  assert.deepEqual(seat1.board, seat0.board);
});

test("the view reports a win per seat with the winning line", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 6], [1, 0], [0, 7], [1, 1]]);
  assert.deepEqual(game.apply(0, move(8)), { ok: true, finished: { winner: 0 } });
  const seat0 = ticTacToe.toView(game, 0, players) as Record<string, unknown>;
  const seat1 = ticTacToe.toView(game, 1, players) as Record<string, unknown>;
  assert.equal(seat0.result, "you");
  assert.equal(seat1.result, "opponent");
  assert.deepEqual(seat0.line, [6, 7, 8]);
  assert.deepEqual(seat1.line, [6, 7, 8]);
  assert.equal(seat0.yourTurn, false);
  assert.equal(seat1.yourTurn, false);
});

test("the view reports a draw to both seats with no line", () => {
  const game = new TicTacToeEngine();
  playAll(game, [[0, 0], [1, 4], [0, 2], [1, 6], [0, 3], [1, 5], [0, 7], [1, 1]]);
  game.apply(0, move(8));
  for (const seat of [0, 1]) {
    const view = ticTacToe.toView(game, seat, players) as Record<string, unknown>;
    assert.equal(view.result, "draw");
    assert.equal(view.line, undefined);
    assert.equal(view.yourTurn, false);
  }
});

test("the view exposes the same keys to both seats", () => {
  const game = new TicTacToeEngine();
  const keys = ["board", "line", "opponentName", "result", "yourMark", "yourName", "yourTurn"];
  for (const seat of [0, 1]) {
    const view = ticTacToe.toView(game, seat, players) as Record<string, unknown>;
    assert.deepEqual(Object.keys(view).sort(), keys);
  }
});

test("the view's board is a copy and cannot change the engine", () => {
  const game = new TicTacToeEngine();
  const view = ticTacToe.toView(game, 0, players) as { board: unknown[] };
  view.board[0] = "X";
  assert.equal(game.getState(0).board[0], null);
});
