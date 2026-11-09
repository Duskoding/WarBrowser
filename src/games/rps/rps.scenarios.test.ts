import { test } from "node:test";
import assert from "node:assert/strict";
import { RpsEngine } from "./RpsEngine.ts";
import { rps } from "./index.ts";
import type { RpsChoice, RpsResult } from "./types.ts";
import type { GameModuleActionResult } from "../GameModule.ts";

const silent = { commentator: { describe: async () => null }, options: {}, players: 2 };
const players = [{ username: "ann" }, { username: "bob" }];

type Resolved = Extract<RpsResult, { resolved: true }>;

const pick = (engine: RpsEngine, seat: number, choice: RpsChoice): RpsResult =>
  engine.apply(seat, { kind: "pick", choice });

// Plays one full round (seat 0 picks first) and returns the resolved result.
function round(engine: RpsEngine, a: RpsChoice, b: RpsChoice): Resolved {
  pick(engine, 0, a);
  const result = pick(engine, 1, b);
  assert.ok(result.ok && result.resolved);
  return result;
}

// ---- Engine: round outcomes -------------------------------------------------

const pairings: [RpsChoice, RpsChoice, 0 | 1 | null][] = [
  ["rock", "rock", null],
  ["rock", "paper", 1],
  ["rock", "scissors", 0],
  ["paper", "rock", 0],
  ["paper", "paper", null],
  ["paper", "scissors", 1],
  ["scissors", "rock", 1],
  ["scissors", "paper", 0],
  ["scissors", "scissors", null],
];

for (const [a, b, winner] of pairings) {
  test(`round ${a} vs ${b} awards ${winner === null ? "a draw" : `seat ${winner}`}`, () => {
    const engine = new RpsEngine();
    const result = round(engine, a, b);
    assert.deepEqual(result.summary, {
      round: 1,
      choices: [a, b],
      winner,
      score0: winner === 0 ? 1 : 0,
      score1: winner === 1 ? 1 : 0,
      gameOver: false,
    });
    assert.equal(result.finished, undefined);
  });
}

test("a draw round leaves both scores unchanged and is shown as a draw to both seats", () => {
  const engine = new RpsEngine();
  round(engine, "rock", "rock");
  assert.equal(engine.getState(0).yourScore, 0);
  assert.equal(engine.getState(1).yourScore, 0);
  assert.equal(engine.getState(0).phase, "roundOver");
  assert.equal((rps.toView(engine, 0, players) as { lastRound: { winner: unknown } }).lastRound.winner, "draw");
  assert.equal((rps.toView(engine, 1, players) as { lastRound: { winner: unknown } }).lastRound.winner, "draw");
});

test("the round winner is reported relative to each seat", () => {
  const engine = new RpsEngine();
  round(engine, "paper", "rock");
  const host = rps.toView(engine, 0, players) as { yourScore: number; opponentScore: number; lastRound: unknown };
  const guest = rps.toView(engine, 1, players) as { yourScore: number; opponentScore: number; lastRound: unknown };
  assert.deepEqual(host.lastRound, { winner: "you", yourChoice: "paper", opponentChoice: "rock" });
  assert.deepEqual(guest.lastRound, { winner: "opponent", yourChoice: "rock", opponentChoice: "paper" });
  assert.equal(host.yourScore, 1);
  assert.equal(host.opponentScore, 0);
  assert.equal(guest.yourScore, 0);
  assert.equal(guest.opponentScore, 1);
});

// ---- Engine: hidden picks ---------------------------------------------------

test("a lone pick is visible only to the seat that made it, whichever seat goes first", () => {
  const engine = new RpsEngine();
  pick(engine, 1, "scissors");
  assert.deepEqual(rps.toView(engine, 0, players), {
    yourChoice: null,
    opponentChoice: null,
    yourScore: 0,
    opponentScore: 0,
    round: 0,
    phase: "picked",
    lastRound: null,
    winner: undefined,
    yourName: "ann",
    opponentName: "bob",
  });
  assert.equal(engine.getState(1).yourChoice, "scissors");
  assert.equal(engine.getState(1).opponentChoice, null);
  assert.equal(engine.getState(1).phase, "picked");
});

