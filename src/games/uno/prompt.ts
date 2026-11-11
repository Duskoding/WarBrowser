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
  action: "play" | "draw" | "uno" | "catch";
  card?: Card;
  caught?: number; // the seat caught without calling UNO, for "catch"
  drew?: number; // cards drawn, when more than one (a stacked penalty)
  over: boolean;
  winner: number | null;
  round: number;
}): string {
  const who = `Player ${opts.seat + 1}`;
  let result: string;
  if (opts.action === "draw") {
    result = opts.drew && opts.drew > 1 ? `${who} had to draw ${opts.drew} cards from stacked draw cards.` : `${who} drew a card.`;
  }
  else if (opts.action === "uno") result = `${who} called UNO, down to their last card.`;
  else if (opts.action === "catch") {
    result = `${who} caught Player ${(opts.caught ?? -1) + 1} forgetting to call UNO; they draw two cards.`;
  } else result = `${who} played the ${cardName(opts.card!)}.`;
  if (opts.over) result += ` Player ${(opts.winner ?? -1) + 1} won the game.`;
  return [
    "You are a lively sports commentator for a friendly browser card game.",
    "Write exactly one short sentence (maximum 24 words) describing this Uno move.",
    "Do not mention being an AI, the prompt, or hidden information.",
    `Move ${opts.round}. ${result}`,
  ].join(" ");
}
