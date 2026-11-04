import test from "node:test";
import assert from "node:assert/strict";
import { Uno, createDeck, unoView, type UnoCard, type UnoColor, type UnoValue } from "./uno.ts";

let nextId = 1000;
const card = (color: UnoColor | null, value: UnoValue): UnoCard => ({ id: nextId++, color, value });

// A game with hands and the top card set by hand, so each rule can be tested on its own.
function setup(players: number, hands: UnoCard[][], top: UnoCard, drawPile: UnoCard[] = []) {
  const game = new Uno(players, () => 0.5);
  hands.forEach((hand, seat) => game.hands[seat].splice(0, Infinity, ...hand));
  game.discard.splice(0, Infinity, top);
  game.color = top.color!;
  game.drawPile = drawPile;
  return game;
}

test("the deck has the standard 108 cards", () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((c) => c.id)).size, 108);
  assert.equal(deck.filter((c) => c.value === "wild4").length, 4);
  assert.equal(deck.filter((c) => c.color === "red" && c.value === "0").length, 1);
  assert.equal(deck.filter((c) => c.color === "blue" && c.value === "skip").length, 2);
});

test("a new game deals seven cards each and starts on a number card", () => {
  const game = new Uno(4);
  assert.deepEqual(game.hands.map((h) => h.length), [7, 7, 7, 7]);
  assert.match(game.top.value, /^\d$/);
  assert.equal(game.color, game.top.color);
  assert.equal(game.drawPile.length + game.discard.length + 28, 108);
});

test("cards must match colour or value, and only on your turn", () => {
  const red5 = card("red", "5");
  const blue5 = card("blue", "5");
  const green7 = card("green", "7");
  const game = setup(2, [[green7, blue5, card("red", "1")], [card("red", "2")]], red5);
  assert.equal(game.play(1, game.hands[1][0].id), "It's not your turn.");
  assert.equal(game.play(0, green7.id), "That card doesn't match.");
  assert.equal(game.play(0, 999999), "You don't have that card.");
  assert.equal(game.play(0, blue5.id), null);
  assert.equal(game.color, "blue");
  assert.equal(game.turn, 1);
});

test("wild cards need a colour and set it", () => {
  const wild = card(null, "wild");
  const game = setup(2, [[wild, card("red", "1")], [card("red", "2")]], card("green", "3"));
  assert.equal(game.play(0, wild.id), "Choose a colour for your wild card.");
  assert.equal(game.play(0, wild.id, "purple"), "Choose a colour for your wild card.");
  assert.equal(game.play(0, wild.id, "yellow"), null);
  assert.equal(game.color, "yellow");
});

test("skip, reverse and draw cards with three players", () => {
  const skip = card("red", "skip");
  const reverse = card("red", "reverse");
  const draw2 = card("red", "draw2");
  const pile = Array.from({ length: 10 }, () => card("blue", "9"));
  const game = setup(3, [[skip, reverse, draw2, card("red", "1")], [card("green", "1")], [card("red", "4")]], card("red", "5"), pile);

  assert.equal(game.play(0, skip.id), null);
  assert.equal(game.turn, 2, "seat 1 is skipped");

  game.turn = 0;
  assert.equal(game.play(0, reverse.id), null);
  assert.equal(game.direction, -1);
  assert.equal(game.turn, 2, "play goes the other way");

  game.turn = 0;
  assert.equal(game.play(0, draw2.id), null);
  assert.equal(game.hands[2].length, 3, "seat 2 (next, going backwards) draws two");
  assert.equal(game.turn, 1, "and loses their turn");
});

test("with two players reverse acts like skip", () => {
  const reverse = card("red", "reverse");
  const game = setup(2, [[reverse, card("red", "1")], [card("green", "1")]], card("red", "5"));
  assert.equal(game.play(0, reverse.id), null);
  assert.equal(game.turn, 0);
});

test("wild draw four gives the next player four cards", () => {
  const wild4 = card(null, "wild4");
  const pile = Array.from({ length: 10 }, () => card("blue", "9"));
  const game = setup(2, [[wild4, card("red", "1")], [card("green", "1")]], card("red", "5"), pile);
  assert.equal(game.play(0, wild4.id, "green"), null);
  assert.equal(game.hands[1].length, 5);
  assert.equal(game.turn, 0);
});

test("drawing a playable card lets you play or pass it; otherwise the turn passes", () => {
  const playable = card("red", "8");
  const unplayable = card("blue", "8");
  const other = card("red", "1");
  const game = setup(2, [[other, card("yellow", "2")], [card("green", "1")]], card("red", "5"), [unplayable, playable]);

  assert.equal(game.pass(0), "Draw a card before passing.");
  assert.equal(game.draw(0), null);
  assert.equal(game.drawn?.id, playable.id);
  assert.equal(game.draw(0), "You already drew. Play that card or pass.");
  assert.equal(game.play(0, other.id), "You can only play the card you just drew.");
  assert.equal(game.pass(0), null);
  assert.equal(game.turn, 1);

  game.turn = 0;
  assert.equal(game.draw(0), null);
  assert.equal(game.drawn, null);
  assert.equal(game.turn, 1, "an unplayable draw ends the turn");
});

test("the discard pile is reshuffled when the draw pile runs out", () => {
  const game = setup(2, [[card("blue", "1")], [card("green", "1")]], card("red", "5"));
  game.discard.unshift(card("yellow", "3"), card("yellow", "4"));
  assert.equal(game.draw(0), null);
  assert.equal(game.hands[0].length, 2);
  assert.equal(game.discard.length, 1);
  assert.equal(game.top.value, "5");
});

test("forgetting Uno lets another player catch you", () => {
  const a = card("red", "1");
  const pile = Array.from({ length: 5 }, () => card("blue", "9"));
  const game = setup(3, [[a, card("blue", "2")], [card("green", "1")], [card("green", "2")]], card("red", "5"), pile);
  assert.equal(game.play(0, a.id), null);
  assert.equal(game.catchable, 0);
  assert.equal(game.catchPlayer(0), "Nobody to catch right now.");
  assert.equal(game.catchPlayer(2), null);
  assert.equal(game.hands[0].length, 3);
  assert.deepEqual(game.last, { kind: "caught", seat: 0, by: 2 });
});

test("calling Uno in time protects you", () => {
  const a = card("red", "1");
  const game = setup(2, [[a, card("blue", "2")], [card("green", "1"), card("green", "2")]], card("red", "5"));
  assert.equal(game.callUno(1), "You can call Uno when you're down to your last card.");
  assert.equal(game.callUno(0), null);
  assert.equal(game.play(0, a.id), null);
  assert.equal(game.catchable, null);
  assert.equal(game.catchPlayer(1), "Nobody to catch right now.");
});

test("emptying your hand wins, and views hide other hands", () => {
  const last = card("red", "1");
  const game = setup(3, [[last], [card("green", "1"), card("green", "2")], [card("blue", "1")]], card("red", "5"));
  const before = unoView(game, 1, [{ username: "a" }, { username: "b" }, { username: "c" }]);
  assert.equal(before.hand.length, 2);
  assert.deepEqual(before.players.map((p) => p.cards), [1, 2, 1]);
  assert.equal(JSON.stringify(before).includes(String(last.id)), false, "seat 1 can't see seat 0's card");

  assert.equal(game.play(0, last.id), null);
  assert.equal(game.winner, 0);
  assert.equal(game.draw(1), "The game is over.");
  assert.equal(unoView(game, 2, [{ username: "a" }, { username: "b" }, { username: "c" }]).winnerName, "a");
});
