import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../engine/WarEngine.ts';
import { PokerEngine } from './PokerEngine.ts';
import type { Card, PlayerId, PokerAction, PokerEngineOptions, Rank } from './types.ts';

// ---- helpers ----

const RANKS: Record<string, number> = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
function c(s: string): Card {
  const r = s[0];
  return { rank: (RANKS[r] ?? Number(r)) as Rank, suit: s[1].toUpperCase() as Card['suit'] };
}
const cards = (s: string): Card[] => s.split(' ').filter(Boolean).map(c);

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
  const s = e.getState('A');
  const sum = s.stacks.A + s.stacks.B + s.pot + s.committed.A + s.committed.B;
  assert.equal(sum, total, 'chips must be conserved');
}

// Acts, asserts success and conservation.
function go(e: PokerEngine, seat: PlayerId, action: PokerAction, total = TOTAL_DEFAULT) {
  const r = e.act(seat, action);
  assert.equal(r.ok, true, r.ok ? '' : `${seat} ${JSON.stringify(action)}: ${r.error}`);
  conserved(e, total);
  return r;
}

function newHand(e: PokerEngine, total = TOTAL_DEFAULT): void {
  assert.equal(e.ready('A').ok, true);
  assert.equal(e.ready('B').ok, true);
  conserved(e, total);
}

function engine(rig: Rig, opts: PokerEngineOptions = {}): PokerEngine {
  return new PokerEngine({ shuffle: rigged(rigDeck(rig)), ...opts });
}

// A has aces, B has kings, board is dry: A wins any showdown.
const A_WINS: Rig = { a: 'As Ad', b: 'Ks Kd', board: '2c 5d 9h Jc 3s' };
const B_WINS: Rig = { a: 'Ks Kd', b: 'As Ad', board: '2c 5d 9h Jc 3s' };

// ---- tests ----

test('deals in the specified order', () => {
  const rig: Rig = { a: 'As Ad', b: 'Ks Kd', board: '2c 5d 9h Jc 3s' };
  const e = engine(rig);
  const a = e.getState('A');
  const b = e.getState('B');
  assert.deepEqual(a.yourHoleCards, cards('As Ad'));
  assert.deepEqual(b.yourHoleCards, cards('Ks Kd'));
  assert.equal(a.opponentHoleCards, null);
  assert.deepEqual(a.board, []);
  go(e, 'A', { type: 'call' });
  go(e, 'B', { type: 'check' });
  assert.deepEqual(e.getState('A').board, cards('2c 5d 9h'));
  go(e, 'B', { type: 'check' });
  go(e, 'A', { type: 'check' });
  assert.deepEqual(e.getState('A').board, cards('2c 5d 9h Jc'));
  go(e, 'B', { type: 'check' });
  go(e, 'A', { type: 'check' });
  assert.deepEqual(e.getState('A').board, cards('2c 5d 9h Jc 3s'));
});

test('blinds are posted and the button acts first pre-flop', () => {
  const e = engine(A_WINS);
  const s = e.getState('A');
  assert.equal(s.phase, 'preflop');
  assert.equal(s.handNumber, 1);
  assert.equal(s.button, 'A');
  assert.deepEqual(s.committed, { A: 10, B: 20 });
  assert.deepEqual(s.stacks, { A: 990, B: 980 });
  assert.equal(s.pot, 0);
  assert.equal(s.toAct, 'A');
  assert.deepEqual(s.legal, { fold: true, check: false, call: 10, minRaiseTo: 40, maxRaiseTo: 1000 });
  assert.equal(e.getState('B').legal, null);
  assert.equal(e.getState('B').toAct, 'A');
  conserved(e);
});

test("big blind gets an option to raise after a limp", () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'call' });
  const s = e.getState('B');
  assert.equal(s.phase, 'preflop');
  assert.equal(s.toAct, 'B');
  assert.equal(s.legal?.check, true);
  assert.equal(s.legal?.call, 0);
  assert.equal(s.legal?.minRaiseTo, 40);
  go(e, 'B', { type: 'raise', to: 60 });
  const a = e.getState('A');
  assert.equal(a.phase, 'preflop');
  assert.equal(a.toAct, 'A');
  assert.equal(a.legal?.call, 40);
});

