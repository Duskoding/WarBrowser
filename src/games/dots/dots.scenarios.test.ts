import assert from "node:assert/strict";
import { test } from "node:test";
import { DotsEngine, SIZE } from "./DotsEngine.ts";
import { dots } from "./index.ts";
import type { DotsAction } from "./DotsEngine.ts";
import type { GameModuleActionResult, GameModuleContext } from "../GameModule.ts";

type Line = { dir: "h" | "v"; row: number; col: number };

const silent: GameModuleContext = { commentator: { describe: async () => null }, options: {}, players: 2 };
const players = [{ username: "ann" }, { username: "bob" }];
const INVALID = { ok: false, error: "Pick a line between two dots." };

// Every line on the board, horizontal lines first, in row-major order.
const LINES: Line[] = [
  ...Array.from({ length: SIZE + 1 }, (_, row) => Array.from({ length: SIZE }, (_, col) => ({ dir: "h" as const, row, col }))).flat(),
  ...Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE + 1 }, (_, col) => ({ dir: "v" as const, row, col }))).flat(),
];

const draw = (engine: DotsEngine, seat: number, line: Line) => engine.apply(seat, { kind: "line", ...line } as DotsAction);

// Plays a list of [seat, line] moves on a fresh engine and asserts each is accepted.
function setup(moves: [0 | 1, Line][]): DotsEngine {
  const engine = new DotsEngine();
  for (const [seat, line] of moves) {
    const result = draw(engine, seat, line);
    assert.ok(result.ok, `move ${JSON.stringify(line)} for seat ${seat}`);
  }
  return engine;
}

// Box 0 has its top (seat 0), bottom (seat 1) and left (seat 0) sides drawn; its
// right side v[0][1] is still open, so seat 1 closes it with that line.
const BOX0_READY: [0 | 1, Line][] = [
  [0, { dir: "h", row: 0, col: 0 }],
  [1, { dir: "h", row: 1, col: 0 }],
  [0, { dir: "v", row: 0, col: 0 }],
];

// Fills the board by always drawing the first free line in `order`. Each action goes
// through handleAction with a commentator that records prompts.
function playOut(order: Line[]) {
  const prompts: string[] = [];
  const context: GameModuleContext = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const engine = new DotsEngine();
  const results: (GameModuleActionResult | null)[] = [];
  const isFree = (line: Line) => {
    const state = engine.getState(0);
    return (line.dir === "h" ? state.h : state.v)[line.row][line.col] === null;
  };
  while (!engine.getState(0).over) {
    const seat = engine.getState(0).turn;
    const line = order.find(isFree);
    assert.ok(line, "a free line remains while boxes are open");
    results.push(dots.handleAction(engine, seat, { kind: "line", ...line }, context));
  }
  return { engine, results, prompts };
}

const firstFirst = LINES;
const lastFirst = [...LINES].reverse();

// ---- Engine: turns and closing ----------------------------------------------

test("seats take turns on plain lines and an out-of-turn seat is rejected without a change", () => {
  const engine = new DotsEngine();
  assert.deepEqual(draw(engine, 1, { dir: "h", row: 0, col: 0 }), { ok: false, error: "It's not your turn." });
  assert.equal(engine.getState(0).yourTurn, true);
  assert.equal(engine.getState(1).yourTurn, false);
  assert.deepEqual(draw(engine, 0, { dir: "h", row: 0, col: 0 }), { ok: true, closed: [] });
  assert.equal(engine.getState(0).turn, 1);
  assert.equal(engine.getState(1).yourTurn, true);
});

test("a line drawn by either seat cannot be drawn again, and the turn stays where it was", () => {
  const engine = new DotsEngine();
  draw(engine, 0, { dir: "h", row: 0, col: 0 });
  const before = JSON.stringify(engine.getState(1));
  assert.deepEqual(draw(engine, 1, { dir: "h", row: 0, col: 0 }), { ok: false, error: "That line is already drawn." });
  assert.equal(JSON.stringify(engine.getState(1)), before);
  assert.equal(engine.getState(1).turn, 1);
});

