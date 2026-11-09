import { test } from "node:test";
import assert from "node:assert/strict";
import { war } from "./index.ts";
import { WarEngine } from "./WarEngine.ts";
import type { GameModuleContext } from "../GameModule.ts";
import type { Card, Rank, RoundSummary, WarAction, WarResult } from "./types.ts";

const c = (rank: number, suit: Card["suit"] = "S"): Card => ({ rank: rank as Rank, suit });
const identity = <T>(items: T[]): T[] => items.slice();
const flip = (e: WarEngine, seat: number) => e.apply(seat, { kind: "flip" });
const players = [{ username: "ann" }, { username: "bob" }];

// Builds an engine whose piles are exactly the given cards (top of pile first).
function rigged(
  a: Card[],
  b: Card[],
  opts: { maxRounds?: number; shuffle?: <T>(items: T[]) => T[] } = {},
): WarEngine {
  const e = new WarEngine({ shuffle: opts.shuffle ?? identity, maxRounds: opts.maxRounds });
  const priv = e as unknown as { piles: [Card[], Card[]] };
  priv.piles[0] = a.slice();
  priv.piles[1] = b.slice();
  return e;
}

function play(e: WarEngine) {
  flip(e, 0);
  return flip(e, 1);
}

function ctx(
  describe: (prompt: string) => Promise<string | null> = async () => null,
  options: Record<string, unknown> = {},
): GameModuleContext {
  return { commentator: { describe }, options, players: 2 };
}

function resolvedOf(r: WarResult) {
  if (!r.ok || !r.resolved) assert.fail("expected a resolved round");
  return r;
}

const flipPayload = { kind: "flip" };

test("engine rejects unknown action kinds and invalid seats without changing state", () => {
  const e = rigged([c(5)], [c(9)]);
  assert.deepEqual(e.apply(0, { kind: "surrender" } as unknown as WarAction), {
    ok: false,
    error: "Unknown action",
  });
  assert.deepEqual(e.apply(2, { kind: "flip" }), { ok: false, error: "Invalid seat" });
  assert.deepEqual(e.apply(-1, { kind: "flip" }), { ok: false, error: "Invalid seat" });
  assert.equal(e.getState(0).phase, "waiting");
  assert.equal(e.getState(0).yourCount, 1);
  assert.equal(e.getState(0).opponentCount, 1);
});

test("flipping with an empty pile reports no cards left", () => {
  const e = rigged([], [c(5)]);
  assert.deepEqual(flip(e, 0), { ok: false, error: "No cards left to flip" });
  assert.equal(e.getState(0).phase, "waiting");
  assert.equal(e.getState(0).yourCard, null);
});

test("a seat cannot flip twice in the same deciding flip of a war", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(12), c(5)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(8, "H"), c(6)],
  );
  play(e);
  assert.equal(e.getState(0).phase, "war");
  assert.deepEqual(flip(e, 0), { ok: true, resolved: false });
  assert.deepEqual(flip(e, 0), { ok: false, error: "You already flipped this round" });
  assert.equal(e.getState(0).yourCard?.rank, 12);
});

test("every flip is rejected once the game is over and the result is kept", () => {
  const e = rigged([c(9)], [c(3)]);
  play(e);
  assert.equal(e.getState(0).winner, 0);
  assert.deepEqual(flip(e, 0), { ok: false, error: "Game is over" });
  assert.deepEqual(flip(e, 1), { ok: false, error: "Game is over" });
  assert.equal(e.getState(0).winner, 0);
  assert.equal(e.getState(0).phase, "gameOver");
});

test("player 2 wins a plain round and the summary reports the new scores", () => {
  const e = rigged([c(3), c(5)], [c(8), c(2)]);
  const { summary, finished } = resolvedOf(play(e));
  assert.equal(summary.winner, 1);
  assert.equal(summary.wasWar, false);
  assert.equal(summary.score0, 1);
  assert.equal(summary.score1, 3);
  assert.equal(summary.gameOver, false);
  assert.equal(finished, undefined);
  assert.deepEqual(e.getState(1).lastRound, { wasWar: false, winner: 1, cardsWon: 2 });
  assert.equal(e.getState(1).yourCount, 3);
});

