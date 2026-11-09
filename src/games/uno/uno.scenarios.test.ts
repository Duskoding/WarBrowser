import assert from "node:assert/strict";
import { test } from "node:test";
import { uno } from "./index.ts";
import { UnoEngine, createDeck } from "./UnoEngine.ts";
import { buildUnoPrompt, cardName } from "./prompt.ts";
import type { Card, Color, UnoAction, UnoState } from "./types.ts";

const card = (color: Color | null, rank: Card["rank"]): Card => ({ color, rank });
const identity = <T>(items: T[]): T[] => items.slice();
// Ignores its input and returns `order`, so the first deal is exact.
const fixed = (order: Card[]) => <T>(_items: T[]): T[] => order.slice() as unknown as T[];
const pile = (n: number): Card[] => Array.from({ length: n }, () => card("red", 1));
const names = (n: number) => Array.from({ length: n }, (_, i) => ({ username: `p${i}` }));
const commentator = { describe: async (prompt: string) => prompt };
const context = (players: number) => ({ commentator, options: { shuffle: identity }, players });
const isWildCard = (c: Card) => c.rank === "wild" || c.rank === "wildDrawFour";

interface Rig {
  direction?: 1 | -1;
  currentSeat?: number;
  drawPile?: Card[];
  // Full discard pile, top card last. Defaults to just the top card.
  discard?: Card[];
  activeColor?: Color;
}

// Builds an engine with exact hands, discard, draw pile and turn state.
function rigged(hands: Card[][], top: Card, rig: Rig = {}): UnoEngine {
  const e = new UnoEngine(hands.length, { shuffle: identity });
  const priv = e as unknown as {
    hands: Card[][];
    discardPile: Card[];
    drawPile: Card[];
    activeColor: Color;
    direction: 1 | -1;
    currentSeat: number;
  };
  priv.hands = hands.map((h) => h.slice());
  priv.discardPile = rig.discard ? rig.discard.slice() : [top];
  priv.activeColor = rig.activeColor ?? top.color ?? "red";
  priv.direction = rig.direction ?? 1;
  priv.currentSeat = rig.currentSeat ?? 0;
  priv.drawPile = rig.drawPile ? rig.drawPile.slice() : pile(30);
  return e;
}

const play = (e: UnoEngine, seat: number, cardIndex: number, chosenColor?: Color) =>
  e.apply(seat, { kind: "play", cardIndex, chosenColor });

type ModuleResult = ReturnType<typeof uno.handleAction>;
function expectOk(r: ModuleResult) {
  if (!r || !r.ok) assert.fail(`expected ok, got ${JSON.stringify(r)}`);
  return r;
}

const playableIndex = (s: UnoState) =>
  s.hand.findIndex((c) => isWildCard(c) || c.color === s.activeColor || c.rank === s.discardTop.rank);

// Deals and plays a whole game with a simple strategy: first playable card, else draw.
function playToEnd(players: number): { finishes: number; winner: number | null } {
  const e = new UnoEngine(players, { shuffle: identity });
  let finishes = 0;
  for (let guard = 0; !e.getState(0).over; guard++) {
    assert.ok(guard < 5000, "game did not finish");
    const seat = e.getState(0).currentSeat;
    const i = playableIndex(e.getState(seat));
    const r = i === -1 ? e.apply(seat, { kind: "draw" }) : play(e, seat, i, "red");
    assert.ok(r.ok);
    if (r.finished) finishes++;
  }
  return { finishes, winner: e.getState(0).winner };
}

// ---------- construction and dealing ----------

test("rejects player counts below 2 or non-integer counts", () => {
  for (const n of [0, 1, -3, 2.5, Number.NaN]) {
    assert.throws(() => new UnoEngine(n), /at least 2 players/, `players=${n}`);
  }
});

test("deals 7 cards to each seat for 2 to 8 players", () => {
  for (const n of [2, 3, 4, 8]) {
    const s = new UnoEngine(n).getState(0);
    assert.deepEqual(s.handCounts, Array(n).fill(7));
    assert.equal(s.drawPileCount, 108 - 7 * n - 1);
    assert.equal(s.discardPileCount, 1);
  }
});

test("the opening discard is the first non-wild card after the deal", () => {
  // Deal 14 to two seats; the first non-wild in what remains is the opening discard.
  const order = createDeck();
  const e = new UnoEngine(2, { shuffle: fixed(order) });
  const rest = order.slice(14);
  const expected = rest.find((c) => !isWildCard(c))!;
  assert.deepEqual(e.getState(0).discardTop, expected);
  assert.equal(e.getState(0).activeColor, expected.color);
});

