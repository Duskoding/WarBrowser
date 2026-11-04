import type { GameEngine } from "../../engine/GameEngine.ts";
import type { Mark, TicTacToeAction, TicTacToeResult, TicTacToeState } from "./types.ts";

const marks: Mark[] = ["X", "O"]; // seat 0 plays X and moves first

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export class TicTacToeEngine implements GameEngine<TicTacToeState, TicTacToeAction, TicTacToeResult> {
  private board: (Mark | null)[] = Array(9).fill(null);
  private turn = 0;
  private winner: number | null = null;
  private line: number[] | null = null;
  private over = false;

  apply(seat: number, action: TicTacToeAction): TicTacToeResult {
    if (action.kind !== "move") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const cell = action.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
      return { ok: false, error: "Pick a square." };
    }
    if (this.board[cell]) return { ok: false, error: "That square is taken." };

    this.board[cell] = marks[seat];
    const line = LINES.find((l) => l.every((i) => this.board[i] === marks[seat]));
    if (line) {
      this.winner = seat;
      this.line = line;
      this.over = true;
    } else if (this.board.every(Boolean)) {
      this.over = true;
    } else {
      this.turn = 1 - seat;
    }

    return {
      ok: true,
      finished: this.over ? { winner: this.winner } : undefined,
    };
  }

  getState(seat: number): TicTacToeState {
    return {
      board: this.board.slice(),
      yourMark: marks[seat],
      yourTurn: !this.over && this.turn === seat,
      turn: this.turn,
      winner: this.winner,
      line: this.line,
      over: this.over,
    };
  }
}
