import type { GameModule, PlayerInfo } from "../GameModule.ts";
import { RpsEngine } from "./RpsEngine.ts";
import type { RpsAction, RpsChoice, RpsResult, RpsState } from "./types.ts";

function toWinner(winner: number | null, seat: number): "you" | "opponent" | "draw" | undefined {
  if (winner === null) return "draw";
  return winner === seat ? "you" : "opponent";
}

export const rps: GameModule<RpsState, RpsAction, RpsResult> = {
  id: "rps",
  name: "Rock-Paper-Scissors",
  description: "Choose rock, paper, or scissors. First to three round wins takes the match.",
  players: { min: 2, max: 2 },
  rules: [
    "Each round, both players secretly pick rock, paper or scissors.",
    "Rock beats scissors, scissors beats paper, and paper beats rock. The same pick is a tie and nobody scores.",
    "Both picks are shown once both players have chosen.",
    "The first player to win three rounds wins the match.",
  ],

  createEngine() {
    return new RpsEngine();
  },

  handleAction(engine, seat, payload) {
    if (payload.kind !== "pick") return null;
    if (typeof payload.choice !== "string" || !["rock", "paper", "scissors"].includes(payload.choice)) {
      return { ok: false, error: "Pick rock, paper, or scissors." };
    }
    return engine.apply(seat, { kind: "pick", choice: payload.choice as RpsChoice });
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    return {
      yourChoice: state.yourChoice,
      opponentChoice: state.opponentChoice,
      yourScore: state.yourScore,
      opponentScore: state.opponentScore,
      round: state.round,
      phase: state.phase,
      lastRound: state.lastRound && {
        winner: toWinner(state.lastRound.winner, seat),
        yourChoice: state.lastRound.choices[0],
        opponentChoice: state.lastRound.choices[1],
      },
      winner:
        state.phase !== "gameOver" ? undefined : toWinner(state.winner, seat),
      yourName: players[seat]?.username,
      opponentName: players[1 - seat]?.username,
    };
  },
};

export type { RpsAction, RpsChoice, RpsResult, RpsState };
export { RpsEngine } from "./RpsEngine.ts";