test("wilds placed in front of the opening discard are skipped and stay in the draw pile", () => {
  const deck = createDeck();
  const wilds = deck.filter(isWildCard);
  const others = deck.filter((c) => !isWildCard(c));
  // Deal 14 non-wilds, then two wilds, then the rest: the top must be others[14].
  const order = [...others.slice(0, 14), ...wilds.slice(0, 2), ...others.slice(14), ...wilds.slice(2)];
  const e = new UnoEngine(2, { shuffle: fixed(order) });
  const s = e.getState(0);
  assert.deepEqual(s.discardTop, others[14]);
  assert.equal(s.activeColor, others[14].color);
  assert.equal(s.drawPileCount, 108 - 14 - 1);
});

// ---------- apply: rejections ----------

test("rejects seats outside the table", () => {
  const e = rigged([[card("red", 1)], [card("red", 2)]], card("red", 5));
  assert.deepEqual(e.apply(-1, { kind: "draw" }), { ok: false, error: "Invalid seat" });
  assert.deepEqual(e.apply(2, { kind: "draw" }), { ok: false, error: "Invalid seat" });
});

test("rejects unknown action kinds, on your turn and off it", () => {
  const e = rigged([[card("red", 1)], [card("red", 2)]], card("red", 5));
  const bogus = { kind: "pass" } as unknown as UnoAction;
  assert.deepEqual(e.apply(0, bogus), { ok: false, error: "Unknown action" });
  assert.deepEqual(e.apply(1, bogus), { ok: false, error: "It's not your turn." });
  assert.equal(e.getState(0).currentSeat, 0);
});

test("rejects card indexes that are negative, out of range or not integers", () => {
  const e = rigged([[card("red", 1)], [card("red", 2)]], card("red", 5));
  for (const cardIndex of [-1, 1, 1.5, Number.NaN]) {
    assert.deepEqual(play(e, 0, cardIndex), { ok: false, error: "Pick a card from your hand." }, `index ${cardIndex}`);
  }
  assert.equal(e.getState(0).handCounts[0], 1);
});

test("a rejected play leaves the hand, discard and turn unchanged", () => {
  const e = rigged([[card("blue", 2)], [card("green", 9)]], card("red", 1));
  assert.deepEqual(play(e, 0, 0), { ok: false, error: "That card doesn't match the discard pile." });
  const s = e.getState(0);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discardTop.rank, 1);
  assert.equal(s.currentSeat, 0);
  assert.equal(s.round, 0);
});

test("the game rejects every action once it is over", () => {
  const e = rigged([[card("red", 7)], [card("blue", 9)]], card("red", 1));
  play(e, 0, 0);
  assert.deepEqual(e.apply(0, { kind: "draw" }), { ok: false, error: "The game is over." });
  assert.deepEqual(e.apply(1, { kind: "draw" }), { ok: false, error: "The game is over." });
  assert.deepEqual(play(e, 0, 0), { ok: false, error: "The game is over." });
});

