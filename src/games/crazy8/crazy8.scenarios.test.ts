import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card, Suit } from "../shared/cards.ts";
import { CrazyEightsEngine, type CrazyEightsAction } from "./CrazyEightsEngine.ts";
import { buildCrazyEightsPrompt, crazy8 } from "./index.ts";

const players = [{ username: "a" }, { username: "b" }];
const silent = { commentator: { describe: async () => null }, options: {}, players: 2 };
const echo = { commentator: { describe: async (prompt: string) => prompt }, options: {}, players: 2 };
const identity = <T>(items: T[]): T[] => items.slice();
const c = (rank: number, suit: Suit) => ({ rank, suit }) as Card;

interface Rig {
  turn?: 0 | 1;
  // Draw pile, top card last is not needed: the stock is drawn from the front.
  stock?: Card[];
  // Full discard pile, top card last. Defaults to just the top card.
  discard?: Card[];
  suit?: Suit;
}

// Builds an engine with exact hands, discard, stock and turn; hand sizes may differ.
function rigged(hand0: Card[], hand1: Card[], top: Card, rig: Rig = {}): CrazyEightsEngine {
  const e = new CrazyEightsEngine({ shuffle: identity });
  const priv = e as unknown as {
    hands: [Card[], Card[]];
    stock: Card[];
    discard: Card[];
    suit: Suit;
    turn: number;
  };
  priv.hands = [hand0.slice(), hand1.slice()];
  priv.discard = rig.discard ? rig.discard.slice() : [top];
  priv.stock = rig.stock ? rig.stock.slice() : Array.from({ length: 10 }, () => c(13, "C"));
  priv.suit = rig.suit ?? top.suit;
  priv.turn = rig.turn ?? 0;
  return e;
}

// Neither card matches 3S (no 3s, no spades) and there are no 8s.
const stuck0 = [c(2, "H"), c(4, "H")];
const stuck1 = [c(2, "D"), c(4, "D")];

// ---------- turns and rejections ----------

test("only the player on turn may act", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  assert.deepEqual(game.apply(1, { kind: "draw" }), { ok: false, error: "It's not your turn." });
  assert.deepEqual(game.apply(5, { kind: "draw" }), { ok: false, error: "It's not your turn." });
  assert.equal(game.getState(0).canDraw, true);
  assert.equal(game.getState(1).canDraw, false);
});

test("a card that is not in your hand is rejected", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(9, "S") }), {
    ok: false,
    error: "That card isn't in your hand.",
  });
});

test("a card matching neither suit nor rank is rejected and nothing changes", () => {
  const game = rigged([c(9, "H"), c(2, "D")], stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(9, "H") }), {
    ok: false,
    error: "Match the suit or rank, or play an 8.",
  });
  assert.equal(game.getState(0).yourHand.length, 2);
  assert.equal(game.getState(0).yourTurn, true);
});

test("an 8 needs a suit named with it, and the turn does not move", () => {
  const game = rigged([c(8, "C"), c(2, "D")], stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(8, "C") }), { ok: false, error: "Name a suit for your 8." });
  assert.equal(game.getState(0).yourTurn, true);
});

test("an unknown action is rejected", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  const bogus = { kind: "trade" } as unknown as CrazyEightsAction;
  assert.deepEqual(game.apply(0, bogus), { ok: false, error: "Unknown action" });
  assert.equal(game.getState(0).yourTurn, true);
});

test("nothing can be done after the game is over", () => {
  const game = rigged([c(4, "S")], stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(4, "S") }), { ok: true, finished: { winner: 0 } });
  assert.deepEqual(game.apply(1, { kind: "draw" }), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(0, { kind: "pass" }), { ok: false, error: "The game is over." });
  assert.deepEqual(game.apply(0, { kind: "play", card: c(4, "S") }), { ok: false, error: "The game is over." });
  assert.equal(game.getState(1).yourTurn, false);
});

// ---------- eights and suits ----------

test("an 8 can be played on any card and names the new suit", () => {
  const game = rigged([c(8, "S"), c(2, "D")], stuck1, c(9, "H"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(8, "S"), suit: "D" }), { ok: true });
  const s = game.getState(1);
  assert.equal(s.suit, "D");
  assert.deepEqual(s.top, c(8, "S"));
  assert.deepEqual(game.getState(0).lastPlay, { seat: 0, card: c(8, "S"), suit: "D" });
});