test('non-button acts first on the flop, turn and river', () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'call' });
  go(e, 'B', { type: 'check' });
  for (const phase of ['flop', 'turn', 'river'] as const) {
    const s = e.getState('A');
    assert.equal(s.phase, phase);
    assert.equal(s.toAct, 'B');
    assert.deepEqual(s.committed, { A: 0, B: 0 });
    assert.equal(s.pot, 40);
    assert.equal(s.legal, null);
    assert.equal(e.getState('B').legal?.minRaiseTo, 20);
    go(e, 'B', { type: 'check' });
    assert.equal(e.getState('A').toAct, 'A');
    go(e, 'A', { type: 'check' });
  }
  assert.equal(e.getState('A').phase, 'handOver');
});

test('button alternates every hand and stacks carry over', () => {
  const e = new PokerEngine({ shuffle: rigged(rigDeck(A_WINS)) });
  go(e, 'A', { type: 'fold' });
  assert.equal(e.getState('A').phase, 'handOver');
  newHand(e);
  let s = e.getState('A');
  assert.equal(s.handNumber, 2);
  assert.equal(s.button, 'B');
  assert.deepEqual(s.stacks, { A: 970, B: 1000 }); // A 990 -> BB 20; B 1010 -> SB 10
  assert.deepEqual(s.committed, { A: 20, B: 10 });
  assert.equal(s.toAct, 'B');
  go(e, 'B', { type: 'fold' });
  newHand(e);
  s = e.getState('A');
  assert.equal(s.handNumber, 3);
  assert.equal(s.button, 'A');
  assert.equal(s.toAct, 'A');
});

test('legality and error messages', () => {
  const e = engine(A_WINS);
  const notYour = e.act('B', { type: 'check' });
  assert.deepEqual(notYour, { ok: false, error: "It's not your turn." });

  const chk = e.act('A', { type: 'check' });
  assert.equal(chk.ok, false);
  const low = e.act('A', { type: 'raise', to: 30 });
  assert.deepEqual(low, { ok: false, error: 'Raise must be between 40 and 1000.' });
  const high = e.act('A', { type: 'raise', to: 1001 });
  assert.deepEqual(high, { ok: false, error: 'Raise must be between 40 and 1000.' });
  assert.equal(e.act('A', { type: 'raise', to: 40.5 }).ok, false);
  assert.equal(e.act('A', { type: 'raise', to: Number.NaN }).ok, false);
  assert.equal(e.act('A', { type: 'bogus' } as unknown as PokerAction).ok, false);
  // failed actions change nothing
  assert.equal(e.getState('A').toAct, 'A');
  assert.deepEqual(e.getState('A').committed, { A: 10, B: 20 });
  conserved(e);

  go(e, 'A', { type: 'call' });
  go(e, 'B', { type: 'check' });
  // flop: nothing to call
  const call = e.act('B', { type: 'call' });
  assert.equal(call.ok, false);
  assert.deepEqual(e.act('A', { type: 'check' }), { ok: false, error: "It's not your turn." });
  go(e, 'B', { type: 'raise', to: 20 }); // minimum bet is the big blind
  assert.equal(e.act('A', { type: 'check' }).ok, false);

  // fold is always legal on your turn
  go(e, 'A', { type: 'fold' });
  const s = e.getState('A');
  assert.equal(s.phase, 'handOver');
  assert.equal(s.toAct, null);
  assert.equal(s.legal, null);
  // nothing is legal during handOver
  assert.equal(e.act('A', { type: 'check' }).ok, false);
  assert.equal(e.act('B', { type: 'fold' }).ok, false);
});

test('min-raise follows the last raise size (20 -> 60 -> 100 -> 140)', () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'raise', to: 60 });
  assert.equal(e.getState('B').legal?.minRaiseTo, 100);
  assert.equal(e.act('B', { type: 'raise', to: 99 }).ok, false);
  go(e, 'B', { type: 'raise', to: 100 });
  assert.equal(e.getState('A').legal?.minRaiseTo, 140);
  assert.equal(e.getState('A').legal?.call, 40);
  go(e, 'A', { type: 'call' });
  // new street resets the raise size to the big blind
  const s = e.getState('B');
  assert.equal(s.phase, 'flop');
  assert.equal(s.pot, 200);
  assert.equal(s.legal?.minRaiseTo, 20);
  go(e, 'B', { type: 'raise', to: 50 });
  assert.equal(e.getState('A').legal?.minRaiseTo, 100);
});

