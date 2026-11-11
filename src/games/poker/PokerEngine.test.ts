import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeck } from "../shared/cards.ts";
import { PokerEngine } from "./PokerEngine.ts";
import type { Card, PokerAction, PokerEngineOptions, Rank, Seat } from "./types.ts";

// ---- helpers ----

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
function c(s: string): Card {
  const r = s[0];
  return { rank: (RANKS[r] ?? Number(r)) as Rank, suit: s[1].toUpperCase() as Card["suit"] };
}
const cards = (s: string): Card[] => s.split(" ").filter(Boolean).map(c);

interface Rig {
  a: string; // A's hole cards
  b: string; // B's hole cards
  board: string; // flop(3) turn river, e.g. "2c 5d 9h Jc 3s"
}

// Hand-built deck in the engine's deal order; burns and the rest are filled with unused cards.
function rigDeck(rig: Rig): Card[] {
  const [a1, a2] = cards(rig.a);
  const [b1, b2] = cards(rig.b);
  const [f1, f2, f3, t, r] = cards(rig.board);
  const used = new Set([a1, a2, b1, b2, f1, f2, f3, t, r].map((x) => `${x.rank}${x.suit}`));
  const spare = createDeck().filter((x) => !used.has(`${x.rank}${x.suit}`));
  const burn = () => spare.shift()!;
  return [a1, a2, b1, b2, burn(), f1, f2, f3, burn(), t, burn(), r, ...spare];
}

// Shuffle that hands out the given decks in order (the last one repeats).
function rigged(...decks: Card[][]): <T>(items: T[]) => T[] {
  const queue = decks.slice();
  return <T>(_items: T[]): T[] => (queue.length > 1 ? queue.shift()! : queue[0]) as unknown as T[];
}

const TOTAL_DEFAULT = 2000;
function conserved(e: PokerEngine, total = TOTAL_DEFAULT): void {
  const s = e.getState(0);
  const sum = s.stacks[0] + s.stacks[1] + s.pot + s.committed[0] + s.committed[1];
  assert.equal(sum, total, "chips must be conserved");
}

// Acts, asserts success and conservation.
function go(e: PokerEngine, seat: Seat, action: PokerAction, total = TOTAL_DEFAULT) {
  const r = e.apply(seat, action);
  assert.equal(r.ok, true, r.ok ? "" : `${seat} ${JSON.stringify(action)}: ${r.error}`);
  conserved(e, total);
  return r;
}

function newHand(e: PokerEngine, total = TOTAL_DEFAULT): void {
  assert.equal(e.apply(0, { kind: "next_hand" }).ok, true);
  assert.equal(e.apply(1, { kind: "next_hand" }).ok, true);
  conserved(e, total);
}

function engine(rig: Rig, opts: PokerEngineOptions = {}): PokerEngine {
  return new PokerEngine({ shuffle: rigged(rigDeck(rig)), ...opts });
}

// A has aces, B has kings, board is dry: A wins any showdown.
const A_WINS: Rig = { a: "As Ad", b: "Ks Kd", board: "2c 5d 9h Jc 3s" };
const B_WINS: Rig = { a: "Ks Kd", b: "As Ad", board: "2c 5d 9h Jc 3s" };

// ---- tests ----

test("deals in the specified order", () => {
  const rig: Rig = { a: "As Ad", b: "Ks Kd", board: "2c 5d 9h Jc 3s" };
  const e = engine(rig);
  const a = e.getState(0);
  const b = e.getState(1);
  assert.deepEqual(a.yourHoleCards, cards("As Ad"));
  assert.deepEqual(b.yourHoleCards, cards("Ks Kd"));
  assert.equal(a.opponentHoleCards, null);
  assert.deepEqual(a.board, []);
  go(e, 0, { kind: "call" });
  go(e, 1, { kind: "check" });
  assert.deepEqual(e.getState(0).board, cards("2c 5d 9h"));
  go(e, 1, { kind: "check" });
  go(e, 0, { kind: "check" });
  assert.deepEqual(e.getState(0).board, cards("2c 5d 9h Jc"));
  go(e, 1, { kind: "check" });
  go(e, 0, { kind: "check" });
  assert.deepEqual(e.getState(0).board, cards("2c 5d 9h Jc 3s"));
});