test("a wild needs a chosen color; a missing color leaves the card in hand", () => {
  const e = rigged([[card(null, "wild"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  assert.deepEqual(play(e, 0, 0), { ok: false, error: "Choose a color for that card." });
  assert.equal(e.getState(0).handCounts[0], 2);
  assert.deepEqual(play(e, 0, 0, "green"), { ok: true });
  assert.equal(e.getState(0).handCounts[0], 1);
});

test("a wild draw four also needs a chosen color", () => {
  const e = rigged([[card(null, "wildDrawFour"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  assert.deepEqual(play(e, 0, 0), { ok: false, error: "Choose a color for that card." });
});

test("the chosen color is enforced for the next player", () => {
  const e = rigged([[card(null, "wild"), card("blue", 8)], [card("blue", 9), card("yellow", 3)]], card("red", 1));
  play(e, 0, 0, "yellow");
  assert.deepEqual(play(e, 1, 0), { ok: false, error: "That card doesn't match the discard pile." });
  assert.deepEqual(play(e, 1, 1), { ok: true });
});

test("a wild leaves the discard top with no color, and the chosen color active", () => {
  const e = rigged([[card(null, "wild"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  play(e, 0, 0, "yellow");
  const s = e.getState(1);
  assert.deepEqual(s.discardTop, card(null, "wild"));
  assert.equal(s.activeColor, "yellow");
});

test("a chosen color on a number card is ignored; the card's own color is active", () => {
  const e = rigged([[card("red", 2), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  assert.deepEqual(play(e, 0, 0, "blue"), { ok: true });
  assert.equal(e.getState(1).activeColor, "red");
});

test("a draw from an empty pile with nothing to refill is rejected", () => {
  const e = rigged([[card("blue", 2)], [card("blue", 9)]], card("red", 5), { drawPile: [] });
  assert.deepEqual(e.apply(0, { kind: "draw" }), { ok: false, error: "No cards left to draw." });
  assert.equal(e.getState(0).currentSeat, 0);
});

// ---------- draw and refill ----------

test("drawing takes the top of the draw pile and passes the turn", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)], [card("green", 3)]], card("red", 5), {
    drawPile: [card("green", 3), card("yellow", 7)],
  });
  assert.deepEqual(e.apply(0, { kind: "draw" }), { ok: true });
  const s = e.getState(0);
  assert.deepEqual(s.hand, [card("red", 1), card("green", 3)]);
  assert.equal(s.drawPileCount, 1);
  assert.equal(s.currentSeat, 1);
  assert.equal(s.round, 1);
});

test("a drawn card cannot be played in the same turn", () => {
  const e = rigged([[card("blue", 2)], [card("blue", 9)], [card("green", 3)]], card("red", 5), {
    drawPile: [card("red", 6)],
  });
  e.apply(0, { kind: "draw" });
  assert.deepEqual(play(e, 0, 1), { ok: false, error: "It's not your turn." });
  assert.equal(e.getState(0).currentSeat, 1);
});

test("an empty draw pile is refilled from the discard, keeping the top card", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5), {
    drawPile: [],
    discard: [card("blue", 2), card("green", 3), card("red", 5)],
  });
  assert.deepEqual(e.apply(0, { kind: "draw" }), { ok: true });
  const s = e.getState(0);
  assert.deepEqual(s.hand, [card("red", 1), card("blue", 2)]);
  assert.equal(s.drawPileCount, 1);
  assert.equal(s.discardPileCount, 1);
  assert.deepEqual(s.discardTop, card("red", 5));
});

// ---------- turn order and effects ----------

test("with 3 players, turns move 0 -> 1 -> 2 -> 0", () => {
  const e = rigged(
    [
      [card("red", 2), card("red", 5), card("blue", 9)],
      [card("red", 3), card("blue", 9), card("blue", 8)],
      [card("red", 4), card("blue", 9), card("blue", 8)],
    ],
    card("red", 1),
  );
  const order: number[] = [];
  for (const seat of [0, 1, 2, 0]) {
    assert.equal(e.getState(0).currentSeat, seat);
    order.push(seat);
    play(e, seat, 0);
  }
  assert.deepEqual(order, [0, 1, 2, 0]);
  assert.equal(e.getState(0).currentSeat, 1);
});

test("skip passes over exactly one seat (3 players, from seat 1 to seat 0)", () => {
  const e = rigged([[card("blue", 9)], [card("red", "skip"), card("blue", 8)], [card("green", 9)]], card("red", 1), {
    currentSeat: 1,
  });
  play(e, 1, 0);
  const s = e.getState(0);
  assert.equal(s.currentSeat, 0);
  assert.deepEqual(s.handCounts, [1, 1, 1]);
});

test("skip with 4 players skips the next seat going forward", () => {
  const e = rigged(
    [[card("blue", 9)], [card("blue", 9)], [card("blue", 9)], [card("red", "skip"), card("blue", 8)]],
    card("red", 1),
    { currentSeat: 3 },
  );
  play(e, 3, 0);
  assert.equal(e.getState(0).currentSeat, 1);
});

test("skip with 4 players going backwards skips the seat behind", () => {
  const e = rigged(
    [[card("blue", 9)], [card("red", "skip"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)]],
    card("red", 1),
    { currentSeat: 1, direction: -1 },
  );
  play(e, 1, 0);
  assert.equal(e.getState(0).currentSeat, 3);
});

test("skip with 2 players hands the turn back to the same player", () => {
  const e = rigged([[card("red", "skip"), card("blue", 8)], [card("blue", 9)]], card("red", 1));
  play(e, 0, 0);
  assert.equal(e.getState(0).currentSeat, 0);
  assert.equal(e.getState(0).yourTurn, true);
});

test("reverse with 3 players then keeps turns moving backwards", () => {
  const e = rigged(
    [
      [card("red", "reverse"), card("blue", 9)],
      [card("red", 7), card("blue", 9)],
      [card("red", 6), card("blue", 9)],
    ],
    card("red", 1),
  );
  play(e, 0, 0);
  assert.equal(e.getState(0).currentSeat, 2);
  assert.equal(e.getState(0).direction, -1);
  play(e, 2, 0);
  assert.equal(e.getState(0).currentSeat, 1);
  play(e, 1, 0);
  assert.equal(e.getState(0).currentSeat, 0);
});

test("reverse with 4 players sends the turn to the seat behind", () => {
  const e = rigged([[card("red", "reverse"), card("blue", 9)], [card("blue", 9)], [card("blue", 9)], [card("blue", 9)]], card("red", 1));
  play(e, 0, 0);
  assert.equal(e.getState(0).direction, -1);
  assert.equal(e.getState(0).currentSeat, 3);
});

test("two reverses with 2 players flip direction twice and keep the same player", () => {
  const e = rigged([[card("red", "reverse"), card("red", "reverse"), card("blue", 9)], [card("blue", 9)]], card("red", 1));
  play(e, 0, 0);
  assert.equal(e.getState(0).direction, -1);
  assert.equal(e.getState(0).currentSeat, 0);
  play(e, 0, 0);
  assert.equal(e.getState(0).direction, 1);
  assert.equal(e.getState(0).currentSeat, 0);
});

test("draw two with 2 players: the other player draws 2 and loses the turn", () => {
  const e = rigged([[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)]], card("red", 1), {
    drawPile: [card("blue", 3), card("blue", 4), card("red", 1)],
  });
  play(e, 0, 0);
  const s = e.getState(0);
  assert.deepEqual(s.handCounts, [1, 3]);
  assert.equal(s.currentSeat, 0);
});

test("draw two with 4 players hits the next seat and skips it", () => {
  const e = rigged(
    [[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)], [card("blue", 9)]],
    card("red", 1),
    { drawPile: pile(10) },
  );
  play(e, 0, 0);
  const s = e.getState(0);
  assert.deepEqual(s.handCounts, [1, 3, 1, 1]);
  assert.equal(s.currentSeat, 2);
});

test("draw two while reversed hits the seat behind", () => {
  const e = rigged(
    [[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)], [card("blue", 9)]],
    card("red", 1),
    { drawPile: pile(10), direction: -1 },
  );
  play(e, 0, 0);
  const s = e.getState(0);
  assert.deepEqual(s.handCounts, [1, 1, 1, 3]);
  assert.equal(s.currentSeat, 2);
});

test("a penalty draw refills an empty draw pile from the discard first", () => {
  const e = rigged([[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)]], card("red", 5), {
    drawPile: [],
    discard: [card("blue", 2), card("green", 3), card("red", 5)],
  });
  play(e, 0, 0);
  const s = e.getState(0);
  assert.equal(s.handCounts[1], 3);
  assert.deepEqual(s.discardTop, card("red", "drawTwo"));
  assert.equal(s.discardPileCount, 1);
  assert.equal(s.drawPileCount, 1);
});

test("a penalty draw takes only the cards that exist when the deck is exhausted", () => {
  const e = rigged([[card("red", "drawTwo"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)]], card("red", 5), {
    drawPile: [],
    discard: [card("red", 5)],
  });
  play(e, 0, 0);
  assert.equal(e.getState(0).handCounts[1], 1 + 1);
  assert.equal(e.getState(0).currentSeat, 2);
});

test("wild draw four makes the next player draw 4, sets the color and skips them", () => {
  const e = rigged(
    [[card(null, "wildDrawFour"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)], [card("blue", 9)]],
    card("red", 1),
    { drawPile: pile(10) },
  );
  play(e, 0, 0, "green");
  const s = e.getState(0);
  assert.deepEqual(s.handCounts, [1, 5, 1, 1]);
  assert.equal(s.activeColor, "green");
  assert.equal(s.currentSeat, 2);
});

test("playing a draw card as your last card wins with no penalty", () => {
  const e = rigged([[card("red", "drawTwo")], [card("blue", 9)]], card("red", 1), { drawPile: pile(5) });
  assert.deepEqual(play(e, 0, 0), { ok: true, finished: { winner: 0 } });
  assert.deepEqual(e.getState(0).handCounts, [0, 1]);
});

test("playing a wild as your last card wins and sets the color", () => {
  const e = rigged([[card(null, "wild")], [card("blue", 9)]], card("red", 1));
  assert.deepEqual(play(e, 0, 0, "blue"), { ok: true, finished: { winner: 0 } });
  assert.equal(e.getState(0).activeColor, "blue");
});

test("the last card of a 3-player game ends it for that seat only", () => {
  const e = rigged([[card("blue", 9)], [card("blue", 8)], [card("red", 7)]], card("red", 1), {
    currentSeat: 2,
  });
  assert.deepEqual(play(e, 2, 0), { ok: true, finished: { winner: 2 } });
  for (const seat of [0, 1, 2]) {
    const s = e.getState(seat);
    assert.equal(s.over, true);
    assert.equal(s.winner, 2);
    assert.equal(s.yourTurn, false);
  }
});

test("a plain play and a draw return no finished flag", () => {
  const e = rigged([[card("red", 2), card("blue", 9)], [card("blue", 8)]], card("red", 1), { drawPile: pile(3) });
  const played = play(e, 0, 0);
  assert.deepEqual(played, { ok: true });
  const drawn = e.apply(1, { kind: "draw" });
  assert.deepEqual(drawn, { ok: true });
});

test("round counts every play and draw", () => {
  const e = rigged([[card("red", 2), card("blue", 9)], [card("blue", 8)]], card("red", 1), { drawPile: pile(3) });
  play(e, 0, 0);
  assert.equal(e.getState(0).round, 1);
  e.apply(1, { kind: "draw" });
  assert.equal(e.getState(0).round, 2);
});

test("a full 3-player game ends exactly once", () => {
  const { finishes, winner } = playToEnd(3);
  assert.equal(finishes, 1);
  assert.notEqual(winner, null);
});

test("a full 4-player game ends exactly once", () => {
  const { finishes, winner } = playToEnd(4);
  assert.equal(finishes, 1);
  assert.notEqual(winner, null);
});

test("a full 8-player game ends exactly once", () => {
  const { finishes, winner } = playToEnd(8);
  assert.equal(finishes, 1);
  assert.notEqual(winner, null);
});

// ---------- toView ----------

test("each seat sees its own hand and only the other hand sizes", () => {
  const e = rigged(
    [[card("blue", 2), card("blue", 9)], [card("green", 3)], [card("yellow", 4), card("yellow", 6)]],
    card("red", 1),
    { currentSeat: 1 },
  );
  const view = uno.toView(e, 1, names(3)) as Record<string, unknown>;
  assert.deepEqual(view.hand, [card("green", 3)]);
  assert.deepEqual(view.handCounts, [2, 1, 2]);
  assert.equal(view.yourSeat, 1);
  assert.deepEqual(view.names, ["p0", "p1", "p2"]);
  assert.equal(view.yourTurn, true);
  assert.equal(view.currentSeat, 1);
  assert.equal(view.over, false);
  assert.equal(view.winnerSeat, null);
  assert.equal(view.round, 0);
  assert.equal(view.direction, 1);
  assert.equal(view.activeColor, "red");
  assert.deepEqual(view.discardTop, card("red", 1));
  assert.equal(view.drawPileCount, 30);
});

test("other players' cards never appear in a seat's view", () => {
  const e = rigged(
    [[card("blue", 2), card("blue", 9)], [card("green", 3)], [card("yellow", 4), card("yellow", 6)]],
    card("red", 1),
  );
  const json = JSON.stringify(uno.toView(e, 1, names(3)));
  for (const hidden of [card("blue", 2), card("blue", 9), card("yellow", 4), card("yellow", 6)]) {
    assert.ok(!json.includes(JSON.stringify(hidden)), `leaked ${JSON.stringify(hidden)}`);
  }
  const seat0 = JSON.stringify(uno.toView(e, 0, names(3)));
  assert.ok(!seat0.includes(JSON.stringify(card("yellow", 4))));
  assert.ok(seat0.includes(JSON.stringify(card("blue", 9))));
});

test("after a win every seat sees the same winner and over flag", () => {
  const e = rigged([[card("blue", 2), card("blue", 9)], [card("green", 3)], [card("red", 7)]], card("red", 1), {
    currentSeat: 2,
  });
  play(e, 2, 0);
  for (const seat of [0, 1, 2]) {
    const view = uno.toView(e, seat, names(3)) as Record<string, unknown>;
    assert.equal(view.over, true, `seat ${seat}`);
    assert.equal(view.winnerSeat, 2, `seat ${seat}`);
    assert.equal(view.yourTurn, false, `seat ${seat}`);
  }
  assert.deepEqual((uno.toView(e, 2, names(3)) as { hand: Card[] }).hand, []);
});

test("the view reflects a chosen color and a reversed direction", () => {
  const e = rigged(
    [[card(null, "wild"), card("blue", 8)], [card("blue", 9)], [card("blue", 9)]],
    card("red", 1),
  );
  play(e, 0, 0, "green");
  const view = uno.toView(e, 1, names(3)) as Record<string, unknown>;
  assert.equal(view.activeColor, "green");
  assert.equal(view.currentSeat, 1);
  assert.equal(view.direction, 1);
  assert.equal(view.yourTurn, true);
});

test("an 8-player view names every seat and counts every hand", () => {
  const engine = new UnoEngine(8);
  const view = uno.toView(engine, 7, names(8)) as Record<string, unknown>;
  assert.equal((view.names as string[]).length, 8);
  assert.equal(view.yourSeat, 7);
  assert.equal((view.handCounts as number[]).length, 8);
  assert.equal(view.hand && (view.hand as Card[]).length, 7);
});

// ---------- handleAction ----------

test("a draw returns commentary for the move and no finished flag", async () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5), { drawPile: pile(3) });
  const r = expectOk(uno.handleAction(e, 0, { kind: "draw" }, context(2)));
  assert.equal(r.finished, undefined);
  assert.equal(r.commentary?.round, 1);
  const text = await r.commentary?.text;
  assert.match(text ?? "", /Player 1 drew a card\./);
  assert.match(text ?? "", /Move 1\./);
});

