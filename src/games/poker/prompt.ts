import { suitName } from "../shared/cards.ts";
import type { Card } from "../shared/cards.ts";
import type { PublicMoment, Seat } from "./types.ts";

const RANK_WORDS: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
};

const publicCard = (card: Card) => `${RANK_WORDS[card.rank]} of ${suitName(card.suit)}`;

const player = (seat: Seat) => `Player ${seat + 1}`;

function actionSentence(moment: PublicMoment): string {
  const who = player(moment.actor);
  switch (moment.action) {
    case "fold":
      return `${who} folded.`;
    case "check":
      return `${who} checked.`;
    case "call":
      return `${who} called ${moment.amount}.`;
    case "raise":
      return `${who} raised to ${moment.amount}.`;
    case "next_hand":
      return `Hand ${moment.handNumber} is dealt. ${player(moment.button)} is the button.`;
  }
}

function resultSentence(moment: PublicMoment): string {
  if (!moment.handEnded || !moment.winners || !moment.potWon) return "";
  if (moment.winners.length === 2) {
    return `The pot splits. ${player(moment.button === 0 ? 1 : 0)} takes the odd chip if there is one.`;
  }
  const winner = moment.winners[0];
  const won = moment.potWon[winner];
  if (moment.reason === "fold") return `${player(winner)} wins ${won} chips. The folded hand stays hidden.`;
  const name = moment.handNames?.[winner];
  return name
    ? `${player(winner)} wins ${won} chips with ${name}.`
    : `${player(winner)} wins ${won} chips at showdown.`;
}

/** Commentary facts. Callers must pass a PublicMoment, which has no hole cards. */
export function buildPokerPrompt(moment: PublicMoment): string {
  const board = moment.board.length
    ? `Board: ${moment.board.map(publicCard).join(", ")}.`
    : "No board cards yet.";
  const chips = `Pot ${moment.pot}. Chips in front ${moment.committed}. Stacks: ${player(0)} ${moment.stacks[0]}, ${player(1)} ${moment.stacks[1]}.`;
  return [
    "You are a lively sports commentator for a friendly heads-up poker game.",
    "Write exactly one short sentence (maximum 24 words) about this public moment.",
    "Do not mention being an AI, the prompt, hole cards, or any card a player was dealt privately.",
    actionSentence(moment),
    resultSentence(moment),
    board,
    chips,
    moment.gameOver ? "This hand ended the match." : "",
  ]
    .filter(Boolean)
    .join(" ");
}