test('all-in and call runs out the board to showdown and ends the game', () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'raise', to: 1000 });
  const b = e.getState('B');
  assert.equal(b.legal?.call, 980);
  assert.equal(b.legal?.minRaiseTo, null); // opponent is all-in
  const r = go(e, 'B', { type: 'call' });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.equal(r.summary.result.reason, 'showdown');
  assert.deepEqual(r.summary.result.winners, ['A']);
  assert.deepEqual(r.summary.result.potWon, { A: 2000, B: 0 });
  assert.equal(r.summary.result.hands?.A.category, 'pair');
  assert.equal(r.summary.gameOver, true);
  assert.equal(r.summary.winner, 'A');
  assert.deepEqual(r.summary.stacks, { A: 2000, B: 0 });

  const s = e.getState('B');
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 'A');
  assert.equal(s.toAct, null);
  assert.equal(s.board.length, 5);
  assert.deepEqual(s.opponentHoleCards, cards('As Ad'));
  assert.deepEqual(e.getState('A').opponentHoleCards, cards('Ks Kd'));
  assert.equal(e.act('A', { type: 'check' }).ok, false);
  assert.equal(e.ready('A').ok, false);
});

test('all-in on the flop is called and the turn and river are dealt', () => {
  const e = engine(B_WINS);
  go(e, 'A', { type: 'call' });
  go(e, 'B', { type: 'check' });
  go(e, 'B', { type: 'raise', to: 980 });
  const s = e.getState('A');
  assert.equal(s.phase, 'flop');
  assert.equal(s.legal?.call, 980);
  const r = go(e, 'A', { type: 'call' });
  assert.equal(r.ok && r.handEnded, true);
  const end = e.getState('A');
  assert.equal(end.board.length, 5);
  assert.equal(end.phase, 'gameOver');
  assert.equal(end.winner, 'B');
  assert.deepEqual(end.stacks, { A: 0, B: 2000 });
});

test('a short all-in raise does not reopen a full raise', () => {
  // Hand 1: A raises to 40 and wins, leaving stacks A 140 / B 60 (start 100).
  const total = 200;
  const e = new PokerEngine({
    startingStack: 100,
    shuffle: rigged(rigDeck(A_WINS), rigDeck(B_WINS)),
  });
  go(e, 'A', { type: 'raise', to: 40 }, total);
  go(e, 'B', { type: 'call' }, total);
  for (let i = 0; i < 3; i++) {
    go(e, 'B', { type: 'check' }, total);
    go(e, 'A', { type: 'check' }, total);
  }
  assert.deepEqual(e.getState('A').stacks, { A: 140, B: 60 });
  newHand(e, total);

  // Hand 2: B is the button. B limps, A (big blind) raises to 50.
  go(e, 'B', { type: 'call' }, total);
  go(e, 'A', { type: 'raise', to: 50 }, total);
  const b = e.getState('B');
  assert.equal(b.legal?.call, 30);
  assert.equal(b.legal?.minRaiseTo, 60); // full raise would be 80, but B only has 60
  assert.equal(b.legal?.maxRaiseTo, 60);
  assert.equal(e.act('B', { type: 'raise', to: 59 }).ok, false);
  go(e, 'B', { type: 'raise', to: 60 }, total);
  const a = e.getState('A');
  assert.equal(a.legal?.call, 10);
  assert.equal(a.legal?.minRaiseTo, null); // B is all-in
  const r = go(e, 'A', { type: 'call' }, total);
  assert.equal(r.ok && r.handEnded, true);
  const s = e.getState('A');
  assert.equal(s.board.length, 5);
  assert.equal(s.result?.reason, 'showdown');
  assert.equal(s.stacks.A + s.stacks.B, total);
  assert.deepEqual(s.stacks, { A: 80, B: 120 }); // B has aces (B_WINS) and doubled up
  assert.equal(s.phase, 'handOver');
});