test("a played number card is named in its commentary", async () => {
  const e = rigged([[card("red", 5), card("blue", 9)], [card("blue", 8)]], card("red", 1));
  const r = expectOk(uno.handleAction(e, 0, { kind: "play", cardIndex: 0 }, context(2)));
  assert.match((await r.commentary?.text) ?? "", /Player 1 played the red 5\./);
});

test("a wild and a wild draw four are named without their color in commentary", async () => {
  const wild = rigged([[card(null, "wild"), card("blue", 9)], [card("blue", 8)]], card("red", 1));
  const w = expectOk(uno.handleAction(wild, 0, { kind: "play", cardIndex: 0, chosenColor: "blue" }, context(2)));
  assert.match((await w.commentary?.text) ?? "", /Player 1 played the Wild\./);

  const wd4 = rigged([[card(null, "wildDrawFour"), card("blue", 9)], [card("blue", 8)]], card("red", 1), {
    drawPile: pile(5),
  });
  const w4 = expectOk(uno.handleAction(wd4, 0, { kind: "play", cardIndex: 0, chosenColor: "blue" }, context(2)));
  assert.match((await w4.commentary?.text) ?? "", /Player 1 played the Wild Draw Four\./);
});

test("the winning play is flagged finished and its commentary says who won", async () => {
  const e = rigged([[card("red", 7)], [card("blue", 9)]], card("red", 1));
  const r = expectOk(uno.handleAction(e, 0, { kind: "play", cardIndex: 0 }, context(2)));
  assert.deepEqual(r.finished, { winner: 0 });
  assert.match((await r.commentary?.text) ?? "", /Player 1 played the red 7\. Player 1 won the game\./);
});

