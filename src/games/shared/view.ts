import type { PlayerInfo } from "../GameModule.ts";

// Small helpers every two-player game's toView uses, so views read the same
// way in every game: results and turns are relative to the viewer.

export type Outcome = "you" | "opponent" | "draw";

// The match result from `seat`'s point of view, or undefined while playing.
export function outcomeFor(seat: number, over: boolean, winner: number | null): Outcome | undefined {
  if (!over) return undefined;
  if (winner === null) return "draw";
  return winner === seat ? "you" : "opponent";
}

// Who did something (a round winner, the player who moved), relative to `seat`.
export function whoFor(seat: number, actor: number | null): Outcome {
  if (actor === null) return "draw";
  return actor === seat ? "you" : "opponent";
}

export function names(seat: number, players: PlayerInfo[]) {
  return {
    yourName: players[seat]?.username,
    opponentName: players[1 - seat]?.username,
  };
}

// "Player 1" / "Player 2" for commentary prompts (usernames stay out of prompts).
export const playerLabel = (seat: number) => `Player ${seat + 1}`;

export const COMMENTARY_INTRO =
  "You are a lively sports commentator for a friendly browser game. " +
  "Write exactly one short sentence (maximum 24 words). " +
  "Do not mention being an AI, the prompt, or hidden information.";