test("blinds are posted and the button acts first pre-flop", () => {
  const e = engine(A_WINS);
  const s = e.getState(0);
  assert.equal(s.phase, "preflop");
  assert.equal(s.handNumber, 1);
  assert.equal(s.button, 0);
  assert.deepEqual(s.committed, { 0: 10, 1: 20 });
  assert.deepEqual(s.stacks, { 0: 990, 1: 980 });
  assert.equal(s.pot, 0);
  assert.equal(s.toAct, 0);
  assert.deepEqual(s.legal, { fold: true, check: false, call: 10, minRaiseTo: 40, maxRaiseTo: 1000 });
  assert.equal(e.getState(1).legal, null);
  assert.equal(e.getState(1).toAct, 0);
  conserved(e);
});

test("big blind gets an option to raise after a limp", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "call" });
  const s = e.getState(1);
  assert.equal(s.phase, "preflop");
  assert.equal(s.toAct, 1);
  assert.equal(s.legal?.check, true);
  assert.equal(s.legal?.call, 0);
  assert.equal(s.legal?.minRaiseTo, 40);
  go(e, 1, { kind: "raise", to: 60 });
  const a = e.getState(0);
  assert.equal(a.phase, "preflop");
  assert.equal(a.toAct, 0);
  assert.equal(a.legal?.call, 40);
});

test("non-button acts first on the flop, turn and river", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "call" });
  go(e, 1, { kind: "check" });
  for (const phase of ["flop", "turn", "river"] as const) {
    const s = e.getState(0);
    assert.equal(s.phase, phase);
    assert.equal(s.toAct, 1);
    assert.deepEqual(s.committed, { 0: 0, 1: 0 });
    assert.equal(s.pot, 40);
    assert.equal(s.legal, null);
    assert.equal(e.getState(1).legal?.minRaiseTo, 20);
    go(e, 1, { kind: "check" });
    assert.equal(e.getState(0).toAct, 0);
    go(e, 0, { kind: "check" });
  }
  assert.equal(e.getState(0).phase, "handOver");
});

test("button alternates every hand and stacks carry over", () => {
  const e = new PokerEngine({ shuffle: rigged(rigDeck(A_WINS)) });
  go(e, 0, { kind: "fold" });
  assert.equal(e.getState(0).phase, "handOver");
  newHand(e);
  let s = e.getState(0);
  assert.equal(s.handNumber, 2);
  assert.equal(s.button, 1);
  assert.deepEqual(s.stacks, { 0: 970, 1: 1000 }); // A 990 -> BB 20; B 1010 -> SB 10
  assert.deepEqual(s.committed, { 0: 20, 1: 10 });
  assert.equal(s.toAct, 1);
  go(e, 1, { kind: "fold" });
  newHand(e);
  s = e.getState(0);
  assert.equal(s.handNumber, 3);
  assert.equal(s.button, 0);
  assert.equal(s.toAct, 0);
});

test("legality and error messages", () => {
  const e = engine(A_WINS);
  const notYour = e.apply(1, { kind: "check" });
  assert.deepEqual(notYour, { ok: false, error: "It's not your turn." });

  const chk = e.apply(0, { kind: "check" });
  assert.equal(chk.ok, false);
  const low = e.apply(0, { kind: "raise", to: 30 });
  assert.deepEqual(low, { ok: false, error: "Raise must be between 40 and 1000." });
  const high = e.apply(0, { kind: "raise", to: 1001 });
  assert.deepEqual(high, { ok: false, error: "Raise must be between 40 and 1000." });
  assert.equal(e.apply(0, { kind: "raise", to: 40.5 }).ok, false);
  assert.equal(e.apply(0, { kind: "raise", to: Number.NaN }).ok, false);
  assert.equal(e.apply(0, { kind: "bogus" } as unknown as PokerAction).ok, false);
  // failed actions change nothing
  assert.equal(e.getState(0).toAct, 0);
  assert.deepEqual(e.getState(0).committed, { 0: 10, 1: 20 });
  conserved(e);

  go(e, 0, { kind: "call" });
  go(e, 1, { kind: "check" });
  // flop: nothing to call
  const call = e.apply(1, { kind: "call" });
  assert.equal(call.ok, false);
  assert.deepEqual(e.apply(0, { kind: "check" }), { ok: false, error: "It's not your turn." });
  go(e, 1, { kind: "raise", to: 20 }); // minimum bet is the big blind
  assert.equal(e.apply(0, { kind: "check" }).ok, false);

  // fold is always legal on your turn
  go(e, 0, { kind: "fold" });
  const s = e.getState(0);
  assert.equal(s.phase, "handOver");
  assert.equal(s.toAct, null);
  assert.equal(s.legal, null);
  // nothing is legal during handOver
  assert.equal(e.apply(0, { kind: "check" }).ok, false);
  assert.equal(e.apply(1, { kind: "fold" }).ok, false);
});

