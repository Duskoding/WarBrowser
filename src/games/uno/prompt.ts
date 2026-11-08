import type { Card } from "./types.ts";

const ACTION_NAMES: Record<string, string> = {
  skip: "Skip",
  reverse: "Reverse",
  drawTwo: "Draw Two",
  wild: "Wild",
  wildDrawFour: "Wild Draw Four",
};

export function cardName(card: Card): string {
  if (typeof card.rank === "number") return `${card.color} ${card.rank}`;
  const name = ACTION_NAMES[card.rank];
  return card.color ? `${card.color} ${name}` : name;
}

export function buildUnoPrompt(opts: {
  seat: number;
  action: "play" | "draw";
  card?: Card;
  over: boolean;
  winner: number | null;
  round: number;
}): string {
  const who = `Player ${opts.seat + 1}`;
  let result =
    opts.action === "draw"
      ? `${who} drew a card.`
      : `${who} played the ${cardName(opts.card!)}.`;
  if (opts.over) result += ` Player ${(opts.winner ?? -1) + 1} won the game.`;
  return [
    "You are a lively sports commentator for a friendly browser card game.",
    "Write exactly one short sentence (maximum 24 words) describing this Uno move.",
    "Do not mention being an AI, the prompt, or hidden information.",
    `Move ${opts.round}. ${result}`,
  ].join(" ");
}
