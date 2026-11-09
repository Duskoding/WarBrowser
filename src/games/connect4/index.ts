import type { GameModule } from "../GameModule.ts";
import { COMMENTARY_INTRO, names, outcomeFor, playerLabel } from "../shared/view.ts";
import {
  COLS,
  ConnectFourEngine,
  ROWS,
  type ConnectFourAction,
  type ConnectFourResult,
  type ConnectFourState,
} from "./ConnectFourEngine.ts";

export function buildConnectFourPrompt(seat: number, column: number, winner: number | null, moves: number): string {
  const result = winner === null ? "The board is full: the game is a draw." : `${playerLabel(winner)} connects four and wins.`;
  return `${COMMENTARY_INTRO} Connect Four, move ${moves}: ${playerLabel(seat)} dropped a disc in column ${column + 1}. ${result}`;
}

export const connect4: GameModule<ConnectFourState, ConnectFourAction, ConnectFourResult> = {
  id: "connect4",
  name: "Connect Four",
  description: "Drop discs into columns. Four in a row across, down or diagonally wins.",
  players: { min: 2, max: 2 },
  rules: [
    `The board has ${COLS} columns and ${ROWS} rows. Players take turns; the room's host goes first.`,
    "On your turn, drop one disc into a column. It falls to the lowest empty space.",
    "The first player with four discs in a row (across, down or diagonally) wins. A full board is a draw.",
  ],

  createEngine() {
    return new ConnectFourEngine();
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "drop") return null;
    if (!Number.isInteger(payload.column)) return { ok: false, error: "Pick a column." };
    const column = payload.column as number;
    const result = engine.apply(seat, { kind: "drop", column });
    if (!result.ok) return { ok: false, error: result.error };
    if (!result.finished) return { ok: true };
    // Commentary only for the move that ends the game.
    const { moves } = engine.getState(seat);
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: moves,
        text: context.commentator.describe(buildConnectFourPrompt(seat, column, result.finished.winner, moves)),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    return {
      cols: COLS,
      rows: ROWS,
      // "you" / "opponent" per cell, so the screen colours your discs the same in every seat.
      board: state.board.map((owner) => (owner === null ? null : owner === seat ? "you" : "opponent")),
      yourTurn: state.yourTurn,
      lastCell: state.lastCell,
      line: state.line ?? undefined,
      youFirst: seat === 0,
      result: outcomeFor(seat, state.over, state.winner),
      ...names(seat, players),
    };
  },
};

export { ConnectFourEngine };
export type { ConnectFourState, ConnectFourAction, ConnectFourResult };