test("min-raise follows the last raise size (20 -> 60 -> 100 -> 140)", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "raise", to: 60 });
  assert.equal(e.getState(1).legal?.minRaiseTo, 100);
  assert.equal(e.apply(1, { kind: "raise", to: 99 }).ok, false);
  go(e, 1, { kind: "raise", to: 100 });
  assert.equal(e.getState(0).legal?.minRaiseTo, 140);
  assert.equal(e.getState(0).legal?.call, 40);
  go(e, 0, { kind: "call" });
  // new street resets the raise size to the big blind
  const s = e.getState(1);
  assert.equal(s.phase, "flop");
  assert.equal(s.pot, 200);
  assert.equal(s.legal?.minRaiseTo, 20);
  go(e, 1, { kind: "raise", to: 50 });
  assert.equal(e.getState(0).legal?.minRaiseTo, 100);
});

test("all-in and call runs out the board to showdown and ends the game", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "raise", to: 1000 });
  const b = e.getState(1);
  assert.equal(b.legal?.call, 980);
  assert.equal(b.legal?.minRaiseTo, null); // opponent is all-in
  const r = go(e, 1, { kind: "call" });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.equal(r.summary.result.reason, "showdown");
  assert.deepEqual(r.summary.result.winners, [0]);
  assert.deepEqual(r.summary.result.potWon, { 0: 2000, 1: 0 });
  assert.equal(r.summary.result.hands?.[0].category, "pair");
  assert.equal(r.summary.gameOver, true);
  assert.equal(r.summary.winner, 0);
  assert.deepEqual(r.summary.stacks, { 0: 2000, 1: 0 });

  const s = e.getState(1);
  assert.equal(s.phase, "gameOver");
  assert.equal(s.winner, 0);
  assert.equal(s.toAct, null);
  assert.equal(s.board.length, 5);
  assert.deepEqual(s.opponentHoleCards, cards("As Ad"));
  assert.deepEqual(e.getState(0).opponentHoleCards, cards("Ks Kd"));
  assert.equal(e.apply(0, { kind: "check" }).ok, false);
  assert.equal(e.apply(0, { kind: "next_hand" }).ok, false);
});

test("all-in on the flop is called and the turn and river are dealt", () => {
  const e = engine(B_WINS);
  go(e, 0, { kind: "call" });
  go(e, 1, { kind: "check" });
  go(e, 1, { kind: "raise", to: 980 });
  const s = e.getState(0);
  assert.equal(s.phase, "flop");
  assert.equal(s.legal?.call, 980);
  const r = go(e, 0, { kind: "call" });
  assert.equal(r.ok && r.handEnded, true);
  const end = e.getState(0);
  assert.equal(end.board.length, 5);
  assert.equal(end.phase, "gameOver");
  assert.equal(end.winner, 1);
  assert.deepEqual(end.stacks, { 0: 0, 1: 2000 });
});

test("a short all-in raise does not reopen a full raise", () => {
  // Hand 1: A raises to 40 and wins, leaving stacks A 140 / B 60 (start 100).
  const total = 200;
  const e = new PokerEngine({
    startingStack: 100,
    shuffle: rigged(rigDeck(A_WINS), rigDeck(B_WINS)),
  });
  go(e, 0, { kind: "raise", to: 40 }, total);
  go(e, 1, { kind: "call" }, total);
  for (let i = 0; i < 3; i++) {
    go(e, 1, { kind: "check" }, total);
    go(e, 0, { kind: "check" }, total);
  }
  assert.deepEqual(e.getState(0).stacks, { 0: 140, 1: 60 });
  newHand(e, total);

  // Hand 2: B is the button. B limps, A (big blind) raises to 50.
  go(e, 1, { kind: "call" }, total);
  go(e, 0, { kind: "raise", to: 50 }, total);
  const b = e.getState(1);
  assert.equal(b.legal?.call, 30);
  assert.equal(b.legal?.minRaiseTo, 60); // full raise would be 80, but B only has 60
  assert.equal(b.legal?.maxRaiseTo, 60);
  assert.equal(e.apply(1, { kind: "raise", to: 59 }).ok, false);
  go(e, 1, { kind: "raise", to: 60 }, total);
  const a = e.getState(0);
  assert.equal(a.legal?.call, 10);
  assert.equal(a.legal?.minRaiseTo, null); // B is all-in
  const r = go(e, 0, { kind: "call" }, total);
  assert.equal(r.ok && r.handEnded, true);
  const s = e.getState(0);
  assert.equal(s.board.length, 5);
  assert.equal(s.result?.reason, "showdown");
  assert.equal(s.stacks[0] + s.stacks[1], total);
  assert.deepEqual(s.stacks, { 0: 80, 1: 120 }); // B has aces (B_WINS) and doubled up
  assert.equal(s.phase, "handOver");
});

