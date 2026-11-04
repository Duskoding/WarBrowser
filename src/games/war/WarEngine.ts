import type { GameEngine } from "../../engine/GameEngine.ts";
import type {
  Card,
  LastRound,
  Phase,
  Rank,
  RoundSummary,
  StakeCard,
  Suit,
  WarAction,
  WarEngineOptions,
  WarResult,
  WarState,
} from "./types.ts";

const SUITS: Suit[] = ["S", "H", "D", "C"];
const WAR_BURN = 3;
const other = (seat: number) => 1 - seat;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank: rank as Rank, suit });
  }
  return deck;
}

export function fisherYates<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type InternalStake = { card: Card; faceUp: boolean };

export class WarEngine implements GameEngine<WarState, WarAction, WarResult> {
  private piles: [Card[], Card[]] = [[], []];
  private pot: Card[] = [];
  private stakes: [InternalStake[], InternalStake[]] = [[], []];
  private flipped: [Card | null, Card | null] = [null, null];
  private phase: Phase = "waiting";
  private round = 0;
  private winner: number | null = null;
  private inWar = false;
  private tied: Array<[Card, Card]> = [];
  private lastRound: LastRound | null = null;
  private readonly shuffle: <T>(items: T[]) => T[];
  private readonly maxRounds: number | undefined;

  constructor(opts: WarEngineOptions = {}) {
    this.shuffle = opts.shuffle ?? fisherYates;
    this.maxRounds = opts.maxRounds;
    const deck = this.shuffle(createDeck());
    this.piles[0] = deck.slice(0, 26);
    this.piles[1] = deck.slice(26);
  }

  apply(seat: number, action: WarAction): WarResult {
    if (action.kind !== "flip") return { ok: false, error: "Unknown action" };
    if (seat !== 0 && seat !== 1) return { ok: false, error: "Invalid seat" };
    return this.flip(seat);
  }

  getState(seat: number): WarState {
    const mine = seat as 0 | 1;
    const theirs = other(mine) as 0 | 1;
    return {
      yourCard: this.flipped[mine],
      opponentCard: this.flipped[theirs],
      pile: this.pot.length,
      yourCount: this.piles[mine].length,
      opponentCount: this.piles[theirs].length,
      phase: this.phase,
      round: this.round,
      winner: this.winner,
      inWar: this.inWar,
      warCards: this.tied.map((pair) => ({ yours: pair[mine], opponent: pair[theirs] })),
      yourStakes: this.toStakeView(this.stakes[mine]),
      opponentStakes: this.toStakeView(this.stakes[theirs]),
      lastRound: this.lastRound,
    };
  }

  private flip(seat: 0 | 1): WarResult {
    if (this.phase === "gameOver") return { ok: false, error: "Game is over" };

    if (this.phase === "roundOver") {
      this.flipped = [null, null];
      this.stakes = [[], []];
      this.lastRound = null;
      this.phase = "waiting";
    } else if (this.phase === "war") {
      // New deciding flip; keep the lineup (ties + burns).
      this.flipped = [null, null];
      this.phase = "waiting";
    }

    if (this.flipped[seat]) return { ok: false, error: "You already flipped this round" };

    const card = this.piles[seat].shift();
    if (!card) return { ok: false, error: "No cards left to flip" };
    this.flipped[seat] = card;
    if (this.inWar) this.stakes[seat].push({ card, faceUp: true });

    if (!this.flipped[other(seat)]) {
      this.phase = "flipped";
      return { ok: true, resolved: false };
    }
    return this.resolve();
  }

  private toStakeView(stakes: InternalStake[]): StakeCard[] {
    return stakes.map((s) => (s.faceUp ? { faceUp: true, card: s.card } : { faceUp: false }));
  }

  private resolve(): WarResult {
    const card0 = this.flipped[0]!;
    const card1 = this.flipped[1]!;
    this.pot.push(card0, card1);

    if (card0.rank === card1.rank) {
      this.tied.push([card0, card1]);
      const loser = this.startWar();
      if (loser === undefined) {
        return { ok: true, resolved: false };
      }
      return this.finishRound(card0, card1, loser === "draw" ? null : other(loser), true);
    }

    const winner = card0.rank > card1.rank ? 0 : 1;
    return this.finishRound(card0, card1, winner, this.inWar);
  }

  // Burns face-down cards after a tie. Returns undefined if the war continues,
  // or the seat who is out of cards ('draw' if both are).
  private startWar(): number | "draw" | undefined {
    this.inWar = true;
    // First war only: seed the lineup with the tied face-up cards.
    // Chained ties already pushed their battle cards on flip.
    if (this.stakes[0].length === 0 && this.stakes[1].length === 0) {
      for (const p of [0, 1] as const) {
        const tied = this.flipped[p];
        if (tied) this.stakes[p].push({ card: tied, faceUp: true });
      }
    }

    const empty0 = this.piles[0].length === 0;
    const empty1 = this.piles[1].length === 0;
    if (empty0 && empty1) return "draw";
    if (empty0) return 0;
    if (empty1) return 1;

    for (const p of [0, 1] as const) {
      const burn = Math.min(WAR_BURN, this.piles[p].length - 1);
      const burned = this.piles[p].splice(0, burn);
      this.pot.push(...burned);
      for (const card of burned) {
        this.stakes[p].push({ card, faceUp: false });
      }
    }
    this.flipped = [null, null];
    this.phase = "war";
    return undefined;
  }

  private finishRound(
    card0: Card,
    card1: Card,
    winner: number | null,
    wasWar: boolean,
  ): WarResult {
    const cardsWon = winner !== null ? this.pot.length : 0;
    if (winner !== null) this.piles[winner as 0 | 1].push(...this.shuffle(this.pot));
    this.pot = [];
    this.tied = [];
    this.inWar = false;
    this.lastRound = { wasWar, winner, cardsWon };
    this.round++;

    if (wasWar) {
      // Reveal every face-down burn so both players see what was under there.
      for (const p of [0, 1] as const) {
        for (const s of this.stakes[p]) s.faceUp = true;
      }
    } else {
      this.stakes = [[], []];
    }

    // Keep the deciding faces up for the client reveal beat.
    this.flipped = [card0, card1];

    const over = this.checkGameOver();
    this.phase = over ? "gameOver" : "roundOver";

    const summary: RoundSummary = {
      round: this.round,
      card0,
      card1,
      winner,
      wasWar,
      score0: this.piles[0].length,
      score1: this.piles[1].length,
      gameOver: over,
    };
    return {
      ok: true,
      resolved: true,
      summary,
      finished: over ? { winner: this.winner } : undefined,
    };
  }

  private checkGameOver(): boolean {
    const a = this.piles[0].length;
    const b = this.piles[1].length;
    if (a === 0 || b === 0) {
      this.winner = a === b ? null : a === 0 ? 1 : 0;
      return true;
    }
    if (this.maxRounds !== undefined && this.round >= this.maxRounds) {
      this.winner = a === b ? null : a > b ? 0 : 1;
      return true;
    }
    return false;
  }
}
