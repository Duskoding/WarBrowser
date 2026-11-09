import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel, whoFor } from "../shared/view.ts";
import {
  GoofspielEngine,
  type GoofspielAction,
  type GoofspielOptions,
  type GoofspielResult,
  type GoofspielRound,
  type GoofspielState,
} from "./GoofspielEngine.ts";

const valueName = (v: number) => ({ 1: "Ace", 11: "Jack", 12: "Queen", 13: "King" })[v] ?? String(v);

export function buildGoofspielPrompt(round: GoofspielRound, score: [number, number], over: boolean): string {
  const prize = round.prizes.map(valueName).join(" + ");
  let result =
    round.winner === null
      ? "The bids tied, so the prize stays on the table for next round."
      : `${playerLabel(round.winner)} takes the ${prize}.`;
  result += ` Score ${score[0]}-${score[1]}.`;
  if (over) {
    result += score[0] === score[1] ? " The game ends in a draw." : ` ${playerLabel(score[0] > score[1] ? 0 : 1)} wins the game.`;
  }
  return `${COMMENTARY_INTRO} Goofspiel, a card-bidding game, round ${round.round} of 13: the prize was the ${prize}. Player 1 bid ${valueName(round.bids[0])}, Player 2 bid ${valueName(round.bids[1])}. ${result}`;
}

export const goofspiel: GameModule<GoofspielState, GoofspielAction, GoofspielResult> = {
  id: "goofspiel",
  name: "Goofspiel",
  description: "Secretly bid a card for each prize. Most prize points after 13 rounds wins.",
  players: { min: 2, max: 2 },

  createEngine(context) {
    return new GoofspielEngine(context.options as GoofspielOptions);
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "bid") return null;
    if (!Number.isInteger(payload.value)) return { ok: false, error: "Bid a card from your hand." };
    const result = engine.apply(seat, { kind: "bid", value: payload.value as number });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.resolved) return { ok: true };
    const state = engine.getState(0);
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: result.resolved.round,
        text: context.commentator.describe(
          buildGoofspielPrompt(result.resolved, [state.yourScore, state.opponentScore], state.over),
        ),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    const last = state.lastRound;
    return {
      round: state.round,
      prize: state.prize,
      carried: state.carried,
      yourHand: state.yourHand,
      yourBid: state.yourBid,
      opponentBid: state.opponentBid,
      yourScore: state.yourScore,
      opponentScore: state.opponentScore,
      prizesLeft: state.prizesLeft,
      // Seat 0 bids with spades, seat 1 with hearts.
      yourSuit: seat === 0 ? "S" : "H",
      lastRound: last && {
        round: last.round,
        yours: last.bids[seat],
        theirs: last.bids[1 - seat],
        prizes: last.prizes,
        winner: whoFor(seat, last.winner),
      },
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { GoofspielEngine };
export type { GoofspielState, GoofspielAction, GoofspielResult };