test("handleAction flags finished on the ending action only across a whole game", async () => {
  const ctx = context(3);
  const e = uno.createEngine(ctx);
  const finishedFlags: boolean[] = [];
  for (let guard = 0; !e.getState(0).over; guard++) {
    assert.ok(guard < 5000, "game did not finish");
    const seat = e.getState(0).currentSeat;
    const s = e.getState(seat);
    const i = playableIndex(s);
    const payload = i === -1 ? { kind: "draw" } : { kind: "play", cardIndex: i, chosenColor: "red" };
    const r = expectOk(uno.handleAction(e, seat, payload, ctx));
    assert.ok(r.commentary, "every accepted move has commentary");
    finishedFlags.push(r.finished !== undefined);
  }
  assert.equal(finishedFlags.filter(Boolean).length, 1);
  assert.equal(finishedFlags.at(-1), true);
});

test("rejected moves return only an error, with no commentary or finished flag", () => {
  const e = rigged([[card("blue", 1), card(null, "wild")], [card("blue", 9)]], card("red", 5));
  assert.deepEqual(uno.handleAction(e, 0, { kind: "play", cardIndex: 0 }, context(2)), {
    ok: false,
    error: "That card doesn't match the discard pile.",
  });
  assert.deepEqual(uno.handleAction(e, 1, { kind: "draw" }, context(2)), {
    ok: false,
    error: "It's not your turn.",
  });
});