test("a plain line passes the turn even when it touches an open box", () => {
  const engine = setup([[0, { dir: "h", row: 0, col: 0 }]]);
  const result = draw(engine, 1, { dir: "v", row: 0, col: 0 });
  assert.deepEqual(result, { ok: true, closed: [] });
  assert.equal(engine.getState(0).boxes[0], null);
  assert.equal(engine.getState(0).turn, 0);
});

test("closing one box scores it for the drawing seat and keeps the turn", () => {
  const engine = setup([...BOX0_READY]);
  const result = draw(engine, 1, { dir: "v", row: 0, col: 1 });
  assert.deepEqual(result, { ok: true, closed: [0] });
  assert.equal(engine.getState(0).boxes[0], 1);
  assert.deepEqual(engine.getState(0).scores, [0, 1]);
  assert.equal(engine.getState(0).turn, 1);
  assert.equal(engine.getState(1).yourTurn, true);
  // A plain line from the same seat is what finally passes the turn.
  assert.deepEqual(draw(engine, 1, { dir: "h", row: 3, col: 3 }), { ok: true, closed: [] });
  assert.equal(engine.getState(0).turn, 0);
});

test("one line that closes two boxes scores both and keeps the turn", () => {
  const engine = setup([
    [0, { dir: "h", row: 0, col: 0 }],
    [1, { dir: "h", row: 0, col: 1 }],
    [0, { dir: "h", row: 1, col: 0 }],
    [1, { dir: "h", row: 1, col: 1 }],
    [0, { dir: "v", row: 0, col: 0 }],
    [1, { dir: "v", row: 0, col: 2 }],
  ]);
  assert.equal(engine.getState(0).turn, 0);
  const result = draw(engine, 0, { dir: "v", row: 0, col: 1 });
  assert.deepEqual(result, { ok: true, closed: [0, 1] });
  assert.deepEqual(engine.getState(0).boxes.slice(0, 2), [0, 0]);
  assert.deepEqual(engine.getState(0).scores, [2, 0]);
  assert.equal(engine.getState(0).turn, 0);
  assert.equal(engine.getState(0).yourTurn, true);
});

test("a line that touches two boxes but closes neither passes the turn", () => {
  const engine = setup([
    [0, { dir: "h", row: 0, col: 1 }],
    [1, { dir: "h", row: 1, col: 1 }],
  ]);
  // v[0][1] is shared by boxes 0 and 1; neither has its other sides yet.
  assert.deepEqual(draw(engine, 0, { dir: "v", row: 0, col: 1 }), { ok: true, closed: [] });
  assert.equal(engine.getState(0).turn, 1);
});

test("a box is credited once, to the seat that drew its last side", () => {
  const engine = setup([...BOX0_READY]);
  draw(engine, 1, { dir: "v", row: 0, col: 1 });
  assert.equal(engine.getState(0).boxes[0], 1);
  assert.deepEqual(engine.getState(0).scores, [0, 1]);
  // Box 0 is closed now, so the same lines can't score it again for anyone.
  assert.equal(draw(engine, 0, { dir: "h", row: 0, col: 0 }).ok, false);
  assert.deepEqual(engine.getState(0).scores, [0, 1]);
});

// ---- Engine: input validation -----------------------------------------------

test("accepts the four corner lines of the board", () => {
  const corners: Line[] = [
    { dir: "h", row: 0, col: 0 },
    { dir: "h", row: SIZE, col: SIZE - 1 },
    { dir: "v", row: 0, col: 0 },
    { dir: "v", row: SIZE - 1, col: SIZE },
  ];
  for (const line of corners) {
    assert.deepEqual(draw(new DotsEngine(), 0, line), { ok: true, closed: [] }, JSON.stringify(line));
  }
});