test("a war won by player 2 credits the whole pot to player 2", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(5), c(6)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9)],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.equal(e.getState(0).yourCount, 2);
  assert.equal(e.getState(0).pile, 8);
  const { summary } = resolvedOf(play(e));
  assert.equal(summary.winner, 1);
  assert.equal(summary.wasWar, true);
  assert.equal(summary.score0, 1);
  assert.equal(summary.score1, 10);
  assert.deepEqual(e.getState(1).lastRound, { wasWar: true, winner: 1, cardsWon: 10 });
  assert.equal(e.getState(1).yourCount, 10);
  assert.equal(e.getState(1).opponentCount, 1);
});

test("running out of cards mid-war: the burn leaves one card, which decides the war", () => {
  // Player 1 burns two cards and keeps a 4; player 2 burns one and keeps a 5.
  const e = rigged([c(7), c(2), c(3), c(4)], [c(7, "H"), c(9), c(5)]);
  assert.deepEqual(play(e), { ok: true, resolved: false });
  assert.equal(e.getState(0).yourCount, 1);
  assert.equal(e.getState(0).opponentCount, 1);
  assert.equal(e.getState(0).pile, 5);
  assert.equal(e.getState(0).yourStakes.filter((s) => !s.faceUp).length, 2);
  const r = resolvedOf(play(e));
  assert.equal(r.summary.winner, 1);
  assert.equal(r.summary.gameOver, true);
  assert.deepEqual(r.finished, { winner: 1 });
  assert.equal(e.getState(0).phase, "gameOver");
  assert.equal(e.getState(0).yourCount, 0);
  assert.equal(e.getState(0).winner, 1);
});

test("chained war where one player runs out: the player with cards left wins", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(9)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9, "H"), c(5)],
  );
  assert.deepEqual(play(e), { ok: true, resolved: false });
  const r = resolvedOf(play(e));
  assert.equal(r.summary.winner, 1);
  assert.equal(r.summary.wasWar, true);
  assert.equal(r.summary.gameOver, true);
  assert.deepEqual(r.finished, { winner: 1 });
  assert.equal(e.getState(1).yourCount, 11);
  assert.equal(e.getState(1).opponentCount, 0);
});

test("chained war where both players run out is a draw with no cards awarded", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(9)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9, "H")],
  );
  play(e);
  const r = resolvedOf(play(e));
  assert.equal(r.summary.winner, null);
  assert.equal(r.summary.gameOver, true);
  assert.deepEqual(r.finished, { winner: null });
  assert.deepEqual(e.getState(0).lastRound, { wasWar: true, winner: null, cardsWon: 0 });
  assert.equal(e.getState(0).winner, null);
  assert.equal(e.getState(0).phase, "gameOver");
});

test("a tie on a player's last card ends the game for that player", () => {
  const e = rigged([c(7)], [c(7, "H"), c(3), c(4)]);
  // Player 1 has no card left to burn into a war, so player 2 takes the match.
  const r = resolvedOf(play(e));
  assert.equal(r.summary.winner, 1);
  assert.equal(r.summary.gameOver, true);
  assert.deepEqual(r.finished, { winner: 1 });
  assert.equal(e.getState(0).yourCount, 0);
  assert.equal(e.getState(0).opponentCount, 4);
});

test("the shuffle option is used to order the pot the winner receives", () => {
  const seen: number[] = [];
  const e = rigged([c(9), c(2)], [c(3), c(5)], {
    shuffle: <T>(items: T[]) => {
      seen.push(items.length);
      return items.slice();
    },
  });
  // The constructor shuffles the deck once; only the round's pot matters here.
  seen.length = 0;
  play(e);
  assert.deepEqual(seen, [2]);
});

test("maxRounds reached with equal card counts is a draw", () => {
  const e = rigged([c(9), c(2)], [c(3), c(2, "H"), c(2, "D"), c(2, "C")], { maxRounds: 1 });
  const r = resolvedOf(play(e));
  assert.equal(r.summary.gameOver, true);
  assert.equal(r.summary.score0, 3);
  assert.equal(r.summary.score1, 3);
  assert.deepEqual(r.finished, { winner: null });
  assert.equal(e.getState(0).winner, null);
});

