import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameModuleActionResult } from "../GameModule.ts";
import { createDeck, type Card } from "../shared/cards.ts";
import { GoFishEngine, type GoFishAction } from "./GoFishEngine.ts";
import { gofish } from "./index.ts";

const players = [{ username: "a" }, { username: "b" }];
const c = (rank: number, suit: Card["suit"]) => ({ rank, suit }) as Card;
const silent = { commentator: { describe: async () => null }, options: {}, players: 2 };
const capture = { commentator: { describe: async (prompt: string) => prompt }, options: {}, players: 2 };
const identity = <T>(items: T[]): T[] => items.slice();

type Ok = Extract<GameModuleActionResult, { ok: true }>;

function expectOk(r: GameModuleActionResult | null): Ok {
  assert.ok(r && r.ok, r && !r.ok ? r.error : "expected a result");
  return r as Ok;
}

function expectError(r: GameModuleActionResult | null): string {
  assert.ok(r && !r.ok, "expected an error");
  return r.error;
}

// Deals exactly these hands, then the pond (top of the stock) in the given order, then the rest of the deck.
function dealing(hand0: Card[], hand1: Card[], pond: Card[] = []) {
  const used = [...hand0, ...hand1, ...pond];
  const rest = createDeck().filter((d) => !used.some((u) => u.rank === d.rank && u.suit === d.suit));
  return <T>(_items: T[]): T[] => [...used, ...rest] as T[];
}

// Seat 0 holds 5s, 6s, 7s, 8s, 9s, 10s, Js; seat 1 holds three 5s, three 6s and a 7.
const SEAT0_HAND = [c(5, "S"), c(6, "S"), c(7, "S"), c(8, "S"), c(9, "S"), c(10, "S"), c(11, "S")];
const SEAT1_HAND = [c(5, "H"), c(5, "D"), c(5, "C"), c(6, "H"), c(6, "D"), c(6, "C"), c(7, "H")];
// A seat-1 hand with no nines and no fives, so asks for those ranks from seat 0 always fish.
const NO_NINES_OR_FIVES = [c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H"), c(13, "H")];

// Asks with each player's first held rank until the game ends; returns the number of asks.
function playToEnd(engine: GoFishEngine): number {
  for (let steps = 1; steps <= 2000; steps++) {
    const seat = engine.getState(0).yourTurn ? 0 : 1;
    const rank = engine.getState(seat).yourHand[0].rank;
    const result = engine.apply(seat, { kind: "ask", rank });
    assert.ok(result.ok, "every ask in a simulated game is legal");
    if (result.finished) return steps;
  }
  assert.fail("the game finishes");
}

test("apply rejects unknown action kinds", () => {
  const game = new GoFishEngine();
  const bogus = { kind: "fish" } as unknown as GoFishAction;
  assert.deepEqual(game.apply(0, bogus), { ok: false, error: "Unknown action" });
});

test("apply rejects asks out of turn and for ranks the asker does not hold", () => {
  // Seat 1 holds a five, but seat 0 does not, so seat 0 may not ask for fives.
  const hand0 = [c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S"), c(13, "S"), c(14, "S"), c(2, "S")];
  const hand1 = [c(5, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H"), c(2, "H")];
  const engine = new GoFishEngine({ shuffle: dealing(hand0, hand1) });
  assert.deepEqual(engine.apply(1, { kind: "ask", rank: 5 }), { ok: false, error: "It's not your turn." });
  assert.deepEqual(engine.apply(0, { kind: "ask", rank: 5 }), { ok: false, error: "Ask for a rank you hold." });
  assert.equal(engine.getState(0).yourTurn, true, "a rejected ask does not pass the turn");
  assert.equal(engine.getState(0).asks, 0);
});

test("handleAction rejects a missing, non-integer or out-of-range rank before the engine runs", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND) });
  for (const rank of [undefined, null, "5", 1, 15, 5.5]) {
    assert.equal(expectError(gofish.handleAction(engine, 0, { kind: "ask", rank }, silent)), "Ask for a rank you hold.");
  }
  assert.equal(engine.getState(0).asks, 0, "invalid payloads change nothing");
});