test("both picks become visible to both seats once the round resolves", () => {
  const engine = new RpsEngine();
  pick(engine, 1, "scissors");
  pick(engine, 0, "rock");
  assert.equal(engine.getState(0).opponentChoice, "scissors");
  assert.equal(engine.getState(1).opponentChoice, "rock");
  assert.equal(engine.getState(0).yourChoice, "rock");
  assert.equal(engine.getState(1).yourChoice, "scissors");
});

// ---- Engine: round lifecycle -------------------------------------------------

test("the next pick after a resolved round clears the previous reveal and starts a new round", () => {
  const engine = new RpsEngine();
  round(engine, "rock", "paper");
  assert.deepEqual(pick(engine, 1, "rock"), { ok: true, resolved: false });
  const state = engine.getState(0);
  assert.equal(state.phase, "picked");
  assert.equal(state.opponentChoice, null);
  assert.equal(state.yourChoice, null);
  assert.equal(state.lastRound, null);
  assert.equal(state.round, 1);
  assert.equal(state.yourScore, 0);
  assert.equal(state.opponentScore, 1);
});

test("a resolved round is in the roundOver phase until the next pick", () => {
  const engine = new RpsEngine();
  round(engine, "rock", "scissors");
  assert.equal(engine.getState(0).phase, "roundOver");
  assert.equal(engine.getState(1).phase, "roundOver");
  assert.equal(engine.getState(0).winner, null);
});

test("a seat may not pick twice in the same round, and the first pick stands", () => {
  const engine = new RpsEngine();
  pick(engine, 1, "paper");
  assert.deepEqual(pick(engine, 1, "rock"), { ok: false, error: "You already picked this round" });
  assert.equal(engine.getState(1).yourChoice, "paper");
  assert.equal(engine.getState(1).phase, "picked");
});

test("a rejected duplicate pick does not change the round or the scores", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "rock");
  const before = JSON.stringify([engine.getState(0), engine.getState(1)]);
  pick(engine, 0, "paper");
  assert.equal(JSON.stringify([engine.getState(0), engine.getState(1)]), before);
});

// ---- Engine: match length ----------------------------------------------------

test("a 3-0 sweep ends the match on the third win, with finished set only on that action", () => {
  const engine = new RpsEngine();
  const results = [
    round(engine, "rock", "scissors"),
    round(engine, "rock", "scissors"),
    round(engine, "rock", "scissors"),
  ];
  assert.equal(results[0].finished, undefined);
  assert.equal(results[1].finished, undefined);
  assert.deepEqual(results[2].finished, { winner: 0 });
  assert.equal(results[2].summary.gameOver, true);
  assert.equal(results[2].summary.round, 3);
  assert.equal(engine.getState(0).phase, "gameOver");
  assert.equal(engine.getState(0).winner, 0);
});

test("a 2-1 lead is overturned into a 3-2 match win for the other seat", () => {
  const engine = new RpsEngine();
  round(engine, "rock", "scissors"); // seat 0 +1
  round(engine, "scissors", "rock"); // seat 1 +1
  round(engine, "rock", "scissors"); // seat 0 +2
  round(engine, "scissors", "rock"); // seat 1 +2
  const last = round(engine, "scissors", "rock"); // seat 1 +3
  assert.deepEqual(last.finished, { winner: 1 });
  assert.equal(last.summary.round, 5);
  assert.equal(last.summary.score0, 2);
  assert.equal(last.summary.score1, 3);
  assert.equal(engine.getState(1).winner, 1);
});

