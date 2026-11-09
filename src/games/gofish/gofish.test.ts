import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeck, type Card, type Rank } from "../shared/cards.ts";
import { GoFishEngine } from "./GoFishEngine.ts";
import { gofish } from "./index.ts";

const players = [{ username: "a" }, { username: "b" }];
const c = (rank: number, suit: Card["suit"]) => ({ rank, suit }) as Card;

// Deals exactly these hands, then the pond in the given order, then the rest of the deck.
function dealing(hand0: Card[], hand1: Card[], pond: Card[] = []) {
  const used = [...hand0, ...hand1, ...pond];
  const rest = createDeck().filter((d) => !used.some((u) => u.rank === d.rank && u.suit === d.suit));
  return <T>(_items: T[]): T[] => [...used, ...rest] as T[];
}

test("you may only ask for a rank you hold, on your turn", () => {
  const game = new GoFishEngine();
  const held = game.getState(0).yourHand[0].rank;
  assert.equal(game.apply(1, { kind: "ask", rank: held }).ok, false);
  const missing = ([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as Rank[]).find(
    (r) => !game.getState(0).yourHand.some((card) => card.rank === r),
  );
  if (missing) assert.equal(game.apply(0, { kind: "ask", rank: missing }).ok, false);
});

test("a hit takes every card of that rank and you go again", () => {
  const hand0 = [c(5, "S"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S"), c(13, "S"), c(14, "S")];
  const hand1 = [c(5, "H"), c(5, "D"), c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H")];
  const game = new GoFishEngine({ shuffle: dealing(hand0, hand1) });
  const result = game.apply(0, { kind: "ask", rank: 5 });
  assert.ok(result.ok);
  assert.equal(result.ask.got, 2);
  assert.equal(game.getState(0).yourHand.filter((card) => card.rank === 5).length, 3);
  assert.equal(game.getState(0).yourTurn, true);
});

test("go fish passes the turn unless you draw the rank you asked for", () => {
  const hand0 = [c(5, "S"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S"), c(13, "S"), c(14, "S")];
  const hand1 = [c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H"), c(9, "H")];
  const game = new GoFishEngine({ shuffle: dealing(hand0, hand1, [c(2, "C"), c(10, "C")]) });
  const miss = game.apply(0, { kind: "ask", rank: 5 });
  assert.ok(miss.ok && miss.ask.got === 0 && !miss.ask.lucky);
  assert.equal(game.getState(1).yourTurn, true);

  // Drawing the rank you asked for lets you go again.
  const lucky = new GoFishEngine({ shuffle: dealing(hand0, hand1, [c(5, "C")]) });
  const fished = lucky.apply(0, { kind: "ask", rank: 5 });
  assert.ok(fished.ok && fished.ask.lucky);
  assert.equal(lucky.getState(0).yourTurn, true);
});

test("four of a kind becomes a book", () => {
  const hand0 = [c(5, "S"), c(5, "C"), c(5, "D"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S")];
  const hand1 = [c(5, "H"), c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H")];
  const game = new GoFishEngine({ shuffle: dealing(hand0, hand1) });
  const result = game.apply(0, { kind: "ask", rank: 5 });
  assert.ok(result.ok && result.ask.book === 5);
  assert.deepEqual(game.getState(0).yourBooks, [5]);
  assert.deepEqual(game.getState(1).opponentBooks, [5]);
  assert.ok(!game.getState(0).yourHand.some((card) => card.rank === 5));
});

test("only the player who fished sees the drawn card", () => {
  const hand0 = [c(5, "S"), c(9, "S"), c(10, "S"), c(11, "S"), c(12, "S"), c(13, "S"), c(14, "S")];
  const hand1 = [c(2, "H"), c(3, "H"), c(4, "H"), c(6, "H"), c(7, "H"), c(8, "H"), c(9, "H")];
  const engine = new GoFishEngine({ shuffle: dealing(hand0, hand1, [c(2, "C")]) });
  gofish.handleAction(engine, 0, { kind: "ask", rank: 5 }, { commentator: { describe: async () => null }, options: {}, players: 2 });
  const host = gofish.toView(engine, 0, players) as { lastAsk: { drew?: Card } };
  const guest = gofish.toView(engine, 1, players) as { lastAsk: { drew?: Card } };
  assert.deepEqual(host.lastAsk.drew, c(2, "C"));
  assert.equal(guest.lastAsk.drew, undefined);
});

test("a full game ends with all 13 books made", () => {
  const game = new GoFishEngine();
  let finished;
  for (let i = 0; i < 2000 && !finished; i++) {
    const state = game.getState(game.getState(0).yourTurn ? 0 : 1);
    const seat = game.getState(0).yourTurn ? 0 : 1;
    const result = game.apply(seat, { kind: "ask", rank: state.yourHand[0].rank });
    assert.ok(result.ok, "every ask in a simulated game is legal");
    finished = result.finished;
  }
  assert.ok(finished, "the game finishes");
  const state = game.getState(0);
  assert.equal(state.yourBooks.length + state.opponentBooks.length, 13);
  assert.equal(state.yourHand.length + state.opponentCount + state.stockCount, 0);
});
