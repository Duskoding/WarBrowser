import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel } from "../shared/view.ts";
import {
  BattleshipEngine,
  FLEET,
  SIZE,
  fleetPlacementError,
  type BattleshipAction,
  type BattleshipOptions,
  type BattleshipResult,
  type BattleshipState,
  type Ship,
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
  players: 2,
  rules: [
    `Each player has a ${SIZE} × ${SIZE} grid and a fleet: ${FLEET.map((s) => `${s.name} (${s.size})`).join(", ")}.`,
    "Drag a ship on your grid to move it, and press Rotate to turn the selected ship. Or press Shuffle to place the fleet at random. Then press Ready. Your opponent never sees your ships.",
    "Once both players are ready, take turns firing one shot at the opponent's grid; the room's host fires first.",
    "A shot is a hit or a miss. A ship sinks when every square of it is hit. Sink the whole fleet to win.",
  ],

  createEngine(context) {
    return new BattleshipEngine(context.options as BattleshipOptions);
  },

  handleAction(engine, seat, payload, context) {
    let action: BattleshipAction;
    if (payload.kind === "shuffle" || payload.kind === "ready") {
      action = { kind: payload.kind };
    } else if (payload.kind === "place") {
      const ships = readFleet(payload.ships);
      if (typeof ships === "string") return { ok: false, error: ships };
      action = { kind: "place", ships };
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

function readFleet(value: unknown): Ship[] | string {
  if (!Array.isArray(value)) return "Place every ship.";
  const ships: Ship[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return "Place every ship.";
    const { name, cells } = item as { name?: unknown; cells?: unknown };
    if (typeof name !== "string" || !Array.isArray(cells) || !cells.every((cell) => Number.isInteger(cell))) {
      return "Place every ship.";
    }
    ships.push({ name, cells: cells as number[] });
  }
  return fleetPlacementError(ships) ?? ships;
}

export { BattleshipEngine, fleetPlacementError, randomFleet } from "./BattleshipEngine.ts";
export type { BattleshipState, BattleshipAction, BattleshipResult };