test("after a suit is named, only that suit or another 8 can follow", () => {
  const game = rigged([c(8, "S"), c(2, "C")], [c(6, "H"), c(6, "D"), c(8, "C"), c(3, "S")], c(9, "H"));
  game.apply(0, { kind: "play", card: c(8, "S"), suit: "D" });
  assert.deepEqual(game.apply(1, { kind: "play", card: c(6, "H") }), {
    ok: false,
    error: "Match the suit or rank, or play an 8.",
  });
  assert.deepEqual(game.getState(1).playable, [c(6, "D"), c(8, "C")]);
  assert.deepEqual(game.apply(1, { kind: "play", card: c(6, "D") }), { ok: true });
  assert.equal(game.getState(0).suit, "D");
});

test("a suit sent with a non-8 card is ignored", () => {
  const game = rigged([c(5, "H"), c(2, "D")], stuck1, c(9, "H"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(5, "H"), suit: "D" }), { ok: true });
  assert.equal(game.getState(1).suit, "H");
});

test("an 8 in hand is always playable, whatever the suit to match", () => {
  const game = rigged([c(8, "C"), c(2, "D")], stuck1, c(9, "H"));
  assert.ok(game.getState(0).playable.some((card) => card.rank === 8 && card.suit === "C"));
});

test("playable lists only the cards you may play, and only on your turn", () => {
  const game = rigged([c(9, "H"), c(2, "C"), c(8, "D")], [c(4, "S")], c(3, "H"));
  assert.deepEqual(game.getState(0).playable, [c(9, "H"), c(8, "D")]);
  assert.deepEqual(game.getState(1).playable, []);
});

test("your hand is shown sorted by suit (S, H, D, C) then rank", () => {
  const game = rigged([c(9, "C"), c(2, "S"), c(5, "H"), c(12, "D")], stuck1, c(3, "S"));
  assert.deepEqual(game.getState(0).yourHand, [c(2, "S"), c(5, "H"), c(12, "D"), c(9, "C")]);
});

// ---------- drawing and passing ----------

test("you must draw before you can pass", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  assert.equal(game.getState(0).canPass, false);
  assert.deepEqual(game.apply(0, { kind: "pass" }), { ok: false, error: "Draw a card before passing." });
  assert.equal(game.getState(0).yourTurn, true);
});

test("a second draw in the same turn is rejected", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "draw" }), { ok: true });
  assert.equal(game.getState(0).canDraw, false);
  assert.equal(game.getState(0).canPass, true);
  assert.deepEqual(game.apply(0, { kind: "draw" }), {
    ok: false,
    error: "You already drew this turn. Play a card or pass.",
  });
});

test("a drawn card is hidden from the opponent but counted", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [c(13, "C")] });
  game.apply(0, { kind: "draw" });
  const opp = crazy8.toView(game, 1, players) as { lastPlay: Record<string, unknown>; opponentCount: number };
  assert.equal(opp.opponentCount, 3);
  assert.equal(opp.lastPlay.drew, true);
  assert.equal(opp.lastPlay.card, undefined);
  assert.ok(!JSON.stringify(opp).includes(JSON.stringify(c(13, "C"))));
});

test("you may play the card you just drew", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [c(3, "C")] });
  game.apply(0, { kind: "draw" });
  assert.deepEqual(game.apply(0, { kind: "play", card: c(3, "C") }), { ok: true });
  assert.equal(game.getState(1).yourTurn, true);
});

test("with the stock empty, a player who is stuck can pass without drawing", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [] });
  assert.equal(game.getState(0).canDraw, false);
  assert.equal(game.getState(0).canPass, true);
  assert.deepEqual(game.apply(0, { kind: "pass" }), { ok: true });
  assert.equal(game.getState(1).yourTurn, true);
});

test("a play makes the discard drawable again once the stock is empty", () => {
  const game = rigged(stuck0, [c(3, "D"), c(5, "D")], c(3, "S"), { stock: [] });
  game.apply(0, { kind: "pass" });
  assert.equal(game.getState(1).canDraw, false);
  assert.deepEqual(game.apply(1, { kind: "play", card: c(3, "D") }), { ok: true });
  assert.equal(game.getState(0).canDraw, true);
});

