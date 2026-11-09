import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel } from "../shared/view.ts";
import {
  BattleshipEngine,
  FLEET,
  SIZE,
  type BattleshipAction,
  type BattleshipOptions,
  type BattleshipResult,
  type BattleshipState,
} from "./BattleshipEngine.ts";

export function buildBattleshipPrompt(seat: number, ship: string, won: boolean): string {
  const text = won
    ? `${playerLabel(seat)} sank the last enemy ship, the ${ship}, and wins the battle.`
    : `${playerLabel(seat)} sank the opponent's ${ship}.`;
  return `${COMMENTARY_INTRO} Battleship: ${text}`;
}

export const battleship: GameModule<BattleshipState, BattleshipAction, BattleshipResult> = {
  id: "battleship",
  name: "Battleship",
  description: "Hide your fleet, then take turns firing. Sink every enemy ship to win.",
  players: { min: 2, max: 2 },

  createEngine(context) {
    return new BattleshipEngine(context.options as BattleshipOptions);
  },

  handleAction(engine, seat, payload, context) {
    let action: BattleshipAction;
    if (payload.kind === "shuffle" || payload.kind === "ready") {
      action = { kind: payload.kind };
    } else if (payload.kind === "fire") {
      if (!Number.isInteger(payload.cell)) return { ok: false, error: "Pick a square." };
      action = { kind: "fire", cell: payload.cell as number };
    } else {
      return null;
    }
    const result = engine.apply(seat, action);
    if (!result.ok) return { ok: false, error: result.error };
    // Commentary only when a ship sinks.
    if (result.shot?.result !== "sunk" || !result.shot.ship) return { ok: true, finished: result.finished };
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: engine.getState(seat).shots,
        text: context.commentator.describe(buildBattleshipPrompt(seat, result.shot.ship, !!result.finished)),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    return {
      size: SIZE,
      phase: state.phase,
      yourReady: state.yourReady,
      opponentReady: state.opponentReady,
      yourTurn: state.yourTurn,
      yourShips: state.yourShips,
      incoming: state.incoming,
      outgoing: state.outgoing,
      sunkEnemyShips: state.sunkEnemyShips,
      enemyShipsLeft: state.enemyShipsLeft,
      fleet: FLEET,
      result: outcomeFor(seat, state.phase === "over", state.winner),
      ...names(seat, players),
    };
  },
};

export { BattleshipEngine, randomFleet } from "./BattleshipEngine.ts";
export type { BattleshipState, BattleshipAction, BattleshipResult };
