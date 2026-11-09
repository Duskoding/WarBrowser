import type { GameModule } from "../GameModule.ts";
import { isRank, rankName, type Rank } from "../shared/cards.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel, whoFor } from "../shared/view.ts";
import {
  GoFishEngine,
  type Ask,
  type GoFishAction,
  type GoFishOptions,
  type GoFishResult,
  type GoFishState,
} from "./GoFishEngine.ts";

const plural = (rank: Rank) => (rank === 6 ? "Sixes" : `${rankName(rank)}s`);

export function buildGoFishPrompt(ask: Ask, books: [number, number], over: boolean): string {
  let text = `${playerLabel(ask.seat)} completed a book of four ${plural(ask.book!)}. Books ${books[0]}-${books[1]}.`;
  if (over) {
    const [a, b] = books;
    text += a === b ? " The game ends in a draw." : ` ${playerLabel(a > b ? 0 : 1)} wins the game.`;
  }
  return `${COMMENTARY_INTRO} Go Fish: ${text}`;
}

export const gofish: GameModule<GoFishState, GoFishAction, GoFishResult> = {
  id: "gofish",
  name: "Go Fish",
  description: "Ask for ranks to collect books of four. Most books wins.",
  players: { min: 2, max: 2 },

  createEngine(context) {
    return new GoFishEngine(context.options as GoFishOptions);
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "ask") return null;
    if (!isRank(payload.rank)) return { ok: false, error: "Ask for a rank you hold." };
    const result = engine.apply(seat, { kind: "ask", rank: payload.rank });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.ask.book) return { ok: true, finished: result.finished };
    // Commentary only when a book is made.
    const state = engine.getState(seat);
    const books: [number, number] = seat === 0
      ? [state.yourBooks.length, state.opponentBooks.length]
      : [state.opponentBooks.length, state.yourBooks.length];
    return {
      ok: true,
      finished: result.finished,
      commentary: { round: state.asks, text: context.commentator.describe(buildGoFishPrompt(result.ask, books, state.over)) },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    const last = state.lastAsk;
    return {
      yourHand: state.yourHand,
      opponentCount: state.opponentCount,
      stockCount: state.stockCount,
      yourBooks: state.yourBooks,
      opponentBooks: state.opponentBooks,
      yourTurn: state.yourTurn,
      lastAsk: last && {
        who: whoFor(seat, last.seat),
        rank: last.rank,
        got: last.got,
        drew: last.drew, // present only for the player who drew it
        lucky: last.lucky,
        book: last.book,
      },
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { GoFishEngine };
export type { GoFishState, GoFishAction, GoFishResult };