test("handleAction passes turn and game-over errors through", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND) });
  assert.equal(expectError(gofish.handleAction(engine, 1, { kind: "ask", rank: 6 }, silent)), "It's not your turn.");

  const finished = new GoFishEngine({ shuffle: identity });
  playToEnd(finished);
  assert.equal(expectError(gofish.handleAction(finished, 0, { kind: "ask", rank: 5 }, silent)), "The game is over.");
  assert.equal(expectError(gofish.handleAction(finished, 1, { kind: "ask", rank: 5 }, silent)), "The game is over.");
});

test("handleAction returns null for payloads that are not asks", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND) });
  assert.equal(gofish.handleAction(engine, 0, { kind: "bid", value: 5 }, silent), null);
  assert.equal(gofish.handleAction(engine, 0, {}, silent), null);
  assert.equal(engine.getState(0).asks, 0);
});

test("a hit hands over every matching card, the asker goes again and the stock is untouched", () => {
  const game = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND, [c(14, "C")]) });
  const result = game.apply(0, { kind: "ask", rank: 5 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 3);
  assert.equal(result.ask.drew, undefined, "no card is drawn on a hit");
  assert.equal(result.ask.lucky, undefined);
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(0).opponentCount, 4);
  assert.equal(game.getState(0).stockCount, 38);
});

test("going fish draws the top card and passes the turn", () => {
  const game = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND, [c(14, "C")]) });
  const result = game.apply(0, { kind: "ask", rank: 9 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 0);
  assert.deepEqual(result.ask.drew, c(14, "C"));
  assert.equal(result.ask.lucky, undefined);
  assert.equal(game.getState(0).yourHand.length, 8);
  assert.equal(game.getState(0).stockCount, 37);
  assert.equal(game.getState(0).yourTurn, false);
  assert.equal(game.getState(1).yourTurn, true);
});

test("drawing the asked rank while fishing is lucky and keeps the turn", () => {
  const game = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, NO_NINES_OR_FIVES, [c(9, "C")]) });
  const result = game.apply(0, { kind: "ask", rank: 9 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 0);
  assert.equal(result.ask.lucky, true);
  assert.deepEqual(result.ask.drew, c(9, "C"));
  assert.equal(game.getState(0).yourTurn, true, "a lucky draw keeps the turn");
  assert.equal(game.getState(1).yourTurn, false);
});

