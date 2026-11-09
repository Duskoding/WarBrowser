import type { Mark } from "./types.ts";

export function buildTicTacToePrompt(opts: {
  seat: number;
  cell: number;
  mark: Mark;
  over: boolean;
  winner: number | null;
  moveNumber: number;
}): string {
  const square = opts.cell + 1;
  const who = `Player ${opts.seat + 1} (${opts.mark})`;
  let result = `${who} played in square ${square}.`;
  if (opts.over) {
    result +=
      opts.winner === null
        ? " The game ended in a draw."
        : ` Player ${opts.winner + 1} won the game.`;
  }
  return [
    "You are a lively sports commentator for a friendly browser board game.",
    "Write exactly one short sentence (maximum 24 words) describing this Tic-Tac-Toe move.",
    "Do not mention being an AI, the prompt, or hidden information.",
    `Move ${opts.moveNumber}. ${result}`,
  ].join(" ");
}