test("maxRounds not yet reached keeps the game going", () => {
  const e = rigged([c(9), c(2), c(2)], [c(3), c(4)], { maxRounds: 3 });
  const r = resolvedOf(play(e));
  assert.equal(r.summary.gameOver, false);
  assert.equal(r.finished, undefined);
  assert.equal(e.getState(0).phase, "roundOver");
});

test("maxRounds from module options caps the game", () => {
  // createEngine hands module options straight to WarEngine.
  const engine = war.createEngine(ctx(undefined, { maxRounds: 1, shuffle: identity })) as WarEngine;
  let guard = 0;
  while (engine.getState(0).phase !== "gameOver" && guard++ < 1000) {
    flip(engine, 0);
    flip(engine, 1);
  }
  assert.equal(engine.getState(0).phase, "gameOver");
  assert.equal(engine.getState(0).round, 1);
});

test("module handleAction returns null for payloads that are not flips", () => {
  const e = rigged([c(5)], [c(9)]);
  const payloads: Record<string, unknown>[] = [
    {},
    { kind: "move" },
    { kind: "FLIP" },
    { kind: 1 },
    { kind: null },
  ];
  for (const payload of payloads) {
    assert.equal(war.handleAction(e, 0, payload, ctx()), null);
  }
  assert.equal(e.getState(0).phase, "waiting");
});

test("a flip that does not resolve returns ok with no finished or commentary", async () => {
  const prompts: string[] = [];
  const e = rigged([c(7), c(2), c(3), c(4), c(12), c(5)], [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(8, "H"), c(6)]);
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  const first = war.handleAction(e, 0, flipPayload, context);
  assert.deepEqual(first, { ok: true });
  const tie = war.handleAction(e, 1, flipPayload, context);
  assert.deepEqual(tie, { ok: true });
  assert.deepEqual(prompts, []);
});

test("handleAction surfaces engine errors and leaves the game untouched", () => {
  const e = rigged([c(5), c(2)], [c(9)]);
  assert.deepEqual(war.handleAction(e, 0, flipPayload, ctx()), { ok: true });
  assert.deepEqual(war.handleAction(e, 0, flipPayload, ctx()), {
    ok: false,
    error: "You already flipped this round",
  });
  assert.equal(e.getState(0).yourCount, 1);
});

test("a resolved round sends one commentary prompt describing both cards and the score", async () => {
  const prompts: string[] = [];
  const e = rigged([c(9, "S"), c(2)], [c(3, "D"), c(5)]);
  const context = ctx(async (p) => {
    prompts.push(p);
    return `said: ${p.length}`;
  });
  war.handleAction(e, 0, flipPayload, context);
  const result = war.handleAction(e, 1, flipPayload, context);
  assert.ok(result?.ok);
  if (!result?.ok || !result.commentary) assert.fail("expected commentary");
  assert.equal(result.finished, undefined);
  assert.equal(result.commentary.round, 1);
  assert.equal(prompts.length, 1);
  const text = await result.commentary.text;
  assert.equal(text, `said: ${prompts[0]!.length}`);
  const prompt = prompts[0]!;
  assert.match(prompt, /Round 1\. Player 1 played the 9 of Spades; Player 2 played the 3 of Diamonds\./);
  assert.match(prompt, /Player 1 won\./);
  assert.match(prompt, /Cards remaining: Player 1 3, Player 2 1\./);
  assert.doesNotMatch(prompt, /after a war|ended the game/);
});

test("the commentary for a won war says after a war", async () => {
  const prompts: string[] = [];
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(5), c(6)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9)],
  );
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  war.handleAction(e, 0, flipPayload, context);
  war.handleAction(e, 1, flipPayload, context);
  assert.equal(prompts.length, 0);
  war.handleAction(e, 0, flipPayload, context);
  const result = war.handleAction(e, 1, flipPayload, context);
  assert.ok(result?.ok && result.commentary);
  assert.match(prompts[0]!, /Player 2 won after a war\./);
});

test("the action that ends the game carries finished and commentary", async () => {
  const prompts: string[] = [];
  const e = rigged([c(7), c(2), c(3), c(4)], [c(7, "H"), c(9), c(5)]);
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  war.handleAction(e, 0, flipPayload, context);
  const tie = war.handleAction(e, 1, flipPayload, context);
  assert.deepEqual(tie, { ok: true });
  war.handleAction(e, 0, flipPayload, context);
  const last = war.handleAction(e, 1, flipPayload, context);
  assert.ok(last?.ok);
  if (!last?.ok) return;
  assert.deepEqual(last.finished, { winner: 1 });
  assert.equal(last.commentary?.round, 1);
  assert.match(prompts[0]!, /after a war/);
  assert.match(prompts[0]!, /This round ended the game\./);
});

