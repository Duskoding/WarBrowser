import type { GameModule } from "../GameModule.ts";
import { TicTacToeEngine } from "./TicTacToeEngine.ts";
import { buildTicTacToePrompt } from "./prompt.ts";
import type { TicTacToeAction, TicTacToeResult, TicTacToeState } from "./types.ts";

export const ticTacToe: GameModule<TicTacToeState, TicTacToeAction, TicTacToeResult> = {
  id: "tictactoe",
  name: "Tic-Tac-Toe",
  description: "Take turns placing X and O. Three in a row wins.",
  players: 2,

  createEngine() {
    return new TicTacToeEngine();
  },

  handleAction(engine, seat, payload, context) {
    if (payload.kind !== "move") return null;
    if (!Number.isInteger(payload.cell)) {
      return { ok: false, error: "Pick a square." };
    }
    const cell = payload.cell as number;
    const before = engine.getState(seat);
    const filled = before.board.filter(Boolean).length;
    const result = engine.apply(seat, { kind: "move", cell });
    if (!result.ok) return { ok: false, error: result.error };
    const after = engine.getState(seat);
    return {
      ok: true,
      finished: result.finished,
      commentary: {
        round: filled + 1,
        text: context.commentator.describe(
          buildTicTacToePrompt({
            seat,
            cell,
            mark: before.yourMark,
            over: after.over,
            winner: after.winner,
            moveNumber: filled + 1,
          }),
        ),
      },
    };
  },

  toView(engine, seat, players) {
    const state = engine.getState(seat);
    return {
      board: state.board,
      yourMark: state.yourMark,
      yourTurn: state.yourTurn,
      result: !state.over
        ? undefined
        : state.winner === null
          ? "draw"
          : state.winner === seat
            ? "you"
            : "opponent",
      line: state.line ?? undefined,
      yourName: players[seat]?.username,
      opponentName: players[1 - seat]?.username,
    };
  },
};

export type { TicTacToeState, TicTacToeAction, TicTacToeResult };
export { TicTacToeEngine } from "./TicTacToeEngine.ts";
export { buildTicTacToePrompt } from "./prompt.ts";
