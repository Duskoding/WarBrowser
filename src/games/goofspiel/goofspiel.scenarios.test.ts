import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameModuleActionResult } from "../GameModule.ts";
import { GoofspielEngine, goofspiel } from "./index.ts";

const inOrder = <T>(items: T[]) => items.slice(); // prizes come up 1, 2, … 13
const silent = { commentator: { describe: async () => null }, options: { shuffle: inOrder }, players: 2 };
const capture = { commentator: { describe: async (prompt: string) => prompt }, options: { shuffle: inOrder }, players: 2 };
const players = [{ username: "a" }, { username: "b" }];
type Ok = Extract<GameModuleActionResult, { ok: true }>;

function expectOk(r: GameModuleActionResult | null): Ok {
  assert.ok(r && r.ok, r && !r.ok ? r.error : "expected a result");
  return r as Ok;
}

function expectError(r: GameModuleActionResult | null): string {
  assert.ok(r && !r.ok, "expected an error");
  return r.error;
}

// Plays one round in which seat 0 bids `a` and seat 1 bids `b`; returns the resolved round (if any).
function round(game: GoofspielEngine, a: number, b: number) {
  assert.ok(game.apply(0, { kind: "bid", value: a }).ok);
  const result = game.apply(1, { kind: "bid", value: b });
  assert.ok(result.ok);
  return result;
}

test("apply rejects unknown action kinds", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  assert.deepEqual(game.apply(0, { kind: "ask" } as unknown as { kind: "bid"; value: number }), {
    ok: false,
    error: "Unknown action",
  });
});

test("apply rejects a second bid in the same round and keeps the first", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  assert.ok(game.apply(0, { kind: "bid", value: 5 }).ok);
  assert.deepEqual(game.apply(0, { kind: "bid", value: 6 }), { ok: false, error: "You already bid this round." });
  assert.deepEqual(game.apply(0, { kind: "bid", value: 5 }), { ok: false, error: "You already bid this round." });
  assert.equal(game.getState(0).yourBid, 5);
  assert.ok(game.getState(0).yourHand.includes(6), "the rejected card is still in hand");
});

test("apply rejects bids for cards not in hand: used, out of range or fractional", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  round(game, 5, 3);
  for (const value of [5, 0, 14, -1, 1.5]) {
    assert.deepEqual(game.apply(0, { kind: "bid", value }), { ok: false, error: "Bid a card from your hand." });
  }
  assert.equal(game.getState(0).yourBid, null, "rejected bids do not register");
});

test("after the thirteenth round every action is rejected as game over", () => {
  const game = new GoofspielEngine({ shuffle: inOrder });
  for (let v = 1; v <= 13; v++) round(game, v, 14 - v);
  assert.equal(game.getState(0).over, true);
  assert.deepEqual(game.apply(0, { kind: "bid", value: 1 }), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(1, { kind: "bid", value: 1 }), { ok: false, error: "The game is over." });
});

test("handleAction rejects a missing, non-integer or unknown value", () => {
  const engine = goofspiel.createEngine(silent);
  for (const value of [undefined, null, "5", 1.5, NaN, Infinity, 0, 14]) {
    assert.equal(
      expectError(goofspiel.handleAction(engine, 0, { kind: "bid", value }, silent)),
      "Bid a card from your hand.",
    );
  }
  assert.equal(engine.getState(0).yourBid, null, "invalid payloads change nothing");
});

test("handleAction passes engine errors through", () => {
  const engine = goofspiel.createEngine(silent);
  assert.ok(goofspiel.handleAction(engine, 0, { kind: "bid", value: 5 }, silent)?.ok);
  assert.equal(
    expectError(goofspiel.handleAction(engine, 0, { kind: "bid", value: 6 }, silent)),
    "You already bid this round.",
  );
});

test("handleAction returns null for payloads that are not bids", () => {
  const engine = goofspiel.createEngine(silent);
  assert.equal(goofspiel.handleAction(engine, 0, { kind: "ask", rank: 5 }, silent), null);
  assert.equal(goofspiel.handleAction(engine, 0, {}, silent), null);
  assert.equal(engine.getState(0).yourBid, null);
});

test("a bid is removed from hand as soon as it is placed, and the bid stays hidden until both are in", () => {
  const engine = goofspiel.createEngine(silent);
  const first = expectOk(goofspiel.handleAction(engine, 0, { kind: "bid", value: 13 }, silent));
  assert.equal(first.finished, undefined);
  assert.equal("commentary" in first, false, "a bid that does not resolve a round has no commentary");

  const mine = engine.getState(0);
  assert.equal(mine.yourBid, 13);
  assert.equal(mine.opponentBid, false);
  assert.equal(mine.yourHand.includes(13), false);
  assert.equal(mine.lastRound, null);
  assert.equal(mine.prize, 1, "the prize has not moved");
  assert.equal(mine.round, 1);

  const theirs = engine.getState(1);
  assert.equal(theirs.yourBid, null);
  assert.equal(theirs.opponentBid, true);
  assert.equal(theirs.lastRound, null);
  assert.equal(theirs.yourHand.length, 13, "seat 1 has not bid, so nothing is out of hand");
});