test("a draw that ends the game sends finished with a null winner and a draw prompt", () => {
  const prompts: string[] = [];
  const e = rigged([c(7), c(2), c(3), c(4), c(9)], [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(9, "H")]);
  const context = ctx(async (p) => {
    prompts.push(p);
    return p;
  });
  war.handleAction(e, 0, flipPayload, context);
  war.handleAction(e, 1, flipPayload, context);
  war.handleAction(e, 0, flipPayload, context);
  const last = war.handleAction(e, 1, flipPayload, context);
  assert.ok(last?.ok);
  if (!last?.ok) return;
  assert.deepEqual(last.finished, { winner: null });
  assert.match(prompts[0]!, /The round ended in a draw\./);
  assert.match(prompts[0]!, /This round ended the game\./);
});

test("finished is set only on the action that ends the game", () => {
  // Round 1: player 1 wins 9 vs 3. Round 2 reaches maxRounds and player 1 holds more cards.
  const e = rigged([c(9), c(2), c(4), c(4)], [c(3), c(5), c(5)], { maxRounds: 2 });
  const first = war.handleAction(e, 0, flipPayload, ctx());
  assert.deepEqual(first, { ok: true });
  const round1 = war.handleAction(e, 1, flipPayload, ctx());
  assert.ok(round1?.ok);
  if (!round1?.ok) return;
  assert.equal(round1.finished, undefined);
  war.handleAction(e, 0, flipPayload, ctx());
  const round2 = war.handleAction(e, 1, flipPayload, ctx());
  assert.ok(round2?.ok);
  if (!round2?.ok) return;
  assert.deepEqual(round2.finished, { winner: 0 });
});

test("toView gives each seat its own card and the opponent's card once it is flipped", () => {
  const e = rigged([c(5, "S"), c(2)], [c(9, "D"), c(3)]);
  flip(e, 0);
  const seat0Before = war.toView(e, 0, players) as Record<string, unknown>;
  assert.deepEqual(seat0Before.yourCard, { rank: 5, suit: "♠" });
  assert.equal(seat0Before.opponentCard, null);
  flip(e, 1);
  const seat0 = war.toView(e, 0, players) as Record<string, unknown>;
  const seat1 = war.toView(e, 1, players) as Record<string, unknown>;
  assert.deepEqual(seat0.yourCard, { rank: 5, suit: "♠" });
  assert.deepEqual(seat0.opponentCard, { rank: 9, suit: "♦" });
  assert.deepEqual(seat1.yourCard, { rank: 9, suit: "♦" });
  assert.deepEqual(seat1.opponentCard, { rank: 5, suit: "♠" });
});

test("toView exposes the same keys to both seats and no opponent deck or pile contents", () => {
  const e = rigged([c(5), c(2)], [c(9), c(3)]);
  const keys = [
    "yourCard",
    "opponentCard",
    "pile",
    "yourCount",
    "opponentCount",
    "phase",
    "inWar",
    "warCards",
    "yourStakes",
    "opponentStakes",
    "lastRound",
    "winner",
    "yourName",
    "opponentName",
  ].sort();
  for (const seat of [0, 1]) {
    const view = war.toView(e, seat, players) as Record<string, unknown>;
    assert.deepEqual(Object.keys(view).sort(), keys);
  }
});

test("toView keeps face-down burns hidden from the other seat during a war", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(12), c(5)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(8, "H"), c(6)],
  );
  play(e);
  const seat0 = war.toView(e, 0, players) as Record<string, unknown>;
  const seat1 = war.toView(e, 1, players) as Record<string, unknown>;
  const burns = [{ faceUp: false }, { faceUp: false }, { faceUp: false }];
  assert.deepEqual(seat0.yourStakes, [{ faceUp: true, card: { rank: 7, suit: "♠" } }, ...burns]);
  assert.deepEqual(seat0.opponentStakes, [{ faceUp: true, card: { rank: 7, suit: "♥" } }, ...burns]);
  assert.deepEqual(seat1.yourStakes, [{ faceUp: true, card: { rank: 7, suit: "♥" } }, ...burns]);
  assert.deepEqual(seat1.opponentStakes, [{ faceUp: true, card: { rank: 7, suit: "♠" } }, ...burns]);
  assert.equal(seat0.inWar, true);
  assert.equal(seat0.phase, "war");
});

