import { createDeck, fisherYates } from '../engine/WarEngine.ts';
import { bestHand, compareHands } from './handEvaluator.ts';
import type {
  Card,
  HandResult,
  HandSummary,
  LastAction,
  LegalActions,
  PlayerId,
  PokerAction,
  PokerActResult,
  PokerEngineOptions,
  PokerPhase,
  PokerState,
} from './types.ts';

const SEATS: PlayerId[] = ['A', 'B'];
const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A');
const pair = <T>(a: T, b: T): Record<PlayerId, T> => ({ A: a, B: b });

export class PokerEngine {
  private readonly shuffle: <T>(items: T[]) => T[];
  private readonly startingStack: number;
  private readonly smallBlind: number;
  private readonly bigBlind: number;

  private stacks: Record<PlayerId, number>;
  private committed: Record<PlayerId, number> = pair(0, 0);
  private acted: Record<PlayerId, boolean> = pair(false, false);
  private pot = 0;
  private phase: PokerPhase = 'preflop';
  private handNumber = 0;
  private button: PlayerId = 'B'; // flipped to 'A' when hand 1 is dealt
  private hole: Record<PlayerId, Card[]> = pair<Card[]>([], []);
  private deck: Card[] = [];
  private board: Card[] = [];
  private toAct: PlayerId | null = null;
  private lastRaiseSize = 0;
  private lastAction: LastAction | null = null;
  private result: HandResult | null = null;
  private ready_: Record<PlayerId, boolean> = pair(false, false);
  private winner: PlayerId | null = null;

  constructor(opts: PokerEngineOptions = {}) {
    this.shuffle = opts.shuffle ?? fisherYates;
    this.startingStack = opts.startingStack ?? 1000;
    this.smallBlind = opts.smallBlind ?? 10;
    this.bigBlind = opts.bigBlind ?? 20;
    this.stacks = pair(this.startingStack, this.startingStack);
    this.startHand();
  }

  act(seat: PlayerId, action: PokerAction): PokerActResult {
    if (this.phase === 'handOver' || this.phase === 'gameOver') {
      return { ok: false, error: this.phase === 'gameOver' ? 'The game is over.' : 'The hand is over.' };
    }
    if (seat !== 'A' && seat !== 'B') return { ok: false, error: 'Unknown player.' };
    if (seat !== this.toAct) return { ok: false, error: "It's not your turn." };

    const opp = other(seat);
    const toCall = Math.max(0, this.committed[opp] - this.committed[seat]);
    let summary: HandSummary | null = null;

    switch (action?.type) {
      case 'fold':
        return this.handled(this.finishFold(seat));
      case 'check':
        if (toCall > 0) return { ok: false, error: `You can't check; call ${Math.min(toCall, this.stacks[seat])} or fold.` };
        this.acted[seat] = true;
        this.lastAction = { seat, type: 'check', amount: 0 };
        break;
      case 'call': {
        if (toCall === 0) return { ok: false, error: 'There is nothing to call.' };
        const pay = Math.min(toCall, this.stacks[seat]);
        this.move(seat, pay);
        this.acted[seat] = true;
        this.lastAction = { seat, type: 'call', amount: pay };
        break;
      }
      case 'raise': {
        const legal = this.legalFor(seat);
        if (legal.minRaiseTo === null || legal.maxRaiseTo === null) {
          return { ok: false, error: "You can't raise right now." };
        }
        const to = action.to;
        if (!Number.isInteger(to) || to < legal.minRaiseTo || to > legal.maxRaiseTo) {
          return { ok: false, error: `Raise must be between ${legal.minRaiseTo} and ${legal.maxRaiseTo}.` };
        }
        this.move(seat, to - this.committed[seat]);
        this.lastRaiseSize = Math.max(this.lastRaiseSize, to - this.committed[opp]);
        this.acted[seat] = true;
        this.acted[opp] = false;
        this.lastAction = { seat, type: 'raise', amount: to };
        break;
      }
      default:
        return { ok: false, error: 'Unknown action.' };
    }

    if (this.streetComplete()) summary = this.endStreet();
    else this.toAct = opp;
    return this.handled(summary);
  }

  ready(seat: PlayerId): PokerActResult {
    if (seat !== 'A' && seat !== 'B') return { ok: false, error: 'Unknown player.' };
    if (this.phase === 'gameOver') return { ok: false, error: 'The game is over.' };
    if (this.phase !== 'handOver') return { ok: false, error: 'The hand is still in progress.' };
    this.ready_[seat] = true;
    if (this.ready_.A && this.ready_.B) return this.handled(this.startHand());
    return { ok: true, handEnded: false };
  }