test("handleAction reports a finished game as over", () => {
  const e = rigged([[card("red", 7)], [card("blue", 9)]], card("red", 1));
  uno.handleAction(e, 0, { kind: "play", cardIndex: 0 }, context(2));
  assert.deepEqual(uno.handleAction(e, 1, { kind: "draw" }, context(2)), {
    ok: false,
    error: "The game is over.",
  });
});

test("a play with a missing, non-integer or mistyped card index is rejected", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5));
  const bad: unknown[] = [undefined, "0", 1.5, null, Number.NaN];
  for (const cardIndex of bad) {
    assert.deepEqual(
      uno.handleAction(e, 0, { kind: "play", cardIndex }, context(2)),
      { ok: false, error: "Pick a card from your hand." },
      `cardIndex ${String(cardIndex)}`,
    );
  }
});

test("an invalid chosen color is rejected before the move is applied", () => {
  const e = rigged([[card(null, "wild"), card("blue", 9)], [card("blue", 9)]], card("red", 1));
  for (const chosenColor of ["purple", "Red", "", null]) {
    assert.deepEqual(
      uno.handleAction(e, 0, { kind: "play", cardIndex: 0, chosenColor }, context(2)),
      { ok: false, error: "Choose a valid color." },
      `color ${JSON.stringify(chosenColor)}`,
    );
  }
  assert.equal(e.getState(0).handCounts[0], 2);
});