test("the reveal gives each seat its own and the other bid, and the winner from its side", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  round(engine, 5, 3);
  const host = engine.getState(0);
  const guest = engine.getState(1);
  assert.deepEqual(host.lastRound, { round: 1, bids: [5, 3], prizes: [1], winner: 0 });
  assert.deepEqual(guest.lastRound, { round: 1, bids: [5, 3], prizes: [1], winner: 0 });
  assert.equal(host.yourBid, null);
  assert.equal(host.opponentBid, false);
  assert.equal(host.yourScore, 1);
  assert.equal(guest.yourScore, 0);
  assert.equal(host.prize, 2);
  assert.equal(host.prizesLeft, 11);

  const hostView = goofspiel.toView(engine, 0, players) as { lastRound: Record<string, unknown> };
  const guestView = goofspiel.toView(engine, 1, players) as { lastRound: Record<string, unknown> };
  assert.deepEqual(hostView.lastRound, { round: 1, yours: 5, theirs: 3, prizes: [1], winner: "you" });
  assert.deepEqual(guestView.lastRound, { round: 1, yours: 3, theirs: 5, prizes: [1], winner: "opponent" });
});

test("a higher bid by seat 1 scores for seat 1 and moves to the next prize", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  round(engine, 2, 9);
  assert.equal(engine.getState(0).yourScore, 0);
  assert.equal(engine.getState(1).yourScore, 1);
  assert.deepEqual(engine.getState(1).carried, []);
  assert.equal(engine.getState(1).lastRound?.winner, 1);
});

test("a tied round leaves its prize on the table and the next winner collects all of it", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  const tie1 = round(engine, 7, 7);
  assert.ok(tie1.ok && tie1.resolved?.winner === null);
  assert.deepEqual(engine.getState(0).carried, [1]);
  assert.equal(engine.getState(0).yourScore, 0);
  assert.equal(engine.getState(1).lastRound?.winner, null);

  const tie2 = round(engine, 3, 3);
  assert.ok(tie2.ok && tie2.resolved?.prizes.join() === "1,2");
  assert.deepEqual(engine.getState(0).carried, [1, 2]);

  const win = round(engine, 5, 4);
  assert.ok(win.ok && win.resolved);
  assert.deepEqual(win.resolved.prizes, [1, 2, 3]);
  assert.equal(win.resolved.winner, 0);
  assert.equal(engine.getState(0).yourScore, 6);
  assert.equal(engine.getState(1).yourScore, 0);
  assert.deepEqual(engine.getState(0).carried, []);
});

test("a tied round is a draw in both views, and its commentary says the bids tied", async () => {
  const engine = goofspiel.createEngine(capture);
  goofspiel.handleAction(engine, 0, { kind: "bid", value: 7 }, capture);
  const result = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 7 }, capture));
  assert.ok(result.commentary);
  assert.equal(result.commentary.round, 1);
  const text = (await result.commentary.text) ?? "";
  assert.match(text, /round 1 of 13: the prize was the Ace\. Player 1 bid 7, Player 2 bid 7\./);
  assert.match(text, /The bids tied/);

  const host = goofspiel.toView(engine, 0, players) as { lastRound: { winner: string } };
  const guest = goofspiel.toView(engine, 1, players) as { lastRound: { winner: string } };
  assert.equal(host.lastRound.winner, "draw");
  assert.equal(guest.lastRound.winner, "draw");
});

test("after thirteen rounds the higher total wins and the win is reported to both seats", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  let last: GameModuleActionResult | undefined;
  // Seat 0 bids high on 8..13 and seat 1 bids high on 1..6; round 7 ties and its prize is carried.
  for (let v = 1; v <= 13; v++) last = round(engine, v, 14 - v);
  assert.ok(last?.ok && last.finished);
  assert.deepEqual(last.finished, { winner: 0 });
  assert.equal(engine.getState(0).yourScore, 70);
  assert.equal(engine.getState(0).opponentScore, 21);
  assert.equal(engine.getState(0).winner, 0);
  assert.equal(engine.getState(0).prize, null);
  assert.equal(engine.getState(0).prizesLeft, 0);
  assert.equal(engine.getState(0).round, 13);
  assert.equal((goofspiel.toView(engine, 0, players) as { result?: string }).result, "you");
  assert.equal((goofspiel.toView(engine, 1, players) as { result?: string }).result, "opponent");
});

test("a fully tied game ends in a draw and nobody collects the prizes", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  let last: GameModuleActionResult | undefined;
  for (let v = 1; v <= 13; v++) last = round(engine, v, v);
  assert.deepEqual(last?.ok && last.finished, { winner: null });
  assert.equal(engine.getState(0).yourScore, 0);
  assert.equal(engine.getState(1).yourScore, 0);
  assert.deepEqual(engine.getState(0).carried, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(engine.getState(0).over, true);
  assert.equal((goofspiel.toView(engine, 0, players) as { result?: string }).result, "draw");
  assert.equal((goofspiel.toView(engine, 1, players) as { result?: string }).result, "draw");
});

