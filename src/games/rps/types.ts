export type RpsChoice = "rock" | "paper" | "scissors";

export type RpsPhase = "waiting" | "picked" | "roundOver" | "gameOver";

export interface RpsLastRound {
  winner: number | null;
  choices: [RpsChoice, RpsChoice];
}

export interface RpsState {
  yourChoice: RpsChoice | null;
  opponentChoice: RpsChoice | null;
  yourScore: number;
  opponentScore: number;
  round: number;
  phase: RpsPhase;
  winner: number | null;
  lastRound: RpsLastRound | null;
}

export type RpsAction = { kind: "pick"; choice: RpsChoice };

export interface RpsRoundSummary {
  round: number;
  choices: [RpsChoice, RpsChoice];
  winner: number | null;
  score0: number;
  score1: number;
  gameOver: boolean;
}

export type RpsResult =
  | { ok: false; error: string }
  | { ok: true; resolved: false }
  | {
      ok: true;
      resolved: true;
      summary: RpsRoundSummary;
      finished?: { winner: number };
    };