test("a blind that puts the button all-in is refunded to the big blind", () => {
  // Hand 1 (start 100): A raises to 95, B calls, check down, A wins -> A 195 / B 5.
  const total = 200;
  const e = new PokerEngine({
    startingStack: 100,
    shuffle: rigged(rigDeck(A_WINS), rigDeck(B_WINS)),
  });
  go(e, 0, { kind: "raise", to: 95 }, total);
  go(e, 1, { kind: "call" }, total);
  assert.equal(e.getState(0).phase, "flop");
  for (let i = 0; i < 3; i++) {
    go(e, 1, { kind: "check" }, total);
    go(e, 0, { kind: "check" }, total);
  }
  assert.deepEqual(e.getState(0).stacks, { 0: 195, 1: 5 });
  assert.equal(e.getState(0).phase, "handOver");

  // Hand 2: B (button) posts only 5 and is all-in; A's extra 15 comes back.
  const ready1 = e.apply(0, { kind: "next_hand" });
  assert.deepEqual(ready1, { ok: true, handEnded: false });
  const ready2 = e.apply(1, { kind: "next_hand" });
  assert.equal(ready2.ok && ready2.handEnded, true); // nobody can act: runs out immediately
  conserved(e, total);
  const s = e.getState(0);
  assert.equal(s.handNumber, 2);
  assert.equal(s.board.length, 5);
  assert.equal(s.result?.reason, "showdown");
  assert.deepEqual(s.result?.potWon, { 0: 0, 1: 10 }); // B has aces in B_WINS
  assert.deepEqual(s.stacks, { 0: 190, 1: 10 });
  assert.equal(s.phase, "handOver");
});

test("fold awards the pot and keeps hole cards hidden", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "raise", to: 60 });
  const r = go(e, 1, { kind: "fold" });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.equal(r.summary.result.reason, "fold");
  assert.deepEqual(r.summary.result.winners, [0]);
  assert.deepEqual(r.summary.result.potWon, { 0: 80, 1: 0 });
  assert.equal(r.summary.result.hands, null);
  assert.deepEqual(r.summary.stacks, { 0: 1020, 1: 980 });
  assert.equal(r.summary.gameOver, false);
  for (const seat of [0, 1] as const) {
    const s = e.getState(seat);
    assert.equal(s.phase, "handOver");
    assert.equal(s.opponentHoleCards, null);
    assert.equal(s.pot, 0);
    assert.deepEqual(s.committed, { 0: 0, 1: 0 });
    assert.equal(s.toAct, null);
    assert.deepEqual(s.lastAction, { seat: 1, type: "fold", amount: 0 });
  }
});

test("split pot: equal board plays, odd chip goes to the non-button seat", () => {
  // Heads-up contributions are always equal, so the pot can't be odd through play alone;
  // force an odd pot on the river to exercise the odd-chip rule.
  const e = engine({ a: "2c 3d", b: "4h 5h", board: "Ts Js Qs Ks As" });
  const priv = e as unknown as {
    stacks: Record<Seat, number>;
    pot: number;
    board: Card[];
    phase: string;
    toAct: Seat | null;
    acted: Record<Seat, boolean>;
    committed: Record<Seat, number>;
    lastRaiseSize: number;
  };
  const deck = rigDeck({ a: "2c 3d", b: "4h 5h", board: "Ts Js Qs Ks As" });
  priv.board = [deck[5], deck[6], deck[7], deck[9], deck[11]];
  priv.phase = "river";
  priv.pot = 41;
  priv.stacks = { 0: 980, 1: 979 };
  priv.committed = { 0: 0, 1: 0 };
  priv.acted = { 0: false, 1: false };
  priv.lastRaiseSize = 20;
  priv.toAct = 1;
  conserved(e);

  go(e, 1, { kind: "check" });
  const r = go(e, 0, { kind: "check" });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.deepEqual(r.summary.result.winners, [0, 1]);
  assert.deepEqual(r.summary.result.potWon, { 0: 20, 1: 21 }); // button is A
  assert.deepEqual(r.summary.stacks, { 0: 1000, 1: 1000 });
  assert.equal(r.summary.result.hands?.[0].name, "Royal flush");
  assert.equal(e.getState(0).phase, "handOver");
});