test("with nothing to draw, the first stuck pass gives the turn away and the second ends the game", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [] });
  assert.deepEqual(game.apply(0, { kind: "pass" }), { ok: true });
  assert.equal(game.getState(1).yourTurn, true);
  assert.deepEqual(game.apply(1, { kind: "draw" }), { ok: false, error: "There are no cards left to draw. Pass." });
  assert.deepEqual(game.apply(1, { kind: "pass" }), { ok: true, finished: { winner: null } });
  assert.equal(game.getState(0).over, true);
});

test("when play stops with nothing to draw, the player holding fewer cards wins", () => {
  const game = rigged([c(4, "H"), c(2, "D"), c(5, "D")], [c(4, "D"), c(2, "C")], c(3, "S"), { stock: [] });
  game.apply(0, { kind: "pass" });
  assert.deepEqual(game.apply(1, { kind: "pass" }), { ok: true, finished: { winner: 1 } });
  assert.equal(game.getState(1).winner, 1);
});

test("the stock refills from the discard pile, keeping the top card", () => {
  const game = rigged([c(4, "S"), c(2, "C")], [c(4, "H"), c(2, "D")], c(3, "S"), { stock: [c(13, "C")] });
  game.apply(0, { kind: "play", card: c(4, "S") });
  game.apply(1, { kind: "play", card: c(4, "H") });
  game.apply(0, { kind: "draw" }); // takes the last card in the stock
  game.apply(0, { kind: "pass" });
  assert.equal(game.getState(1).stockCount, 0);
  assert.deepEqual(game.apply(1, { kind: "draw" }), { ok: true });
  assert.equal(game.getState(1).stockCount, 1);
  assert.deepEqual(game.getState(1).top, c(4, "H"));
});

test("a play increments the plays counter; a draw or pass does not", () => {
  const game = rigged([c(4, "S"), c(2, "C")], stuck1, c(3, "S"));
  game.apply(0, { kind: "play", card: c(4, "S") });
  assert.equal(game.getState(0).plays, 1);
  game.apply(1, { kind: "draw" });
  game.apply(1, { kind: "pass" });
  assert.equal(game.getState(0).plays, 1);
});

test("the opponent's view records a pass after a draw", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  game.apply(0, { kind: "draw" });
  game.apply(0, { kind: "pass" });
  const view = crazy8.toView(game, 1, players) as { lastPlay: Record<string, unknown> };
  assert.deepEqual(view.lastPlay, { who: "opponent", card: undefined, suit: undefined, drew: undefined, passed: true });
});

// ---------- winning ----------

test("playing an 8 as your last card wins and names the suit", () => {
  const game = rigged([c(8, "S")], stuck1, c(3, "S"));
  assert.deepEqual(game.apply(0, { kind: "play", card: c(8, "S"), suit: "H" }), { ok: true, finished: { winner: 0 } });
  const s = game.getState(0);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.equal(s.suit, "H");
});

test("the winning play is the only action that returns finished", () => {
  const game = rigged([c(4, "S"), c(5, "S")], [c(2, "D"), c(9, "D")], c(3, "S"));
  const first = game.apply(0, { kind: "play", card: c(4, "S") });
  assert.equal(first.ok && first.finished, undefined);
  assert.deepEqual(game.apply(1, { kind: "draw" }), { ok: true });
  assert.deepEqual(game.apply(1, { kind: "pass" }), { ok: true });
  assert.deepEqual(game.apply(0, { kind: "play", card: c(5, "S") }), { ok: true, finished: { winner: 0 } });
});

// ---------- handleAction ----------

test("handleAction rejects a play without a valid card", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  const bad: unknown[] = [undefined, null, "5S", { rank: 1, suit: "S" }, { rank: 5, suit: "X" }, { rank: 5 }];
  for (const card of bad) {
    assert.deepEqual(
      crazy8.handleAction(game, 0, { kind: "play", card }, silent),
      { ok: false, error: "Pick a card from your hand." },
      JSON.stringify(card),
    );
  }
});