test("rejects lines that are off the board", () => {
  const off: Line[] = [
    { dir: "h", row: SIZE + 1, col: 0 },
    { dir: "h", row: -1, col: 0 },
    { dir: "h", row: 0, col: SIZE },
    { dir: "h", row: 0, col: -1 },
    { dir: "v", row: SIZE, col: 0 },
    { dir: "v", row: -1, col: 0 },
    { dir: "v", row: 0, col: SIZE + 1 },
    { dir: "v", row: 0, col: -1 },
  ];
  for (const line of off) {
    const engine = new DotsEngine();
    assert.deepEqual(draw(engine, 0, line), INVALID, JSON.stringify(line));
    assert.equal(engine.getState(0).turn, 0);
  }
});

test("rejects non-integer coordinates and unknown directions", () => {
  const engine = new DotsEngine();
  const bad = [
    { dir: "h", row: 0.5, col: 0 },
    { dir: "h", row: 0, col: NaN },
    { dir: "v", row: "0", col: 0 },
    { dir: "v", row: 0, col: undefined },
    { dir: "x", row: 0, col: 0 },
    { dir: "H", row: 0, col: 0 },
    { dir: undefined, row: 0, col: 0 },
  ];
  for (const line of bad) {
    assert.deepEqual(engine.apply(0, { kind: "line", ...line } as never), INVALID, JSON.stringify(line));
  }
  assert.equal(engine.getState(0).turn, 0);
});

test("rejects unknown action kinds", () => {
  const engine = new DotsEngine();
  assert.deepEqual(engine.apply(0, { kind: "box", dir: "h", row: 0, col: 0 } as never), {
    ok: false,
    error: "Unknown action",
  });
});

test("a rejected move leaves the board, scores and turn exactly as they were", () => {
  const engine = setup([...BOX0_READY]);
  const before = JSON.stringify(engine.getState(1));
  draw(engine, 1, { dir: "h", row: 9, col: 9 });
  draw(engine, 1, { dir: "v", row: 0, col: 0 });
  assert.equal(JSON.stringify(engine.getState(1)), before);
});

// ---- Engine: whole games ----------------------------------------------------

test("a board filled with an 8-8 split ends in a tie, with finished on the last line only", () => {
  const { engine, results } = playOut(firstFirst);
  for (const result of results.slice(0, -1)) assert.equal(result?.ok && result.finished, undefined);
  const last = results[results.length - 1];
  assert.deepEqual(last?.ok && last.finished, { winner: null });
  assert.equal(engine.getState(0).winner, null);
  assert.deepEqual(engine.getState(0).scores, [8, 8]);
  assert.equal(engine.getState(0).over, true);
  assert.equal(engine.getState(0).yourTurn, false);
});

test("a game where one seat closes every box ends in a win for that seat", () => {
  const { engine, results } = playOut(lastFirst);
  for (const result of results.slice(0, -1)) assert.equal(result?.ok && result.finished, undefined);
  const last = results[results.length - 1];
  assert.deepEqual(last?.ok && last.finished, { winner: 0 });
  assert.deepEqual(engine.getState(1).scores, [16, 0]);
  assert.equal(engine.getState(1).winner, 0);
});

test("after the game ends every further line is rejected", () => {
  const { engine } = playOut(firstFirst);
  const before = JSON.stringify(engine.getState(0));
  assert.deepEqual(draw(engine, 0, { dir: "h", row: 0, col: 0 }), { ok: false, error: "The game is over." });
  assert.deepEqual(draw(engine, 1, { dir: "h", row: 0, col: 0 }), { ok: false, error: "The game is over." });
  assert.equal(JSON.stringify(engine.getState(0)), before);
});

// ---- handleAction -----------------------------------------------------------

test("handleAction returns null for payloads that are not a line", () => {
  const engine = dots.createEngine(silent);
  assert.equal(dots.handleAction(engine, 0, { kind: "box", dir: "h", row: 0, col: 0 }, silent), null);
  assert.equal(dots.handleAction(engine, 0, {}, silent), null);
});

