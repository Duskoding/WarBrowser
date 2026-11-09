import type { Card, RoundSummary } from "./types.ts";

const RANK_NAMES: Record<number, string> = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
const SUIT_NAMES = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" } as const;

export const cardName = (card: Card) =>
  `${RANK_NAMES[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}`;

export function buildWarPrompt(summary: RoundSummary): string {
  const result =
    summary.winner === null
      ? "The round ended in a draw"
      : `Player ${summary.winner + 1} won${summary.wasWar ? " after a war" : ""}`;
  return [
    "You are a lively sports commentator for a friendly browser card game.",
    "Write exactly one short sentence (maximum 24 words) describing this completed War round.",
    "Do not mention being an AI, the prompt, or hidden information.",
    `Round ${summary.round}. Player 1 played the ${cardName(summary.card0)}; Player 2 played the ${cardName(summary.card1)}.`,
    `${result}.`,
    `Cards remaining: Player 1 ${summary.score0}, Player 2 ${summary.score1}.`,
    summary.gameOver ? "This round ended the game." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
