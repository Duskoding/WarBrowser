import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeck } from "../shared/cards.ts";
import type { Card } from "../shared/cards.ts";
import { buildPokerPrompt, poker } from "./index.ts";
import type { PokerEngine } from "./PokerEngine.ts";
import type { PokerView, PublicMoment, ViewCard } from "./types.ts";

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;

function card(code: string): Card {
  return {
    rank: (RANKS[code[0]] ?? Number(code[0])) as Card["rank"],
    suit: code[1].toUpperCase() as Card["suit"],
  };
}

function cards(text: string): Card[] {
  return text.split(" ").filter(Boolean).map(card);
}

function shown(cardToShow: Card): ViewCard {
  return { rank: cardToShow.rank, suit: SUITS[cardToShow.suit] };
}

function rigDeck(): Card[] {
  const hole = cards("As Ad Ks Kd");
  const board = cards("2c 5d 9h Jc 3s");
  const used = new Set([...hole, ...board].map((c) => `${c.rank}${c.suit}`));
  const spare = createDeck().filter((c) => !used.has(`${c.rank}${c.suit}`));
  const burn = () => spare.shift()!;
  return [...hole, burn(), ...board.slice(0, 3), burn(), board[3], burn(), board[4], ...spare];
}

const players = [{ username: "Ada" }, { username: "Bea" }];
const secrets = ["Ace of Spades", "Ace of Diamonds", "King of Spades", "King of Diamonds"];

function assertHidden(engine: PokerEngine, seat: 0 | 1, hidden: Card[]) {
  const view = poker.toView(engine, seat, players) as PokerView;
  assert.equal(view.opponentCards, null);
  const text = JSON.stringify(view);
  for (const hiddenCard of hidden) {
    assert.equal(text.includes(JSON.stringify(shown(hiddenCard))), false, text);
  }
}

test("the opponent's hole cards never appear in your view before showdown", () => {
  const engine = poker.createEngine({
    options: { shuffle: () => rigDeck() },
    commentator: { describe: async () => null },
    players: 2,
  }) as PokerEngine;
  const yours = [cards("As Ad"), cards("Ks Kd")];
  const steps: [0 | 1, { kind: "call" | "check" | "fold" }][] = [
    [0, { kind: "call" }],
    [1, { kind: "check" }],
    [1, { kind: "check" }],
    [0, { kind: "fold" }],
  ];

  assertHidden(engine, 0, yours[1]);
  assertHidden(engine, 1, yours[0]);
  for (const [seat, action] of steps) {
    const result = engine.apply(seat, action);
    assert.equal(result.ok, true);
    assertHidden(engine, 0, yours[1]);
    assertHidden(engine, 1, yours[0]);
  }
  assert.equal(engine.getState(0).phase, "handOver");
  assert.equal(engine.getState(0).result?.reason, "fold");
});

test("commentary prompts leave hole cards out, including at showdown", async () => {
  const prompts: string[] = [];
  const context = {
    options: { shuffle: () => rigDeck() },
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
    players: 2,
  };
  const engine = poker.createEngine(context);
  const play = (seat: number, kind: "call" | "check") => {
    const result = poker.handleAction(engine, seat, { kind }, context);
    assert.equal(result?.ok, true);
  };
  play(0, "call");
  play(1, "check");
  for (let street = 0; street < 3; street++) {
    play(1, "check");
    play(0, "check");
  }
  assert.equal(engine.getState(0).phase, "handOver");
  assert.equal(engine.getState(0).result?.reason, "showdown");
  assert.ok(prompts.length > 0);
  for (const prompt of prompts) {
    for (const secret of secrets) assert.equal(prompt.includes(secret), false, prompt);
  }
  const view = poker.toView(engine, 1, players) as { opponentCards: ViewCard[] | null };
  assert.deepEqual(view.opponentCards, cards("As Ad").map(shown));
});

test("a public moment prompt has no place to name hole cards", () => {
  const moment: PublicMoment = {
    actionId: 1,
    handNumber: 1,
    phase: "flop",
    actor: 0,
    action: "check",
    amount: 0,
    button: 0,
    board: cards("2c 5d 9h"),
    pot: 40,
    committed: 0,
    stacks: [990, 980],
    handEnded: false,
    gameOver: false,
    winner: null,
  };
  const prompt = buildPokerPrompt(moment);
  for (const secret of secrets) assert.equal(prompt.includes(secret), false);
  assert.match(prompt, /Two of Clubs/);
});