test("handleAction rejects a missing or wrong-typed field before the engine sees it", () => {
  const engine = dots.createEngine(silent);
  const payloads: Record<string, unknown>[] = [
    { kind: "line", row: 0, col: 0 },
    { kind: "line", dir: "h", col: 0 },
    { kind: "line", dir: "h", row: 0 },
    { kind: "line", dir: "h", row: "0", col: 0 },
    { kind: "line", dir: "h", row: 0, col: 1.5 },
    { kind: "line", dir: 1, row: 0, col: 0 },
    { kind: "line", dir: "x", row: 0, col: 0 },
  ];
  for (const payload of payloads) {
    assert.deepEqual(dots.handleAction(engine, 0, payload, silent), INVALID, JSON.stringify(payload));
  }
  assert.equal(engine.getState(0).turn, 0);
});

test("handleAction passes engine rejections through with the engine's message", () => {
  const engine = dots.createEngine(silent);
  assert.deepEqual(dots.handleAction(engine, 1, { kind: "line", dir: "h", row: 0, col: 0 }, silent), {
    ok: false,
    error: "It's not your turn.",
  });
  assert.deepEqual(dots.handleAction(engine, 0, { kind: "line", dir: "h", row: 9, col: 0 }, silent), INVALID);
});

test("handleAction returns a plain ok for a line that closes nothing, without commentary", () => {
  const prompts: string[] = [];
  const context: GameModuleContext = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const engine = dots.createEngine(context);
  assert.deepEqual(dots.handleAction(engine, 0, { kind: "line", dir: "h", row: 0, col: 0 }, context), { ok: true });
  assert.equal(prompts.length, 0);
});

test("handleAction marks commentary and scores on a box-closing line, with the box count as the round", async () => {
  const prompts: string[] = [];
  const context: GameModuleContext = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const engine = dots.createEngine(context);
  for (const [seat, line] of BOX0_READY) {
    dots.handleAction(engine, seat, { kind: "line", ...line }, context);
  }
  const result = dots.handleAction(engine, 1, { kind: "line", dir: "v", row: 0, col: 1 }, context);
  assert.ok(result?.ok);
  assert.equal(result.finished, undefined);
  assert.equal(result.commentary?.round, 1);
  assert.equal(await result.commentary?.text, "You are a lively sports commentator for a friendly browser game. Write exactly one short sentence (maximum 24 words). Do not mention being an AI, the prompt, or hidden information. Dots and Boxes: Player 2 closed a box with one line. Score 0-1.");
  assert.equal(prompts.length, 1);
});

test("handleAction describes a two-box close in the plural", async () => {
  const prompts: string[] = [];
  const context: GameModuleContext = {
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    options: {},
    players: 2,
  };
  const engine = dots.createEngine(context);
  const moves: [0 | 1, Line][] = [
    [0, { dir: "h", row: 0, col: 0 }],
    [1, { dir: "h", row: 0, col: 1 }],
    [0, { dir: "h", row: 1, col: 0 }],
    [1, { dir: "h", row: 1, col: 1 }],
    [0, { dir: "v", row: 0, col: 0 }],
    [1, { dir: "v", row: 0, col: 2 }],
  ];
  for (const [seat, line] of moves) dots.handleAction(engine, seat, { kind: "line", ...line }, context);
  const result = dots.handleAction(engine, 0, { kind: "line", dir: "v", row: 0, col: 1 }, context);
  assert.ok(result?.ok && result.commentary);
  assert.equal(result.commentary.round, 2);
  assert.match(String(await result.commentary.text), /Player 1 closed 2 boxes with one line\. Score 2-0\.$/);
});

test("handleAction sets finished and a draw comment on the last line of a tied game", async () => {
  const { results, prompts } = playOut(firstFirst);
  for (const result of results.slice(0, -1)) assert.equal(result?.ok && result.finished, undefined);
  const last = results[results.length - 1];
  assert.ok(last?.ok && last.commentary);
  assert.deepEqual(last.finished, { winner: null });
  assert.equal(last.commentary.round, 16);
  const finalPrompt = String(await last.commentary.text);
  assert.match(finalPrompt, /Score 8-8\. The game ends in a draw\.$/);
  // Every box-closing action has a comment; the plain lines have none.
  const closing = results.filter((result) => result?.ok && result.commentary);
  assert.equal(prompts.length, closing.length);
});