test("draws do not count toward the match, so it runs past three rounds", () => {
  const engine = new RpsEngine();
  round(engine, "rock", "rock"); // draw
  round(engine, "paper", "rock"); // seat 0 +1
  round(engine, "scissors", "scissors"); // draw
  round(engine, "rock", "scissors"); // seat 0 +2
  const last = round(engine, "paper", "rock"); // seat 0 +3
  assert.equal(last.summary.round, 5);
  assert.equal(last.summary.gameOver, true);
  assert.deepEqual(last.finished, { winner: 0 });
});

test("after the match is over both seats are rejected, even with a valid pick", () => {
  const engine = new RpsEngine();
  for (let i = 0; i < 3; i++) round(engine, "rock", "scissors");
  assert.deepEqual(pick(engine, 0, "rock"), { ok: false, error: "Game is over" });
  assert.deepEqual(pick(engine, 1, "paper"), { ok: false, error: "Game is over" });
  assert.equal(engine.getState(0).round, 3);
});

// ---- Engine: input validation ---------------------------------------------

test("rejects seats outside 0 and 1", () => {
  const engine = new RpsEngine();
  for (const seat of [-1, 2, 1.5]) {
    assert.deepEqual(pick(engine, seat, "rock"), { ok: false, error: "Invalid seat" });
  }
});

test("rejects choices that are not exactly rock, paper, or scissors", () => {
  const engine = new RpsEngine();
  for (const choice of ["Rock", "", "lizard", " rock"]) {
    assert.deepEqual(engine.apply(0, { kind: "pick", choice: choice as RpsChoice }), {
      ok: false,
      error: "Invalid choice",
    });
  }
});

test("an invalid choice does not use up the seat's pick", () => {
  const engine = new RpsEngine();
  assert.equal(engine.apply(0, { kind: "pick", choice: "gun" as RpsChoice }).ok, false);
  assert.deepEqual(pick(engine, 0, "paper"), { ok: true, resolved: false });
  assert.equal(engine.getState(0).yourChoice, "paper");
});

test("rejects unknown action kinds", () => {
  const engine = new RpsEngine();
  assert.deepEqual(engine.apply(0, { kind: "throw", choice: "rock" } as never), {
    ok: false,
    error: "Unknown action",
  });
});

test("a rejected action leaves the state untouched", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "rock");
  const before = JSON.stringify(engine.getState(0));
  engine.apply(2, { kind: "pick", choice: "rock" });
  engine.apply(1, { kind: "pick", choice: "nope" as RpsChoice });
  assert.equal(JSON.stringify(engine.getState(0)), before);
});

// ---- handleAction -----------------------------------------------------------

test("handleAction returns null for payloads that are not a pick", () => {
  const engine = rps.createEngine(silent);
  assert.equal(rps.handleAction(engine, 0, { kind: "throw", choice: "rock" }, silent), null);
  assert.equal(rps.handleAction(engine, 0, {}, silent), null);
});

test("handleAction rejects a missing or wrong-typed choice before reaching the engine", () => {
  const engine = rps.createEngine(silent);
  const expected = { ok: false, error: "Pick rock, paper, or scissors." };
  assert.deepEqual(rps.handleAction(engine, 0, { kind: "pick" }, silent), expected);
  assert.deepEqual(rps.handleAction(engine, 0, { kind: "pick", choice: 1 }, silent), expected);
  assert.deepEqual(rps.handleAction(engine, 0, { kind: "pick", choice: null }, silent), expected);
  assert.deepEqual(rps.handleAction(engine, 0, { kind: "pick", choice: ["rock"] }, silent), expected);
  assert.deepEqual(rps.handleAction(engine, 0, { kind: "pick", choice: "lizard" }, silent), expected);
  assert.equal(engine.getState(0).yourChoice, null);
});

test("handleAction forwards a valid pick and passes engine errors through", () => {
  const engine = rps.createEngine(silent);
  assert.deepEqual(rps.handleAction(engine, 1, { kind: "pick", choice: "rock" }, silent), {
    ok: true,
    resolved: false,
  });
  assert.deepEqual(rps.handleAction(engine, 1, { kind: "pick", choice: "paper" }, silent), {
    ok: false,
    error: "You already picked this round",
  });
});