test("prizes tied on the thirteenth round go to no one, so the scores decide", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  const seat0 = [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const seat1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  let last: ReturnType<typeof round> | undefined;
  for (let i = 0; i < 13; i++) last = round(engine, seat0[i], seat1[i]);
  assert.ok(last?.ok && last.resolved);
  assert.deepEqual(last.resolved.prizes, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(last.resolved.winner, null);
  assert.deepEqual(last.finished, { winner: 1 });
  assert.equal(engine.getState(0).yourScore, 1);
  assert.equal(engine.getState(1).yourScore, 2);
  assert.equal((goofspiel.toView(engine, 1, players) as { result?: string }).result, "you");
});

test("handleAction marks finished only on the thirteenth resolution and gives commentary per round", async () => {
  const engine = goofspiel.createEngine(capture);
  const rounds: number[] = [];
  let finishedAt = -1;
  for (let v = 1; v <= 13; v++) {
    goofspiel.handleAction(engine, 0, { kind: "bid", value: v }, capture);
    const result = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 14 - v }, capture));
    assert.ok(result.commentary, `round ${v} resolves with commentary`);
    rounds.push(result.commentary.round);
    if (result.finished) finishedAt = v;
    else assert.equal(result.finished, undefined);
  }
  assert.deepEqual(rounds, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(finishedAt, 13);
});

test("the final commentary names the winner and the score", async () => {
  const engine = goofspiel.createEngine(capture);
  let last: Ok | undefined;
  for (let v = 1; v <= 13; v++) {
    goofspiel.handleAction(engine, 0, { kind: "bid", value: v }, capture);
    last = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 14 - v }, capture));
  }
  const text = (await last?.commentary?.text) ?? "";
  assert.match(text, /round 13 of 13/);
  assert.match(text, /Score 70-21\./);
  assert.match(text, /Player 1 wins the game\./);
});

test("commentary names the prize and bids in words, and joins carried prizes", async () => {
  const engine = goofspiel.createEngine(capture);
  goofspiel.handleAction(engine, 0, { kind: "bid", value: 13 }, capture);
  const first = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 11 }, capture));
  const firstText = (await first.commentary?.text) ?? "";
  assert.match(firstText, /the prize was the Ace\. Player 1 bid King, Player 2 bid Jack\./);
  assert.match(firstText, /Player 1 takes the Ace\. Score 1-0\./);

  goofspiel.handleAction(engine, 0, { kind: "bid", value: 12 }, capture);
  const tied = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 12 }, capture));
  assert.ok(tied.commentary);
  assert.match((await tied.commentary.text) ?? "", /the prize was the 2\. Player 1 bid Queen/);

  goofspiel.handleAction(engine, 0, { kind: "bid", value: 3 }, capture);
  const won = expectOk(goofspiel.handleAction(engine, 1, { kind: "bid", value: 2 }, capture));
  assert.ok(won.commentary);
  assert.match((await won.commentary.text) ?? "", /Player 1 takes the 2 \+ 3\./);
});

test("each seat sees its own suit, hand and score, and never the other hand", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  round(engine, 13, 1);
  const host = goofspiel.toView(engine, 0, players) as Record<string, unknown>;
  const guest = goofspiel.toView(engine, 1, players) as Record<string, unknown>;

  assert.equal(host.yourSuit, "S");
  assert.equal(guest.yourSuit, "H");
  assert.equal((host.yourHand as number[]).includes(13), false);
  assert.equal((guest.yourHand as number[]).includes(1), false, "seat 1's bid of Ace is no longer in hand");
  assert.equal((guest.yourHand as number[]).length, 12);
  assert.equal(host.opponentBid, false);
  assert.equal(host.yourScore, 1);
  assert.equal(guest.yourScore, 0);
  assert.equal(host.opponentScore, 0);
  assert.equal(guest.opponentScore, 1);
  assert.deepEqual(Object.keys(host).sort(), [
    "carried",
    "lastRound",
    "opponentBid",
    "opponentName",
    "opponentScore",
    "prize",
    "prizesLeft",
    "result",
    "round",
    "yourBid",
    "yourHand",
    "yourName",
    "yourScore",
    "yourSuit",
  ]);
});

test("the view before the game ends has no result and then reports it per seat", () => {
  const engine = new GoofspielEngine({ shuffle: inOrder });
  assert.equal((goofspiel.toView(engine, 0, players) as { result?: string }).result, undefined);
  assert.equal((goofspiel.toView(engine, 0, players) as { lastRound: unknown }).lastRound, null);
  assert.equal((goofspiel.toView(engine, 0, players) as { yourName: string }).yourName, "a");
  assert.equal((goofspiel.toView(engine, 1, players) as { opponentName: string }).opponentName, "a");
});
