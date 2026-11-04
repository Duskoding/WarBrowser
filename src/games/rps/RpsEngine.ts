import type { GameEngine } from "../../engine/GameEngine.ts";

// Rock-Paper-Scissors uses War's simultaneous reveal: both players choose,
// nothing is shown until both have, then the round resolves.

export type Choice = "rock" | "paper" | "scissors";
export const CHOICES: Choice[] = ["rock", "paper", "scissors"];
const BEATS: Record<Choice, Choice> = { rock: "scissors", paper: "rock", scissors: "paper" };

export const WINS_NEEDED = 3;

export type RpsAction = { kind: "pick"; choice: Choice };

export interface RpsRound {
  round: number;
  picks: [Choice, Choice]; // by seat
  winner: number | null; // seat, or null for a tie
}

export type RpsResult =
  | { ok: false; error: string }
  | { ok: true; resolved?: RpsRound; finished?: { winner: number | null } };

export interface RpsState {
  round: number; // the round being played (1-based)
  yourPick: Choice | null;
  opponentPicked: boolean; // whether they've picked, never what
  yourScore: number;
  opponentScore: number;
  lastRound: RpsRound | null;
  winner: number | null;
  over: boolean;
}

export const isChoice = (value: unknown): value is Choice => CHOICES.includes(value as Choice);

export class RpsEngine implements GameEngine<RpsState, RpsAction, RpsResult> {
  private picks: [Choice | null, Choice | null] = [null, null];
  private scores: [number, number] = [0, 0];
  private round = 1;
  private lastRound: RpsRound | null = null;
  private winner: number | null = null;
  private over = false;

  apply(seat: number, action: RpsAction): RpsResult {
    if (action.kind !== "pick") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (!isChoice(action.choice)) return { ok: false, error: "Pick rock, paper or scissors." };
    if (this.picks[seat]) return { ok: false, error: "You already picked this round." };

    this.picks[seat] = action.choice;
    const [a, b] = this.picks;
    if (!a || !b) return { ok: true };

    const winner = a === b ? null : BEATS[a] === b ? 0 : 1;
    if (winner !== null) this.scores[winner]++;
    const resolved: RpsRound = { round: this.round, picks: [a, b], winner };
    this.lastRound = resolved;
    this.picks = [null, null];
    this.round++;

    if (winner !== null && this.scores[winner] >= WINS_NEEDED) {
      this.over = true;
      this.winner = winner;
      return { ok: true, resolved, finished: { winner } };
    }
    return { ok: true, resolved };
  }

  getState(seat: number): RpsState {
    return {
      round: this.round,
      yourPick: this.picks[seat],
      opponentPicked: this.picks[1 - seat] !== null,
      yourScore: this.scores[seat],
      opponentScore: this.scores[1 - seat],
      lastRound: this.lastRound,
      winner: this.winner,
      over: this.over,
    };
  }
}