test("handleAction sets finished only on the action that ends the match", () => {
  const engine = rps.createEngine(silent);
  const outcomes: (GameModuleActionResult | null)[] = [];
  for (let i = 0; i < 3; i++) {
    outcomes.push(rps.handleAction(engine, 0, { kind: "pick", choice: "rock" }, silent));
    outcomes.push(rps.handleAction(engine, 1, { kind: "pick", choice: "scissors" }, silent));
  }
  for (const result of outcomes.slice(0, -1)) {
    assert.equal(result?.ok && result.finished, undefined);
  }
  assert.deepEqual(outcomes[outcomes.length - 1], {
    ok: true,
    resolved: true,
    summary: {
      round: 3,
      choices: ["rock", "scissors"],
      winner: 0,
      score0: 3,
      score1: 0,
      gameOver: true,
    },
    finished: { winner: 0 },
  });
});

test("handleAction never attaches commentary to Rock-Paper-Scissors", () => {
  const engine = rps.createEngine(silent);
  for (let i = 0; i < 3; i++) {
    rps.handleAction(engine, 0, { kind: "pick", choice: "rock" }, silent);
    const result = rps.handleAction(engine, 1, { kind: "pick", choice: "scissors" }, silent);
    assert.equal(result?.ok && result.commentary, undefined);
  }
});

// ---- toView -----------------------------------------------------------------

test("toView shows each seat its own names, scores and choices", () => {
  const engine = rps.createEngine(silent);
  rps.handleAction(engine, 1, { kind: "pick", choice: "rock" }, silent);
  rps.handleAction(engine, 0, { kind: "pick", choice: "paper" }, silent);
  const host = rps.toView(engine, 0, players) as Record<string, unknown>;
  const guest = rps.toView(engine, 1, players) as Record<string, unknown>;
  assert.equal(host.yourName, "ann");
  assert.equal(host.opponentName, "bob");
  assert.equal(guest.yourName, "bob");
  assert.equal(guest.opponentName, "ann");
  assert.equal(host.yourScore, 1);
  assert.equal(host.opponentScore, 0);
  assert.equal(guest.yourScore, 0);
  assert.equal(guest.opponentScore, 1);
  assert.equal(host.yourChoice, "paper");
  assert.equal(host.opponentChoice, "rock");
  assert.equal(guest.yourChoice, "rock");
  assert.equal(guest.opponentChoice, "paper");
  assert.equal(host.phase, "roundOver");
  assert.equal(guest.phase, "roundOver");
});

test("toView exposes no winner until the match ends, then the result per seat", () => {
  const engine = new RpsEngine();
  const midGame = rps.toView(engine, 0, players) as { winner: unknown };
  assert.equal(midGame.winner, undefined);
  for (let i = 0; i < 3; i++) round(engine, "paper", "rock");
  const host = rps.toView(engine, 0, players) as { winner: unknown; phase: unknown };
  const guest = rps.toView(engine, 1, players) as { winner: unknown; phase: unknown };
  assert.equal(host.phase, "gameOver");
  assert.equal(host.winner, "you");
  assert.equal(guest.winner, "opponent");
});

test("toView never reveals an opponent's pick before both are in", () => {
  const engine = new RpsEngine();
  pick(engine, 0, "scissors");
  const guest = rps.toView(engine, 1, players) as Record<string, unknown>;
  assert.equal(guest.opponentChoice, null);
  assert.equal(guest.yourChoice, null);
  assert.equal(guest.lastRound, null);
  assert.equal(JSON.stringify(guest).includes("scissors"), false);
});

test("the module is a two-player game with its own id", () => {
  assert.equal(rps.id, "rps");
  assert.deepEqual(rps.players, { min: 2, max: 2 });
});