test("a lucky draw that completes a book is reported with that book and keeps the turn", () => {
  const hand0 = [c(5, "S"), c(5, "H"), c(5, "D"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S")];
  const engine = new GoFishEngine({ shuffle: dealing(hand0, NO_NINES_OR_FIVES, [c(5, "C")]) });
  const result = engine.apply(0, { kind: "ask", rank: 5 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 0);
  assert.equal(result.ask.lucky, true);
  assert.equal(result.ask.book, 5);
  assert.deepEqual(engine.getState(0).yourBooks, [5]);
  assert.equal(engine.getState(0).yourTurn, true);
});

test("four of a kind completed by a hit is laid down as a book for both players", () => {
  const hand0 = [c(5, "S"), c(5, "C"), c(5, "D"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S")];
  const hand1 = [c(5, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H")];
  const engine = new GoFishEngine({ shuffle: dealing(hand0, hand1) });
  const result = engine.apply(0, { kind: "ask", rank: 5 });
  assert.ok(result.ok && result.ask.book === 5);
  assert.deepEqual(engine.getState(0).yourBooks, [5]);
  assert.deepEqual(engine.getState(1).opponentBooks, [5]);
  assert.deepEqual(engine.getState(1).yourBooks, []);
  assert.equal(engine.getState(0).yourHand.some((card) => card.rank === 5), false);
});

test("books made by the deal are already down, and seat 0 still opens", () => {
  const hand0 = [c(3, "S"), c(3, "H"), c(3, "D"), c(3, "C"), c(9, "S"), c(10, "S"), c(11, "S")];
  const hand1 = [c(4, "H"), c(4, "D"), c(4, "C"), c(4, "S"), c(6, "H"), c(7, "H"), c(8, "H")];
  const engine = new GoFishEngine({ shuffle: dealing(hand0, hand1) });
  assert.deepEqual(engine.getState(0).yourBooks, [3]);
  assert.deepEqual(engine.getState(0).opponentBooks, [4]);
  assert.equal(engine.getState(0).yourHand.length, 3);
  assert.equal(engine.getState(0).opponentCount, 3);
  assert.equal(engine.getState(0).stockCount, 38);
  assert.equal(engine.getState(0).yourTurn, true);
  assert.equal(engine.getState(1).yourTurn, false);
});

test("an ask that completes a book gets commentary, one that does not gets none", async () => {
  const hand0 = [c(5, "S"), c(5, "C"), c(5, "D"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S")];
  const hit = new GoFishEngine({ shuffle: dealing(hand0, [c(5, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H")]) });
  const booked = expectOk(gofish.handleAction(hit, 0, { kind: "ask", rank: 5 }, capture));
  assert.equal(booked.finished, undefined);
  assert.ok(booked.commentary);
  assert.equal(booked.commentary.round, 1);
  const text = await booked.commentary.text;
  assert.match(text ?? "", /Go Fish: Player 1 completed a book of four 5s\. Books 1-0\./);
  assert.match(text ?? "", /You are a lively sports commentator/);

  const plain = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, NO_NINES_OR_FIVES, [c(9, "C")]) });
  const missed = expectOk(gofish.handleAction(plain, 0, { kind: "ask", rank: 9 }, capture));
  assert.equal("commentary" in missed, false);
  assert.equal(missed.finished, undefined);
});

test("a refilled opponent is dealt from the stock on their turn", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND, [c(14, "C")]) });
  assert.ok(engine.apply(0, { kind: "ask", rank: 5 }).ok, "takes three fives");
  assert.ok(engine.apply(0, { kind: "ask", rank: 6 }).ok, "takes three sixes");
  const seven = engine.apply(0, { kind: "ask", rank: 7 });
  assert.ok(seven.ok && seven.ask.got === 1, "takes the last card in seat 1's hand");
  assert.equal(engine.getState(0).opponentCount, 0);
  assert.equal(engine.getState(0).yourTurn, true, "a hit keeps seat 0 going");

  // Seat 0 fishes for a nine and draws the pond card; seat 1 is then empty and is dealt the next stock card.
  const miss = engine.apply(0, { kind: "ask", rank: 9 });
  assert.ok(miss.ok && miss.ask.got === 0 && miss.ask.drew !== undefined);
  assert.equal(engine.getState(1).yourTurn, true);
  assert.equal(engine.getState(1).yourHand.length, 1);
  assert.equal(engine.getState(0).opponentCount, 1);
  assert.equal(engine.getState(0).stockCount, 36);
});

test("an empty pond passes the turn without drawing", () => {
  // The deal uses the whole stock, so there is nothing left to fish from.
  const engine = new GoFishEngine({ shuffle: <T>(_items: T[]): T[] => [...SEAT0_HAND, ...SEAT1_HAND] as T[] });
  const result = engine.apply(0, { kind: "ask", rank: 9 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 0);
  assert.equal(result.ask.drew, undefined);
  assert.equal(result.ask.lucky, undefined);
  assert.equal(engine.getState(0).stockCount, 0);
  assert.equal(engine.getState(0).yourHand.length, 7);
  assert.equal(engine.getState(1).yourTurn, true);
});

test("a full game reports finished exactly once, on the action that makes the last book", () => {
  const engine = new GoFishEngine({ shuffle: identity });
  let asks = 0;
  let finishedAt = -1;
  for (;;) {
    const seat = engine.getState(0).yourTurn ? 0 : 1;
    const rank = engine.getState(seat).yourHand[0].rank;
    const result = expectOk(gofish.handleAction(engine, seat, { kind: "ask", rank }, silent));
    asks++;
    if (result.finished) {
      finishedAt = asks;
      break;
    }
    assert.ok(asks < 2000, "the game finishes");
  }
  assert.equal(engine.getState(0).over, true);
  assert.equal(engine.getState(0).asks, finishedAt);
  assert.equal(engine.getState(0).yourBooks.length + engine.getState(0).opponentBooks.length, 13);
});

test("the ending gives seat 0 the win with 8 books to 5, and each seat its own result", async () => {
  const engine = new GoFishEngine({ shuffle: identity });
  const winningMove = (() => {
    for (;;) {
      const seat = engine.getState(0).yourTurn ? 0 : 1;
      const rank = engine.getState(seat).yourHand[0].rank;
      const result = expectOk(gofish.handleAction(engine, seat, { kind: "ask", rank }, capture));
      if (result.finished) return { seat, result };
    }
  })();
  assert.deepEqual(winningMove.result.finished, { winner: 0 });
  assert.ok(winningMove.result.commentary);
  assert.match((await winningMove.result.commentary.text) ?? "", /Player 1 wins the game\./);

  const host = engine.getState(0);
  assert.equal(host.winner, 0);
  assert.equal(host.yourBooks.length, 8);
  assert.equal(host.opponentBooks.length, 5);
  assert.equal(host.yourTurn, false);
  assert.equal(engine.getState(1).yourTurn, false);
  assert.equal((gofish.toView(engine, 0, players) as { result?: string }).result, "you");
  assert.equal((gofish.toView(engine, 1, players) as { result?: string }).result, "opponent");
});

test("the view is relative to the viewer and never shows the other hand, the stock or the pond", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, NO_NINES_OR_FIVES, [c(9, "C"), c(14, "D")]) });
  gofish.handleAction(engine, 0, { kind: "ask", rank: 9 }, silent);
  const host = gofish.toView(engine, 0, players) as Record<string, unknown>;
  const guest = gofish.toView(engine, 1, players) as Record<string, unknown>;

  assert.deepEqual(Object.keys(guest).sort(), [
    "lastAsk",
    "opponentBooks",
    "opponentCount",
    "opponentName",
    "result",
    "stockCount",
    "yourBooks",
    "yourHand",
    "yourName",
    "yourTurn",
  ]);
  assert.equal(guest.opponentCount, 8, "seat 0 kept the lucky draw, so holds eight cards");
  assert.equal(guest.stockCount, 37);
  assert.equal(guest.yourTurn, false);
  assert.equal(guest.yourName, "b");
  assert.equal(guest.opponentName, "a");
  assert.equal(guest.result, undefined);
  assert.equal(host.yourName, "a");
  assert.equal(host.opponentCount, 7);
  assert.equal(host.yourTurn, true, "a lucky draw keeps seat 0 on turn");
  assert.equal(host.result, undefined, "no result before the game is over");
  assert.equal((guest.yourHand as Card[]).length, 7);
  assert.equal(JSON.stringify(guest).includes("\"drew\""), false, "the drawn card stays private");
});

test("lastAsk names the actor for each seat and reveals the drawn card only to the drawer", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, NO_NINES_OR_FIVES, [c(9, "C")]) });
  gofish.handleAction(engine, 0, { kind: "ask", rank: 9 }, silent);
  const host = gofish.toView(engine, 0, players) as { lastAsk: Record<string, unknown> };
  const guest = gofish.toView(engine, 1, players) as { lastAsk: Record<string, unknown> };
  assert.equal(host.lastAsk.who, "you");
  assert.equal(guest.lastAsk.who, "opponent");
  assert.equal(host.lastAsk.rank, 9);
  assert.equal(guest.lastAsk.rank, 9);
  assert.equal(host.lastAsk.lucky, true);
  assert.deepEqual(host.lastAsk.drew, c(9, "C"));
  assert.equal(guest.lastAsk.drew, undefined);
  assert.equal(guest.lastAsk.lucky, true);
});

test("the view before any ask has no lastAsk and no result", () => {
  const engine = new GoFishEngine({ shuffle: dealing(SEAT0_HAND, SEAT1_HAND) });
  const view = gofish.toView(engine, 0, players) as Record<string, unknown>;
  assert.equal(view.lastAsk, null);
  assert.equal(view.result, undefined);
  assert.equal(view.yourTurn, true);
});