  getState(seat: PlayerId): PokerState {
    const over = this.phase === 'handOver' || this.phase === 'gameOver';
    const showdown = over && this.result?.reason === 'showdown';
    const mine = this.toAct === seat;
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      button: this.button,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      yourHoleCards: this.hole[seat].slice(),
      opponentHoleCards: showdown ? this.hole[other(seat)].slice() : null,
      board: this.board.slice(),
      pot: this.pot,
      stacks: { ...this.stacks },
      committed: { ...this.committed },
      toAct: this.toAct,
      legal: mine ? this.legalFor(seat) : null,
      lastAction: this.lastAction ? { ...this.lastAction } : null,
      result: this.result,
      ready: { ...this.ready_ },
      winner: this.winner,
    };
  }

  // ---- internals ----

  private handled(summary: HandSummary | null): PokerActResult {
    return summary ? { ok: true, handEnded: true, summary } : { ok: true, handEnded: false };
  }

  private move(seat: PlayerId, chips: number): void {
    this.stacks[seat] -= chips;
    this.committed[seat] += chips;
  }

  private startHand(): HandSummary | null {
    this.handNumber++;
    this.button = other(this.button);
    this.deck = this.shuffle(createDeck());
    this.hole = { A: [this.deck[0], this.deck[1]], B: [this.deck[2], this.deck[3]] };
    this.board = [];
    this.pot = 0;
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.ready_ = pair(false, false);
    this.result = null;
    this.winner = null;
    this.phase = 'preflop';

    const bbSeat = other(this.button);
    this.move(this.button, Math.min(this.smallBlind, this.stacks[this.button]));
    this.move(bbSeat, Math.min(this.bigBlind, this.stacks[bbSeat]));
    this.lastRaiseSize = this.bigBlind;
    this.lastAction = { seat: bbSeat, type: 'bigBlind', amount: this.committed[bbSeat] };
    this.toAct = this.button;

    return this.streetComplete() ? this.endStreet() : null;
  }

  private legalFor(seat: PlayerId): LegalActions {
    const opp = other(seat);
    const toCall = Math.max(0, this.committed[opp] - this.committed[seat]);
    const legal: LegalActions = {
      fold: true,
      check: toCall === 0,
      call: Math.min(toCall, this.stacks[seat]),
      minRaiseTo: null,
      maxRaiseTo: null,
    };
    if (this.stacks[seat] > toCall && this.stacks[opp] > 0) {
      const effective = Math.min(
        this.committed[seat] + this.stacks[seat],
        this.committed[opp] + this.stacks[opp],
      );
      legal.maxRaiseTo = effective;
      legal.minRaiseTo = Math.min(this.committed[opp] + this.lastRaiseSize, effective);
    }
    return legal;
  }

  private streetComplete(): boolean {
    for (const s of SEATS) {
      if (this.stacks[s] === 0 && this.committed[other(s)] >= this.committed[s]) return true;
    }
    return this.acted.A && this.acted.B && this.committed.A === this.committed.B;
  }

  private endStreet(): HandSummary | null {
    if (this.committed.A !== this.committed.B) {
      const hi = this.committed.A > this.committed.B ? 'A' : 'B';
      const lo = other(hi);
      if (this.stacks[lo] === 0) {
        const diff = this.committed[hi] - this.committed[lo];
        this.committed[hi] -= diff;
        this.stacks[hi] += diff;
      }
    }
    this.pot += this.committed.A + this.committed.B;
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.lastRaiseSize = this.bigBlind;

    if (this.stacks.A === 0 || this.stacks.B === 0) {
      while (this.board.length < 5) this.dealNext();
      return this.showdown();
    }
    if (this.phase === 'river') return this.showdown();
    this.dealNext();
    this.toAct = other(this.button);
    return null;
  }

  private dealNext(): void {
    const d = this.deck;
    if (this.board.length === 0) {
      this.board.push(d[5], d[6], d[7]);
      this.phase = 'flop';
    } else if (this.board.length === 3) {
      this.board.push(d[9]);
      this.phase = 'turn';
    } else if (this.board.length === 4) {
      this.board.push(d[11]);
      this.phase = 'river';
    }
  }

  private showdown(): HandSummary {
    const hands = {
      A: bestHand([...this.hole.A, ...this.board]),
      B: bestHand([...this.hole.B, ...this.board]),
    };
    const cmp = compareHands(hands.A, hands.B);
    const total = this.pot;
    const potWon = pair(0, 0);
    let winners: PlayerId[];
    if (cmp > 0) {
      potWon.A = total;
      winners = ['A'];
    } else if (cmp < 0) {
      potWon.B = total;
      winners = ['B'];
    } else {
      const half = Math.floor(total / 2);
      potWon.A = half;
      potWon.B = half;
      potWon[other(this.button)] += total - 2 * half; // odd chip to the non-button seat
      winners = ['A', 'B'];
    }
    return this.finishHand({ reason: 'showdown', winners, potWon, hands });
  }

  private finishFold(folder: PlayerId): HandSummary {
    const win = other(folder);
    const potWon = pair(0, 0);
    potWon[win] = this.pot + this.committed.A + this.committed.B;
    this.pot = 0;
    this.committed = pair(0, 0);
    this.lastAction = { seat: folder, type: 'fold', amount: 0 };
    return this.finishHand({ reason: 'fold', winners: [win], potWon, hands: null });
  }

  private finishHand(result: HandResult): HandSummary {
    this.stacks.A += result.potWon.A;
    this.stacks.B += result.potWon.B;
    this.pot = 0;
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.result = result;
    this.toAct = null;
    const busted = SEATS.find((s) => this.stacks[s] === 0);
    if (busted) {
      this.phase = 'gameOver';
      this.winner = other(busted);
    } else {
      this.phase = 'handOver';
    }
    return {
      handNumber: this.handNumber,
      result,
      stacks: { ...this.stacks },
      gameOver: this.phase === 'gameOver',
      winner: this.winner,
    };
  }
}
