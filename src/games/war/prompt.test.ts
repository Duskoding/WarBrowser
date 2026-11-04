import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWarPrompt, cardName } from "./prompt.ts";
import type { RoundSummary } from "./types.ts";

const summary: RoundSummary = {
  round: 7,
  card0: { rank: 14, suit: "S" },
  card1: { rank: 9, suit: "D" },
  winner: 0,
  wasWar: false,
  score0: 30,
  score1: 22,
  gameOver: false,
};

test("card names are readable", () => {
  assert.equal(cardName({ rank: 14, suit: "S" }), "Ace of Spades");
  assert.equal(cardName({ rank: 7, suit: "H" }), "7 of Hearts");
});

test("prompt includes cards, winner and score", () => {
  const prompt = buildWarPrompt(summary);
  assert.match(prompt, /Ace of Spades/);
  assert.match(prompt, /9 of Diamonds/);
  assert.match(prompt, /Player 1 won\./);
  assert.match(prompt, /Player 1 30, Player 2 22/);
  assert.doesNotMatch(prompt, /after a war/);
});

test("prompt mentions war, draws and game end", () => {
  assert.match(buildWarPrompt({ ...summary, wasWar: true }), /after a war/);
  assert.match(buildWarPrompt({ ...summary, winner: null }), /draw/);
  assert.match(buildWarPrompt({ ...summary, gameOver: true }), /ended the game/);
});
