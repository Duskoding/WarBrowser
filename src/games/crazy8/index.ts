import type { GameModule } from "../GameModule.ts";
import { cardName, isSuit, parseCard, suitName, type Suit } from "../shared/cards.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel, whoFor } from "../shared/view.ts";
import {
  CrazyEightsEngine,
  type CrazyEightsAction,
  type CrazyEightsOptions,
  type CrazyEightsResult,
  type CrazyEightsState,
} from "./CrazyEightsEngine.ts";

export function buildCrazyEightsPrompt(seat: number, state: CrazyEightsState, over: boolean): string {
  const play = state.lastPlay!;
  const text = over
    ? `${playerLabel(seat)} played the ${cardName(play.card!)}, their last card, and wins.`
    : `${playerLabel(seat)} played a wild 8 and switched the suit to ${suitName(state.suit)}.`;
  return `${COMMENTARY_INTRO} Crazy Eights: ${text}`;
}

export const crazy8: GameModule<CrazyEightsState, CrazyEightsAction, CrazyEightsResult> = {
  id: "crazy8",
  name: "Crazy Eights",
  description: "Match the suit or rank. Eights are wild. First to empty their hand wins.",
  players: { min: 2, max: 2 },

  createEngine(context) {
    return new CrazyEightsEngine(context.options as CrazyEightsOptions);
  },

  handleAction(engine, seat, payload, context) {
    let action: CrazyEightsAction;
    if (payload.kind === "play") {
      const card = parseCard(payload.card);
      if (!card) return { ok: false, error: "Pick a card from your hand." };
      if (payload.suit !== undefined && !isSuit(payload.suit)) return { ok: false, error: "Name a suit for your 8." };
      action = { kind: "play", card, suit: payload.suit as Suit | undefined };
    } else if (payload.kind === "draw" || payload.kind === "pass") {
      action = { kind: payload.kind };
    } else {
      return null;
    }
    const result = engine.apply(seat, action);
    if (!result.ok) return { ok: false, error: result.error };
    const state = engine.getState(seat);
    const playedEight = action.kind === "play" && action.card.rank === 8;
    // Commentary only for a wild 8 or the winning card.
    const ended = !!result.finished && action.kind === "play";
    if (!playedEight && !ended) return { ok: true, finished: result.finished };
    return {
      ok: true,
      finished: result.finished,
      commentary: { round: state.plays, text: context.commentator.describe(buildCrazyEightsPrompt(seat, state, ended)) },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    const last = state.lastPlay;
    return {
      yourHand: state.yourHand,
      playable: state.playable,
      opponentCount: state.opponentCount,
      top: state.top,
      suit: state.suit,
      stockCount: state.stockCount,
      yourTurn: state.yourTurn,
      canDraw: state.canDraw,
      canPass: state.canPass,
      // What the other player did is public; which card they drew is not.
      lastPlay: last && { who: whoFor(seat, last.seat), card: last.card, suit: last.suit, drew: last.drew, passed: last.passed },
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { CrazyEightsEngine };
export type { CrazyEightsState, CrazyEightsAction, CrazyEightsResult };