test("toView shows tied war pairs from each seat's perspective", () => {
  const e = rigged(
    [c(7), c(2), c(3), c(4), c(12), c(5)],
    [c(7, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(8, "H"), c(6)],
  );
  play(e);
  const seat0 = war.toView(e, 0, players) as { warCards: Array<Record<string, unknown>> };
  const seat1 = war.toView(e, 1, players) as { warCards: Array<Record<string, unknown>> };
  assert.deepEqual(seat0.warCards, [
    { yours: { rank: 7, suit: "♠" }, opponent: { rank: 7, suit: "♥" } },
  ]);
  assert.deepEqual(seat1.warCards, [
    { yours: { rank: 7, suit: "♥" }, opponent: { rank: 7, suit: "♠" } },
  ]);
});

test("toView maps every suit to its symbol", () => {
  const e = rigged([c(2, "H")], [c(3, "C")]);
  flip(e, 0);
  flip(e, 1);
  const seat0 = war.toView(e, 0, players) as Record<string, unknown>;
  assert.deepEqual(seat0.yourCard, { rank: 2, suit: "♥" });
  assert.deepEqual(seat0.opponentCard, { rank: 3, suit: "♣" });
  const flipped = rigged([c(4, "D")], [c(5, "C")]);
  flip(flipped, 0);
  assert.deepEqual((war.toView(flipped, 0, players) as Record<string, unknown>).yourCard, {
    rank: 4,
    suit: "♦",
  });
});

test("toView reports the last round relative to each seat", () => {
  const e = rigged([c(9), c(2)], [c(3), c(5)]);
  assert.equal((war.toView(e, 0, players) as Record<string, unknown>).lastRound, null);
  play(e);
  const seat0 = war.toView(e, 0, players) as Record<string, unknown>;
  const seat1 = war.toView(e, 1, players) as Record<string, unknown>;
  assert.deepEqual(seat0.lastRound, { wasWar: false, winner: "you", cardsWon: 2 });
  assert.deepEqual(seat1.lastRound, { wasWar: false, winner: "opponent", cardsWon: 2 });
});

test("toView reports the match winner per seat once the game is over", () => {
  const e = rigged([c(9)], [c(3)]);
  play(e);
  const seat0 = war.toView(e, 0, players) as Record<string, unknown>;
  const seat1 = war.toView(e, 1, players) as Record<string, unknown>;
  assert.equal(seat0.winner, "you");
  assert.equal(seat1.winner, "opponent");
  assert.equal(seat0.yourName, "ann");
  assert.equal(seat0.opponentName, "bob");
  assert.equal(seat1.yourName, "bob");
  assert.equal(seat1.opponentName, "ann");
  assert.equal(seat0.phase, "gameOver");
});

test("toView omits the match winner on a draw while the round still shows", () => {
  const e = rigged([c(7)], [c(7, "H")]);
  play(e);
  for (const seat of [0, 1]) {
    const view = war.toView(e, seat, players) as Record<string, unknown>;
    assert.equal(view.winner, undefined);
    assert.equal((view.lastRound as { winner: unknown }).winner, null);
    assert.equal(view.phase, "gameOver");
  }
});

test("toView does not report a winner while the game is still running", () => {
  const e = rigged([c(9), c(2)], [c(3), c(5)]);
  play(e);
  const view = war.toView(e, 0, players) as Record<string, unknown>;
  assert.equal(view.winner, undefined);
  assert.equal(view.phase, "roundOver");
});

test("the view's board-like arrays are copies and cannot change engine state", () => {
  const e = rigged([c(9), c(2)], [c(3), c(5)]);
  play(e);
  const view = war.toView(e, 0, players) as { warCards: unknown[]; yourStakes: unknown[] };
  view.warCards.push("junk");
  view.yourStakes.push("junk");
  assert.deepEqual(e.getState(0).warCards, []);
  assert.equal(e.getState(0).yourStakes.length, 0);
});