test('a blind that puts the button all-in is refunded to the big blind', () => {
  // Hand 1 (start 100): A raises to 95, B calls, check down, A wins -> A 195 / B 5.
  const total = 200;
  const e = new PokerEngine({
    startingStack: 100,
    shuffle: rigged(rigDeck(A_WINS), rigDeck(B_WINS)),
  });
  go(e, 'A', { type: 'raise', to: 95 }, total);
  go(e, 'B', { type: 'call' }, total);
  assert.equal(e.getState('A').phase, 'flop');
  for (let i = 0; i < 3; i++) {
    go(e, 'B', { type: 'check' }, total);
    go(e, 'A', { type: 'check' }, total);
  }
  assert.deepEqual(e.getState('A').stacks, { A: 195, B: 5 });
  assert.equal(e.getState('A').phase, 'handOver');

  // Hand 2: B (button) posts only 5 and is all-in; A's extra 15 comes back.
  const ready1 = e.ready('A');
  assert.deepEqual(ready1, { ok: true, handEnded: false });
  const ready2 = e.ready('B');
  assert.equal(ready2.ok && ready2.handEnded, true); // nobody can act: runs out immediately
  conserved(e, total);
  const s = e.getState('A');
  assert.equal(s.handNumber, 2);
  assert.equal(s.board.length, 5);
  assert.equal(s.result?.reason, 'showdown');
  assert.deepEqual(s.result?.potWon, { A: 0, B: 10 }); // B has aces in B_WINS
  assert.deepEqual(s.stacks, { A: 190, B: 10 });
  assert.equal(s.phase, 'handOver');
});

test('fold awards the pot and keeps hole cards hidden', () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'raise', to: 60 });
  const r = go(e, 'B', { type: 'fold' });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.equal(r.summary.result.reason, 'fold');
  assert.deepEqual(r.summary.result.winners, ['A']);
  assert.deepEqual(r.summary.result.potWon, { A: 80, B: 0 });
  assert.equal(r.summary.result.hands, null);
  assert.deepEqual(r.summary.stacks, { A: 1020, B: 980 });
  assert.equal(r.summary.gameOver, false);
  for (const seat of ['A', 'B'] as const) {
    const s = e.getState(seat);
    assert.equal(s.phase, 'handOver');
    assert.equal(s.opponentHoleCards, null);
    assert.equal(s.pot, 0);
    assert.deepEqual(s.committed, { A: 0, B: 0 });
    assert.equal(s.toAct, null);
    assert.deepEqual(s.lastAction, { seat: 'B', type: 'fold', amount: 0 });
  }
});

test('split pot: equal board plays, odd chip goes to the non-button seat', () => {
  // Heads-up contributions are always equal, so the pot can't be odd through play alone;
  // force an odd pot on the river to exercise the odd-chip rule.
  const e = engine({ a: '2c 3d', b: '4h 5h', board: 'Ts Js Qs Ks As' });
  const priv = e as unknown as {
    stacks: Record<PlayerId, number>;
    pot: number;
    board: Card[];
    phase: string;
    toAct: PlayerId | null;
    acted: Record<PlayerId, boolean>;
    committed: Record<PlayerId, number>;
    lastRaiseSize: number;
  };
  const deck = rigDeck({ a: '2c 3d', b: '4h 5h', board: 'Ts Js Qs Ks As' });
  priv.board = [deck[5], deck[6], deck[7], deck[9], deck[11]];
  priv.phase = 'river';
  priv.pot = 41;
  priv.stacks = { A: 980, B: 979 };
  priv.committed = { A: 0, B: 0 };
  priv.acted = { A: false, B: false };
  priv.lastRaiseSize = 20;
  priv.toAct = 'B';
  conserved(e);

  go(e, 'B', { type: 'check' });
  const r = go(e, 'A', { type: 'check' });
  assert.equal(r.ok && r.handEnded, true);
  if (!r.ok || !r.handEnded) return;
  assert.deepEqual(r.summary.result.winners, ['A', 'B']);
  assert.deepEqual(r.summary.result.potWon, { A: 20, B: 21 }); // button is A
  assert.deepEqual(r.summary.stacks, { A: 1000, B: 1000 });
  assert.equal(r.summary.result.hands?.A.name, 'Royal flush');
  assert.equal(e.getState('A').phase, 'handOver');
});