test("unknown or malformed payload kinds are not handled by this game", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5));
  for (const payload of [{}, { kind: undefined }, { kind: "Draw" }, { kind: "pass" }, { kind: "chat", text: "hi" }]) {
    assert.equal(uno.handleAction(e, 0, payload, context(2)), null, JSON.stringify(payload));
  }
});

test("a draw payload with extra fields is still a draw", () => {
  const e = rigged([[card("red", 1)], [card("blue", 9)]], card("red", 5), { drawPile: pile(2) });
  const r = expectOk(uno.handleAction(e, 0, { kind: "draw", cardIndex: 9 }, context(2)));
  assert.equal(r.finished, undefined);
  assert.equal(e.getState(0).handCounts[0], 2);
});

test("commentary round matches the state after the move", () => {
  const e = rigged([[card("red", 2), card("blue", 9)], [card("blue", 8)]], card("red", 1));
  const r = expectOk(uno.handleAction(e, 0, { kind: "play", cardIndex: 0 }, context(2)));
  assert.equal(r.commentary?.round, e.getState(0).round);
});

// ---------- prompt ----------

test("cardName names every card kind", () => {
  assert.equal(cardName(card("red", 0)), "red 0");
  assert.equal(cardName(card("blue", 9)), "blue 9");
  assert.equal(cardName(card("green", "skip")), "green Skip");
  assert.equal(cardName(card("yellow", "reverse")), "yellow Reverse");
  assert.equal(cardName(card("red", "drawTwo")), "red Draw Two");
  assert.equal(cardName(card(null, "wild")), "Wild");
  assert.equal(cardName(card(null, "wildDrawFour")), "Wild Draw Four");
});

test("buildUnoPrompt adds the winner only once the game is over", () => {
  const move = buildUnoPrompt({ seat: 1, action: "play", card: card("red", 4), over: false, winner: null, round: 3 });
  assert.match(move, /Move 3\. Player 2 played the red 4\.$/);
  assert.doesNotMatch(move, /won the game/);
  const end = buildUnoPrompt({ seat: 1, action: "play", card: card("red", 4), over: true, winner: 1, round: 3 });
  assert.match(end, /Player 2 played the red 4\. Player 2 won the game\.$/);
  const draw = buildUnoPrompt({ seat: 0, action: "draw", over: false, winner: null, round: 2 });
  assert.match(draw, /Player 1 drew a card\.$/);
});
