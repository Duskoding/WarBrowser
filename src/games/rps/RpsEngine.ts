import type { GameEngine } from "../../engine/GameEngine.ts";
import type {
  RpsAction,
  RpsChoice,
  RpsLastRound,
  RpsResult,
  RpsState,
} from "./types.ts";

const CHOICES: readonly RpsChoice[] = ["rock", "paper", "scissors"];

function other(seat: number): 0 | 1 {
  return (1 - seat) as 0 | 1;
}

function beats(a: RpsChoice, b: RpsChoice): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  );
}

export class RpsEngine implements GameEngine<RpsState, RpsAction, RpsResult> {
  private choices: [RpsChoice | null, RpsChoice | null] = [null, null];
  private scores: [number, number] = [0, 0];
  private phase: RpsState["phase"] = "waiting";
  private round = 0;
  private winner: number | null = null;
  private lastRound: RpsLastRound | null = null;

  apply(seat: number, action: RpsAction): RpsResult {
    if (action.kind !== "pick") return { ok: false, error: "Unknown action" };
    if (seat !== 0 && seat !== 1) return { ok: false, error: "Invalid seat" };
    if (!CHOICES.includes(action.choice)) return { ok: false, error: "Invalid choice" };
    if (this.phase === "gameOver") return { ok: false, error: "Game is over" };

    if (this.phase === "roundOver") {
      this.choices = [null, null];
      this.lastRound = null;
      this.phase = "waiting";
    }

    if (this.choices[seat]) return { ok: false, error: "You already picked this round" };
    this.choices[seat] = action.choice;

    if (this.choices[other(seat)] === null) {
      this.phase = "picked";
      return { ok: true, resolved: false };
    }

    return this.resolve();
  }

  getState(seat: number): RpsState {
    const mine = seat as 0 | 1;
    const theirs = other(mine);
    const bothPicked = this.choices[0] !== null && this.choices[1] !== null;
    return {
      yourChoice: this.choices[mine],
      opponentChoice: bothPicked ? this.choices[theirs] : null,
      yourScore: this.scores[mine],
      opponentScore: this.scores[theirs],
      round: this.round,
      phase: this.phase,
      winner: this.winner,
      lastRound:
        this.lastRound === null
          ? null
          : {
              winner: this.lastRound.winner,
              choices: [this.lastRound.choices[mine], this.lastRound.choices[theirs]],
            },
    };
  }

  private resolve(): RpsResult {
    const choice0 = this.choices[0]!;
    const choice1 = this.choices[1]!;
    const winner = choice0 === choice1 ? null : beats(choice0, choice1) ? 0 : 1;
    if (winner !== null) this.scores[winner]++;
    this.round++;
    this.lastRound = { winner, choices: [choice0, choice1] };

    const gameOver = this.scores[0] === 3 || this.scores[1] === 3;
    if (gameOver) this.winner = this.scores[0] === 3 ? 0 : 1;
    this.phase = gameOver ? "gameOver" : "roundOver";

    const summary = {
      round: this.round,
      choices: [choice0, choice1] as [RpsChoice, RpsChoice],
      winner,
      score0: this.scores[0],
      score1: this.scores[1],
      gameOver,
    };
    return {
      ok: true,
      resolved: true,
      summary,
      finished: gameOver ? { winner: this.winner! } : undefined,
    };
  }
}
