import type { GameModule } from "../GameModule.ts";
import { names, outcomeFor, whoFor } from "../shared/view.ts";
import { NimEngine } from "./NimEngine.ts";
import { buildNimPrompt } from "./prompt.ts";
import type { NimAction, NimResult, NimState } from "./types.ts";

export const nim: GameModule<NimState, NimAction, NimResult> = {
  id: "nim",
  name: "Nim",
  description: "Take stones from one pile. Whoever takes the last stone wins.",
  players: { min: 2, max: 2 },

  createEngine() {
    return new NimEngine();
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "take") return null;
    if (!Number.isInteger(payload.pile) || !Number.isInteger(payload.count)) {
      return { ok: false, error: "Take stones from one pile." };
    }
    const pile = payload.pile as number;
    const count = payload.count as number;
    const result = engine.apply(seat, { kind: "take", pile, count });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.finished) return { ok: true };
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: 1,
        text: context.commentator.describe(buildNimPrompt(seat, pile, count)),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    const last = state.lastTake;
    return {
      piles: state.piles,
      yourTurn: state.yourTurn,
      youFirst: seat === 0,
      lastTake: last && { who: whoFor(seat, last.seat), pile: last.pile, count: last.count },
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { NimEngine };
export type { NimState, NimAction, NimResult };
