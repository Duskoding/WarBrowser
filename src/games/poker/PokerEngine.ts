import type { GameEngine } from "../../engine/GameEngine.ts";
import { createDeck, fisherYates } from "../shared/cards.ts";
import type { Card } from "../shared/cards.ts";
import { bestHand, compareHands } from "./handEvaluator.ts";
import type {
  HandResult,
  HandSummary,
  LastAction,
  LegalActions,
  PokerAction,
  PokerEngineOptions,
  PokerPhase,
  PokerResult,
  PokerState,
  PublicMoment,
  Seat,
} from "./types.ts";

const SEATS: Seat[] = [0, 1];
const other = (p: Seat): Seat => (p === 0 ? 1 : 0);
const pair = <T>(a: T, b: T): Record<Seat, T> => ({ 0: a, 1: b });
const isSeat = (seat: number): seat is Seat => seat === 0 || seat === 1;

export class PokerEngine implements GameEngine<PokerState, PokerAction, PokerResult> {
  private readonly shuffle: <T>(items: T[]) => T[];
  private readonly startingStack: number;
  private readonly smallBlind: number;
  private readonly bigBlind: number;

  private stacks: Record<Seat, number>;
  private committed: Record<Seat, number> = pair(0, 0);
  private acted: Record<Seat, boolean> = pair(false, false);
  private pot = 0;
  private phase: PokerPhase = "preflop";
  private handNumber = 0;
  private button: Seat = 1; // flipped to 0 when hand 1 is dealt
  private hole: Record<Seat, Card[]> = pair<Card[]>([], []);
  private deck: Card[] = [];
  private board: Card[] = [];
  private toAct: Seat | null = null;
  private lastRaiseSize = 0;
  private lastAction: LastAction | null = null;
  private result: HandResult | null = null;
  private ready_: Record<Seat, boolean> = pair(false, false);
  private winner: Seat | null = null;
  private actionId = 0;

  constructor(opts: PokerEngineOptions = {}) {
    this.shuffle = opts.shuffle ?? fisherYates;
    this.startingStack = opts.startingStack ?? 1000;
    this.smallBlind = opts.smallBlind ?? 10;
    this.bigBlind = opts.bigBlind ?? 20;
    this.stacks = pair(this.startingStack, this.startingStack);
    this.startHand();
  }

  apply(seat: number, action: PokerAction): PokerResult {
    if (!isSeat(seat)) return { ok: false, error: "Unknown player." };
    if (action?.kind === "next_hand") return this.ready(seat);
    return this.act(seat, action);
  }