test("split pot with an even pot splits evenly", () => {
  const e = engine({ a: "2c 3d", b: "4h 5h", board: "Ts Js Qs Ks As" });
  go(e, 0, { kind: "raise", to: 100 });
  go(e, 1, { kind: "call" });
  for (let i = 0; i < 3; i++) {
    go(e, 1, { kind: "check" });
    go(e, 0, { kind: "check" });
  }
  const s = e.getState(1);
  assert.deepEqual(s.result?.winners, [0, 1]);
  assert.deepEqual(s.result?.potWon, { 0: 100, 1: 100 });
  assert.deepEqual(s.stacks, { 0: 1000, 1: 1000 });
});

test("game over when a stack hits zero (fold cannot do it, showdown can)", () => {
  const e = engine(B_WINS);
  go(e, 0, { kind: "raise", to: 1000 });
  go(e, 1, { kind: "call" });
  const s = e.getState(0);
  assert.equal(s.phase, "gameOver");
  assert.equal(s.winner, 1);
  assert.equal(s.stacks[0], 0);
  assert.equal(s.stacks[1], 2000);
});

test("chip conservation through a scripted multi-street hand", () => {
  const e = engine(A_WINS);
  go(e, 0, { kind: "raise", to: 60 });
  go(e, 1, { kind: "raise", to: 180 });
  go(e, 0, { kind: "call" });
  // flop
  go(e, 1, { kind: "raise", to: 100 });
  go(e, 0, { kind: "raise", to: 300 });
  go(e, 1, { kind: "call" });
  // turn
  go(e, 1, { kind: "check" });
  go(e, 0, { kind: "raise", to: 50 });
  go(e, 1, { kind: "call" });
  // river
  go(e, 1, { kind: "check" });
  const r = go(e, 0, { kind: "check" });
  assert.equal(r.ok && r.handEnded, true);
  const s = e.getState(0);
  assert.equal(s.phase, "handOver");
  assert.deepEqual(s.result?.winners, [0]);
  // pot: 180*2 + 300*2 + 50*2 = 1060
  assert.deepEqual(s.result?.potWon, { 0: 1060, 1: 0 });
  assert.deepEqual(s.stacks, { 0: 1530, 1: 470 });
  assert.equal(s.result?.hands?.[0].name, "Pair of Aces");
});

test("ready flow: both seats must press next hand", () => {
  const e = engine(A_WINS);
  const early = e.apply(0, { kind: "next_hand" });
  assert.equal(early.ok, false); // hand in progress

  go(e, 0, { kind: "fold" });
  let s = e.getState(0);
  assert.deepEqual(s.ready, { 0: false, 1: false });
  assert.equal(s.result?.reason, "fold");

  assert.deepEqual(e.apply(0, { kind: "next_hand" }), { ok: true, handEnded: false });
  assert.deepEqual(e.apply(0, { kind: "next_hand" }), { ok: true, handEnded: false }); // twice is fine
  s = e.getState(1);
  assert.deepEqual(s.ready, { 0: true, 1: false });
  assert.equal(s.phase, "handOver");
  assert.equal(s.handNumber, 1);
  assert.equal(e.apply(1, { kind: "check" }).ok, false);

  const started = e.apply(1, { kind: "next_hand" });
  assert.equal(started.ok, true);
  if (started.ok) assert.equal(started.handEnded, false);
  s = e.getState(1);
  assert.equal(s.phase, "preflop");
  assert.equal(s.handNumber, 2);
  assert.deepEqual(s.ready, { 0: false, 1: false });
  assert.equal(s.result, null);
  assert.deepEqual(s.board, []);
  assert.equal(s.lastAction?.type, "bigBlind");
  assert.equal(s.lastAction?.seat, 0); // seat 0 is the big blind in hand 2
  conserved(e);
});

test("showdown reveals both hands; cards are hidden again next hand", () => {
  const e = new PokerEngine({ shuffle: rigged(rigDeck(A_WINS)) });
  go(e, 0, { kind: "call" });
  go(e, 1, { kind: "check" });
  for (let i = 0; i < 3; i++) {
    go(e, 1, { kind: "check" });
    go(e, 0, { kind: "check" });
  }
  const s = e.getState(1);
  assert.deepEqual(s.opponentHoleCards, cards("As Ad"));
  assert.equal(s.result?.reason, "showdown");
  assert.equal(s.result?.hands?.[1].name, "Pair of Kings");
  newHand(e);
  assert.equal(e.getState(1).opponentHoleCards, null);
  assert.equal(e.getState(0).result, null);
});