test('split pot with an even pot splits evenly', () => {
  const e = engine({ a: '2c 3d', b: '4h 5h', board: 'Ts Js Qs Ks As' });
  go(e, 'A', { type: 'raise', to: 100 });
  go(e, 'B', { type: 'call' });
  for (let i = 0; i < 3; i++) {
    go(e, 'B', { type: 'check' });
    go(e, 'A', { type: 'check' });
  }
  const s = e.getState('B');
  assert.deepEqual(s.result?.winners, ['A', 'B']);
  assert.deepEqual(s.result?.potWon, { A: 100, B: 100 });
  assert.deepEqual(s.stacks, { A: 1000, B: 1000 });
});

test('game over when a stack hits zero (fold cannot do it, showdown can)', () => {
  const e = engine(B_WINS);
  go(e, 'A', { type: 'raise', to: 1000 });
  go(e, 'B', { type: 'call' });
  const s = e.getState('A');
  assert.equal(s.phase, 'gameOver');
  assert.equal(s.winner, 'B');
  assert.equal(s.stacks.A, 0);
  assert.equal(s.stacks.B, 2000);
});

test('chip conservation through a scripted multi-street hand', () => {
  const e = engine(A_WINS);
  go(e, 'A', { type: 'raise', to: 60 });
  go(e, 'B', { type: 'raise', to: 180 });
  go(e, 'A', { type: 'call' });
  // flop
  go(e, 'B', { type: 'raise', to: 100 });
  go(e, 'A', { type: 'raise', to: 300 });
  go(e, 'B', { type: 'call' });
  // turn
  go(e, 'B', { type: 'check' });
  go(e, 'A', { type: 'raise', to: 50 });
  go(e, 'B', { type: 'call' });
  // river
  go(e, 'B', { type: 'check' });
  const r = go(e, 'A', { type: 'check' });
  assert.equal(r.ok && r.handEnded, true);
  const s = e.getState('A');
  assert.equal(s.phase, 'handOver');
  assert.deepEqual(s.result?.winners, ['A']);
  // pot: 180*2 + 300*2 + 50*2 = 1060
  assert.deepEqual(s.result?.potWon, { A: 1060, B: 0 });
  assert.deepEqual(s.stacks, { A: 1530, B: 470 });
  assert.equal(s.result?.hands?.A.name, 'Pair of Aces');
});

test('ready flow: both seats must press next hand', () => {
  const e = engine(A_WINS);
  const early = e.ready('A');
  assert.equal(early.ok, false); // hand in progress

  go(e, 'A', { type: 'fold' });
  let s = e.getState('A');
  assert.deepEqual(s.ready, { A: false, B: false });
  assert.equal(s.result?.reason, 'fold');

  assert.deepEqual(e.ready('A'), { ok: true, handEnded: false });
  assert.deepEqual(e.ready('A'), { ok: true, handEnded: false }); // twice is fine
  s = e.getState('B');
  assert.deepEqual(s.ready, { A: true, B: false });
  assert.equal(s.phase, 'handOver');
  assert.equal(s.handNumber, 1);
  assert.equal(e.act('B', { type: 'check' }).ok, false);

  assert.deepEqual(e.ready('B'), { ok: true, handEnded: false });
  s = e.getState('B');
  assert.equal(s.phase, 'preflop');
  assert.equal(s.handNumber, 2);
  assert.deepEqual(s.ready, { A: false, B: false });
  assert.equal(s.result, null);
  assert.deepEqual(s.board, []);
  assert.equal(s.lastAction?.type, 'bigBlind');
  assert.equal(s.lastAction?.seat, 'A'); // A is the big blind in hand 2
  conserved(e);
});

test('showdown reveals both hands; cards are hidden again next hand', () => {
  const e = new PokerEngine({ shuffle: rigged(rigDeck(A_WINS)) });
  go(e, 'A', { type: 'call' });
  go(e, 'B', { type: 'check' });
  for (let i = 0; i < 3; i++) {
    go(e, 'B', { type: 'check' });
    go(e, 'A', { type: 'check' });
  }
  const s = e.getState('B');
  assert.deepEqual(s.opponentHoleCards, cards('As Ad'));
  assert.equal(s.result?.reason, 'showdown');
  assert.equal(s.result?.hands?.B.name, 'Pair of Kings');
  newHand(e);
  assert.equal(e.getState('B').opponentHoleCards, null);
  assert.equal(e.getState('A').result, null);
});