  getState(seat: number): PokerState {
    const viewer: Seat = seat === 1 ? 1 : 0;
    const over = this.phase === "handOver" || this.phase === "gameOver";
    const showdown = over && this.result?.reason === "showdown";
    const mine = this.toAct === viewer;
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      button: this.button,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      yourHoleCards: this.hole[viewer].slice(),
      opponentHoleCards: showdown ? this.hole[other(viewer)].slice() : null,
      board: this.board.slice(),
      pot: this.pot,
      stacks: { ...this.stacks },
      committed: { ...this.committed },
      toAct: this.toAct,
      legal: mine ? this.legalFor(viewer) : null,
      lastAction: this.lastAction ? { ...this.lastAction } : null,
      result: this.result,
      ready: { ...this.ready_ },
      winner: this.winner,
    };
  }

  private act(seat: Seat, action: PokerAction): PokerResult {
    if (this.phase === "handOver" || this.phase === "gameOver") {
      return { ok: false, error: this.phase === "gameOver" ? "The game is over." : "The hand is over." };
    }
    if (seat !== this.toAct) return { ok: false, error: "It's not your turn." };

    const opp = other(seat);
    const toCall = Math.max(0, this.committed[opp] - this.committed[seat]);
    let summary: HandSummary | null = null;
    let amount = 0;

    switch (action?.kind) {
      case "fold":
        summary = this.finishFold(seat);
        return this.done(summary, this.speak(seat, "fold", 0, summary));
      case "check":
        if (toCall > 0) {
          return { ok: false, error: `You can't check; call ${Math.min(toCall, this.stacks[seat])} or fold.` };
        }
        this.acted[seat] = true;
        this.lastAction = { seat, type: "check", amount: 0 };
        break;
      case "call": {
        if (toCall === 0) return { ok: false, error: "There is nothing to call." };
        amount = Math.min(toCall, this.stacks[seat]);
        this.move(seat, amount);
        this.acted[seat] = true;
        this.lastAction = { seat, type: "call", amount };
        break;
      }
      case "raise": {
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
        this.lastAction = { seat, type: "raise", amount: to };
        amount = to;
        break;
      }
      default:
        return { ok: false, error: "Unknown action." };
    }

    if (this.streetComplete()) summary = this.endStreet();
    else this.toAct = opp;
    const kind = action.kind === "raise" || action.kind === "call" || action.kind === "check" ? action.kind : "check";
    return this.done(summary, this.speak(seat, kind, amount, summary));
  }

  private ready(seat: Seat): PokerResult {
    if (this.phase === "gameOver") return { ok: false, error: "The game is over." };
    if (this.phase !== "handOver") return { ok: false, error: "The hand is still in progress." };
    this.ready_[seat] = true;
    if (!(this.ready_[0] && this.ready_[1])) return { ok: true, handEnded: false };
    const summary = this.startHand();
    return this.done(summary, this.speak(seat, "next_hand", 0, summary));
  }

  private done(summary: HandSummary | null, spoke: PublicMoment): PokerResult {
    if (!summary) return { ok: true, handEnded: false, spoke };
    return {
      ok: true,
      handEnded: true,
      summary,
      spoke,
      ...(summary.gameOver ? { finished: { winner: summary.winner } } : {}),
    };
  }

  private speak(
    actor: Seat,
    action: PublicMoment["action"],
    amount: number,
    summary: HandSummary | null,
  ): PublicMoment {
    this.actionId += 1;
    return {
      actionId: this.actionId,
      handNumber: this.handNumber,
      phase: this.phase,
      actor,
      action,
      amount,
      button: this.button,
      board: this.board.map((card) => ({ ...card })),
      pot: this.pot,
      committed: this.committed[0] + this.committed[1],
      stacks: [this.stacks[0], this.stacks[1]],
      handEnded: summary !== null,
      reason: summary?.result.reason,
      winners: summary ? [...summary.result.winners] : undefined,
      potWon: summary ? [summary.result.potWon[0], summary.result.potWon[1]] : undefined,
      handNames: summary?.result.hands
        ? [summary.result.hands[0].name, summary.result.hands[1].name]
        : undefined,
      gameOver: this.phase === "gameOver",
      winner: this.winner,
    };
  }

  private move(seat: Seat, chips: number): void {
    this.stacks[seat] -= chips;
    this.committed[seat] += chips;
  }

  private startHand(): HandSummary | null {
    this.handNumber += 1;
    this.button = other(this.button);
    this.deck = this.shuffle(createDeck());
    this.hole = { 0: [this.deck[0], this.deck[1]], 1: [this.deck[2], this.deck[3]] };
    this.board = [];
    this.pot = 0;
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.ready_ = pair(false, false);
    this.result = null;
    this.winner = null;
    this.phase = "preflop";

    const bbSeat = other(this.button);
    this.move(this.button, Math.min(this.smallBlind, this.stacks[this.button]));
    this.move(bbSeat, Math.min(this.bigBlind, this.stacks[bbSeat]));
    this.lastRaiseSize = this.bigBlind;
    this.lastAction = { seat: bbSeat, type: "bigBlind", amount: this.committed[bbSeat] };
    this.toAct = this.button;

    return this.streetComplete() ? this.endStreet() : null;
  }

  private legalFor(seat: Seat): LegalActions {
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
    return this.acted[0] && this.acted[1] && this.committed[0] === this.committed[1];
  }

  private endStreet(): HandSummary | null {
    if (this.committed[0] !== this.committed[1]) {
      const hi: Seat = this.committed[0] > this.committed[1] ? 0 : 1;
      const lo = other(hi);
      if (this.stacks[lo] === 0) {
        const diff = this.committed[hi] - this.committed[lo];
        this.committed[hi] -= diff;
        this.stacks[hi] += diff;
      }
    }
    this.pot += this.committed[0] + this.committed[1];
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.lastRaiseSize = this.bigBlind;

    if (this.stacks[0] === 0 || this.stacks[1] === 0) {
      while (this.board.length < 5) this.dealNext();
      return this.showdown();
    }
    if (this.phase === "river") return this.showdown();
    this.dealNext();
    this.toAct = other(this.button);
    return null;
  }

  private dealNext(): void {
    const d = this.deck;
    if (this.board.length === 0) {
      this.board.push(d[5], d[6], d[7]);
      this.phase = "flop";
    } else if (this.board.length === 3) {
      this.board.push(d[9]);
      this.phase = "turn";
    } else if (this.board.length === 4) {
      this.board.push(d[11]);
      this.phase = "river";
    }
  }

  private showdown(): HandSummary {
    const hands = {
      0: bestHand([...this.hole[0], ...this.board]),
      1: bestHand([...this.hole[1], ...this.board]),
    };
    const cmp = compareHands(hands[0], hands[1]);
    const total = this.pot;
    const potWon = pair(0, 0);
    let winners: Seat[];
    if (cmp > 0) {
      potWon[0] = total;
      winners = [0];
    } else if (cmp < 0) {
      potWon[1] = total;
      winners = [1];
    } else {
      const half = Math.floor(total / 2);
      potWon[0] = half;
      potWon[1] = half;
      potWon[other(this.button)] += total - 2 * half;
      winners = [0, 1];
    }
    return this.finishHand({ reason: "showdown", winners, potWon, hands });
  }

  private finishFold(folder: Seat): HandSummary {
    const win = other(folder);
    const potWon = pair(0, 0);
    potWon[win] = this.pot + this.committed[0] + this.committed[1];
    this.pot = 0;
    this.committed = pair(0, 0);
    this.lastAction = { seat: folder, type: "fold", amount: 0 };
    return this.finishHand({ reason: "fold", winners: [win], potWon, hands: null });
  }

  private finishHand(result: HandResult): HandSummary {
    this.stacks[0] += result.potWon[0];
    this.stacks[1] += result.potWon[1];
    this.pot = 0;
    this.committed = pair(0, 0);
    this.acted = pair(false, false);
    this.result = result;
    this.toAct = null;
    const busted = SEATS.find((s) => this.stacks[s] === 0);
    if (busted !== undefined) {
      this.phase = "gameOver";
      this.winner = other(busted);
    } else {
      this.phase = "handOver";
    }
    return {
      handNumber: this.handNumber,
      result,
      stacks: { ...this.stacks },
      gameOver: this.phase === "gameOver",
      winner: this.winner,
    };
  }
}