test("handleAction rejects an invalid suit for an 8", () => {
  const game = rigged([c(8, "S"), c(2, "C")], stuck1, c(3, "S"));
  for (const suit of ["X", "s", 1, null]) {
    assert.deepEqual(
      crazy8.handleAction(game, 0, { kind: "play", card: c(8, "S"), suit }, silent),
      { ok: false, error: "Name a suit for your 8." },
      `suit ${JSON.stringify(suit)}`,
    );
  }
});

test("handleAction returns null for payload kinds this game does not handle", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  for (const payload of [{}, { kind: undefined }, { kind: "Draw" }, { kind: "chat" }, { kind: "move", cell: 2 }]) {
    assert.equal(crazy8.handleAction(game, 0, payload, silent), null, JSON.stringify(payload));
  }
});

test("handleAction relays out-of-turn and rule errors from the engine", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"));
  assert.deepEqual(crazy8.handleAction(game, 1, { kind: "draw" }, silent), { ok: false, error: "It's not your turn." });
  assert.deepEqual(crazy8.handleAction(game, 0, { kind: "pass" }, silent), {
    ok: false,
    error: "Draw a card before passing.",
  });
});

test("ordinary plays, draws and passes carry no commentary and no finished flag", () => {
  const game = rigged([c(4, "S"), c(2, "C")], stuck1, c(3, "S"));
  const played = crazy8.handleAction(game, 0, { kind: "play", card: c(4, "S") }, echo);
  assert.ok(played?.ok);
  assert.equal(played.finished, undefined);
  assert.equal(played.commentary, undefined);
  const drew = crazy8.handleAction(game, 1, { kind: "draw" }, echo);
  assert.ok(drew?.ok);
  assert.equal(drew.commentary, undefined);
  const passed = crazy8.handleAction(game, 1, { kind: "pass" }, echo);
  assert.ok(passed?.ok);
  assert.equal(passed.commentary, undefined);
  assert.equal(passed.finished, undefined);
});

test("a wild 8 gets commentary naming the new suit", async () => {
  const game = rigged([c(8, "S"), c(2, "C")], stuck1, c(3, "S"));
  const r = crazy8.handleAction(game, 0, { kind: "play", card: c(8, "S"), suit: "D" }, echo);
  assert.ok(r?.ok && r.commentary);
  assert.equal(r.commentary.round, 1);
  assert.match((await r.commentary.text) ?? "", /Player 1 played a wild 8 and switched the suit to Diamonds\./);
});

test("the winning card gets commentary saying it was the last card", async () => {
  const game = rigged([c(12, "H")], stuck1, c(3, "H"));
  const r = crazy8.handleAction(game, 0, { kind: "play", card: c(12, "H") }, echo);
  assert.ok(r?.ok);
  assert.deepEqual(r.finished, { winner: 0 });
  assert.match((await r.commentary?.text) ?? "", /Player 1 played the Queen of Hearts, their last card, and wins\./);
});

test("winning with an 8 uses the last-card commentary, not the suit commentary", async () => {
  const game = rigged([c(8, "S")], stuck1, c(3, "S"));
  const r = crazy8.handleAction(game, 0, { kind: "play", card: c(8, "S"), suit: "H" }, echo);
  assert.ok(r?.ok);
  assert.deepEqual(r.finished, { winner: 0 });
  const text = (await r.commentary?.text) ?? "";
  assert.match(text, /Player 1 played the 8 of Spades, their last card, and wins\./);
  assert.doesNotMatch(text, /switched the suit/);
});

test("a game ending on a pass has no commentary", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [] });
  crazy8.handleAction(game, 0, { kind: "pass" }, echo);
  const r = crazy8.handleAction(game, 1, { kind: "pass" }, echo);
  assert.ok(r?.ok);
  assert.deepEqual(r.finished, { winner: null });
  assert.equal(r.commentary, undefined);
});

test("the prompt builder describes a wild 8 and a win", () => {
  const wild = rigged([c(8, "S"), c(2, "C")], stuck1, c(3, "H"));
  wild.apply(0, { kind: "play", card: c(8, "S"), suit: "C" });
  const wildPrompt = buildCrazyEightsPrompt(0, wild.getState(0), false);
  assert.match(wildPrompt, /Crazy Eights: Player 1 played a wild 8 and switched the suit to Clubs\./);
  assert.match(wildPrompt, /maximum 24 words/);

  const win = rigged([c(8, "S")], stuck1, c(3, "S"));
  win.apply(0, { kind: "play", card: c(8, "S"), suit: "H" });
  assert.match(
    buildCrazyEightsPrompt(0, win.getState(0), true),
    /Crazy Eights: Player 1 played the 8 of Spades, their last card, and wins\./,
  );
});