test("handleAction sets finished and a win comment on the last line of a one-sided game", async () => {
  const { results, prompts } = playOut(lastFirst);
  const last = results[results.length - 1];
  assert.ok(last?.ok && last.commentary);
  assert.deepEqual(last.finished, { winner: 0 });
  assert.equal(last.commentary.round, 16);
  assert.match(String(await last.commentary.text), /Score 16-0\. Player 1 wins the game\.$/);
  assert.equal(prompts.length, results.filter((result) => result?.ok && result.commentary).length);
});

// ---- toView -----------------------------------------------------------------

test("toView marks lines and boxes relative to each seat", () => {
  const engine = setup([...BOX0_READY]);
  draw(engine, 1, { dir: "v", row: 0, col: 1 });
  const host = dots.toView(engine, 0, players) as Record<string, unknown> & { h: string[][]; v: string[][]; boxes: string[] };
  const guest = dots.toView(engine, 1, players) as typeof host;
  assert.equal(host.h[0][0], "you");
  assert.equal(host.h[1][0], "opponent");
  assert.equal(host.v[0][0], "you");
  assert.equal(host.v[0][1], "opponent");
  assert.equal(host.h[0][1], null);
  assert.equal(host.boxes[0], "opponent");
  assert.equal(guest.h[0][0], "opponent");
  assert.equal(guest.h[1][0], "you");
  assert.equal(guest.boxes[0], "you");
  assert.equal(guest.boxes[1], null);
});

test("toView gives each seat its own score and turn, and the same last line", () => {
  const engine = setup([...BOX0_READY]);
  draw(engine, 1, { dir: "v", row: 0, col: 1 });
  const host = dots.toView(engine, 0, players) as { yourScore: number; opponentScore: number; yourTurn: boolean; lastLine: unknown; yourName: string; opponentName: string };
  const guest = dots.toView(engine, 1, players) as typeof host;
  assert.equal(host.yourScore, 0);
  assert.equal(host.opponentScore, 1);
  assert.equal(guest.yourScore, 1);
  assert.equal(guest.opponentScore, 0);
  assert.equal(host.yourTurn, false);
  assert.equal(guest.yourTurn, true);
  assert.deepEqual(host.lastLine, { dir: "v", row: 0, col: 1 });
  assert.deepEqual(guest.lastLine, host.lastLine);
  assert.equal(host.yourName, "ann");
  assert.equal(host.opponentName, "bob");
  assert.equal(guest.yourName, "bob");
  assert.equal(guest.opponentName, "ann");
});

test("toView has no result until the game ends, then the result per seat", () => {
  const midGame = dots.toView(setup([...BOX0_READY]), 0, players) as { result: unknown };
  assert.equal(midGame.result, undefined);

  const won = playOut(lastFirst).engine;
  assert.equal((dots.toView(won, 0, players) as { result: unknown }).result, "you");
  assert.equal((dots.toView(won, 1, players) as { result: unknown }).result, "opponent");

  const tied = playOut(firstFirst).engine;
  assert.equal((dots.toView(tied, 0, players) as { result: unknown }).result, "draw");
  assert.equal((dots.toView(tied, 1, players) as { result: unknown }).result, "draw");
});

test("toView keeps the board shape: horizontal lines are SIZE+1 rows of SIZE, vertical SIZE rows of SIZE+1", () => {
  const view = dots.toView(new DotsEngine(), 0, players) as { size: number; h: unknown[][]; v: unknown[][]; boxes: unknown[] };
  assert.equal(view.size, SIZE);
  assert.equal(view.h.length, SIZE + 1);
  assert.ok(view.h.every((row) => row.length === SIZE));
  assert.equal(view.v.length, SIZE);
  assert.ok(view.v.every((row) => row.length === SIZE + 1));
  assert.equal(view.boxes.length, SIZE * SIZE);
});

test("the module is a two-player game with its own id", () => {
  assert.equal(dots.id, "dots");
  assert.deepEqual(dots.players, { min: 2, max: 2 });
});
