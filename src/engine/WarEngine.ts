import type {
  Card,
  FlipResult,
  GameState,
  LastRound,
  Phase,
  PlayerId,
  Rank,
  RoundSummary,
  StakeCard,
  Suit,
  WarEngineOptions,
} from './types.ts';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const WAR_BURN = 3;

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

const other = (p: PlayerId): PlayerId => (p === 'A' ? 'B' : 'A');

type InternalStake = { card: Card; faceUp: boolean };

export class WarEngine {
  private piles: Record<PlayerId, Card[]> = { A: [], B: [] };
  private pot: Card[] = [];
  private stakes: Record<PlayerId, InternalStake[]> = { A: [], B: [] };
  private flipped: Record<PlayerId, Card | null> = { A: null, B: null };
  private phase: Phase = 'waiting';
  private round = 0;
  private winner: PlayerId | null = null;
  private inWar = false;
  private tied: Array<Record<PlayerId, Card>> = [];
  private lastRound: LastRound | null = null;
  private readonly shuffle: <T>(items: T[]) => T[];
  private readonly maxRounds: number | undefined;

  constructor(opts: WarEngineOptions = {}) {
    this.shuffle = opts.shuffle ?? fisherYates;
    this.maxRounds = opts.maxRounds;
    const deck = this.shuffle(createDeck());
    this.piles.A = deck.slice(0, 26);
    this.piles.B = deck.slice(26);
  }

  flip(playerId: PlayerId): FlipResult {
    if (this.phase === 'gameOver') return { ok: false, error: 'Game is over' };

    if (this.phase === 'roundOver') {
      this.flipped = { A: null, B: null };
      this.stakes = { A: [], B: [] };
      this.lastRound = null;
      this.phase = 'waiting';
    } else if (this.phase === 'war') {
      // New deciding flip; keep the lineup (ties + burns).
      this.flipped = { A: null, B: null };
      this.phase = 'waiting';
    }

    if (this.flipped[playerId]) return { ok: false, error: 'You already flipped this round' };

    const card = this.piles[playerId].shift();
    if (!card) return { ok: false, error: 'No cards left to flip' };
    this.flipped[playerId] = card;
    if (this.inWar) this.stakes[playerId].push({ card, faceUp: true });

    if (!this.flipped[other(playerId)]) {
      this.phase = 'flipped';
      return { ok: true, resolved: false };
    }
    return this.resolve();
  }

  getState(playerId: PlayerId): GameState {
    return {
      yourCard: this.flipped[playerId],
      opponentCard: this.flipped[other(playerId)],
      pile: this.pot.length,
      scoreA: this.piles.A.length,
      scoreB: this.piles.B.length,
      phase: this.phase,
      round: this.round,
      winner: this.winner,
      inWar: this.inWar,
      warCards: this.tied.map((pair) => ({ yours: pair[playerId], opponent: pair[other(playerId)] })),
      yourStakes: this.toStakeView(this.stakes[playerId]),
      opponentStakes: this.toStakeView(this.stakes[other(playerId)]),
      lastRound: this.lastRound,
    };
  }

  private toStakeView(stakes: InternalStake[]): StakeCard[] {
    return stakes.map((s) => (s.faceUp ? { faceUp: true, card: s.card } : { faceUp: false }));
  }

  private resolve(): FlipResult {
    const cardA = this.flipped.A!;
    const cardB = this.flipped.B!;
    this.pot.push(cardA, cardB);

    if (cardA.rank === cardB.rank) {
      this.tied.push({ A: cardA, B: cardB });
      const loser = this.startWar();
      if (loser === undefined) {
        return { ok: true, resolved: false };
      }
      return this.finishRound(cardA, cardB, loser === 'draw' ? null : other(loser), true);
    }

    const winner: PlayerId = cardA.rank > cardB.rank ? 'A' : 'B';
    return this.finishRound(cardA, cardB, winner, this.inWar);
  }

  // Burns face-down cards after a tie. Returns undefined if the war continues,
  // or the player who is out of cards ('draw' if both are).
  private startWar(): PlayerId | 'draw' | undefined {
    this.inWar = true;
    // First war only: seed the lineup with the tied face-up cards.
    // Chained ties already pushed their battle cards on flip.
    if (this.stakes.A.length === 0 && this.stakes.B.length === 0) {
      for (const p of ['A', 'B'] as PlayerId[]) {
        const tied = this.flipped[p];
        if (tied) this.stakes[p].push({ card: tied, faceUp: true });
      }
    }

    const emptyA = this.piles.A.length === 0;
    const emptyB = this.piles.B.length === 0;
    if (emptyA && emptyB) return 'draw';
    if (emptyA) return 'A';
    if (emptyB) return 'B';

    for (const p of ['A', 'B'] as PlayerId[]) {
      const burn = Math.min(WAR_BURN, this.piles[p].length - 1);
      const burned = this.piles[p].splice(0, burn);
      this.pot.push(...burned);
      for (const card of burned) {
        this.stakes[p].push({ card, faceUp: false });
      }
    }
    this.flipped = { A: null, B: null };
    this.phase = 'war';
    return undefined;
  }

  private finishRound(
    cardA: Card,
    cardB: Card,
    winner: PlayerId | null,
    wasWar: boolean,
  ): FlipResult {
    const cardsWon = winner ? this.pot.length : 0;
    if (winner) this.piles[winner].push(...this.shuffle(this.pot));
    this.pot = [];
    this.tied = [];
    this.inWar = false;
    this.lastRound = { wasWar, winner, cardsWon };
    this.round++;

    if (wasWar) {
      // Reveal every face-down burn so both players see what was under there.
      for (const p of ['A', 'B'] as PlayerId[]) {
        for (const s of this.stakes[p]) s.faceUp = true;
      }
    } else {
      this.stakes = { A: [], B: [] };
    }

    // Keep the deciding faces up for the client reveal beat.
    this.flipped = { A: cardA, B: cardB };

    const over = this.checkGameOver();
    this.phase = over ? 'gameOver' : 'roundOver';

    const summary: RoundSummary = {
      round: this.round,
      cardA,
      cardB,
      winner,
      wasWar,
      scoreA: this.piles.A.length,
      scoreB: this.piles.B.length,
      gameOver: over,
    };
    return { ok: true, resolved: true, summary };
  }

  private checkGameOver(): boolean {
    const a = this.piles.A.length;
    const b = this.piles.B.length;
    if (a === 0 || b === 0) {
      this.winner = a === b ? null : a === 0 ? 'B' : 'A';
      return true;
    }
    if (this.maxRounds !== undefined && this.round >= this.maxRounds) {
      this.winner = a === b ? null : a > b ? 'A' : 'B';
      return true;
    }
    return false;
  }
}