test("a full game through handleAction ends exactly once", () => {
  const game = new CrazyEightsEngine({ shuffle: identity });
  let finishes = 0;
  for (let guard = 0; !game.getState(0).over; guard++) {
    assert.ok(guard < 5000, "game did not finish");
    const seat = game.getState(0).yourTurn ? 0 : 1;
    const state = game.getState(seat);
    const playable = state.playable[0];
    const action: CrazyEightsAction = playable
      ? { kind: "play", card: playable, suit: "S" }
      : state.canDraw
        ? { kind: "draw" }
        : { kind: "pass" };
    const result = crazy8.handleAction(game, seat, action, silent);
    assert.ok(result?.ok, JSON.stringify(result));
    if (result.finished) finishes++;
  }
  assert.equal(finishes, 1);
});

// ---------- toView ----------

test("each seat sees its own hand, the opponent's count and the stock size", () => {
  const game = rigged(stuck0, stuck1, c(3, "S"), { stock: [c(13, "C")] });
  const host = crazy8.toView(game, 0, players) as Record<string, unknown>;
  assert.equal(host.yourName, "a");
  assert.equal(host.opponentName, "b");
  assert.equal(host.opponentCount, 2);
  assert.equal(host.yourTurn, true);
  assert.equal(host.canDraw, true);
  assert.equal(host.canPass, false);
  assert.equal(host.stockCount, 1);
  assert.equal(host.result, undefined);
  assert.equal(host.lastPlay, null);
  assert.deepEqual(host.yourHand, stuck0);
  const guest = crazy8.toView(game, 1, players) as Record<string, unknown>;
  assert.equal(guest.yourTurn, false);
  assert.equal(guest.canDraw, false);
  assert.deepEqual(guest.playable, []);
  assert.deepEqual(guest.yourHand, stuck1);
});

test("neither the opponent's hand nor the stock leaks into a seat's view", () => {
  const hand0 = [c(2, "H"), c(4, "H"), c(5, "H"), c(6, "H"), c(7, "H"), c(10, "H"), c(9, "H")];
  const hand1 = [c(2, "D"), c(4, "D"), c(5, "D"), c(6, "D"), c(7, "D"), c(10, "D"), c(9, "D")];
  const game = rigged(hand0, hand1, c(3, "S"), { stock: [c(13, "C"), c(12, "C")] });
  const guest = JSON.stringify(crazy8.toView(game, 1, players));
  for (const card of [...hand0, c(13, "C"), c(12, "C")]) {
    assert.ok(!guest.includes(JSON.stringify(card)), `leaked ${JSON.stringify(card)}`);
  }
});

test("results read per seat after the game ends: winner, loser, and a tie", () => {
  const win = rigged([c(4, "S")], stuck1, c(3, "S"));
  win.apply(0, { kind: "play", card: c(4, "S") });
  assert.equal((crazy8.toView(win, 0, players) as { result: string }).result, "you");
  assert.equal((crazy8.toView(win, 1, players) as { result: string }).result, "opponent");

  const tie = rigged(stuck0, stuck1, c(3, "S"), { stock: [] });
  tie.apply(0, { kind: "pass" });
  tie.apply(1, { kind: "pass" });
  assert.equal((crazy8.toView(tie, 0, players) as { result: string }).result, "draw");
  assert.equal((crazy8.toView(tie, 1, players) as { result: string }).result, "draw");
});

test("a fewer-cards finish reports the win to the player with fewer cards", () => {
  const game = rigged([c(4, "H"), c(2, "D"), c(5, "D")], [c(4, "D"), c(2, "C")], c(3, "S"), { stock: [] });
  game.apply(0, { kind: "pass" });
  game.apply(1, { kind: "pass" });
  assert.equal((crazy8.toView(game, 1, players) as { result: string }).result, "you");
  assert.equal((crazy8.toView(game, 0, players) as { result: string }).result, "opponent");
});
