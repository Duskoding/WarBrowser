import type { GameEngine } from "../../engine/GameEngine.ts";

// Connect Four is Tic-Tac-Toe on a bigger board: the same turns and move
// checks, but discs fall to the lowest empty row, and instead of a fixed list
// of winning lines we look in four directions from the disc just played.
//
// The board is row-major from the top: cell = row * COLS + col.

export const COLS = 7;
export const ROWS = 6;
const DIRECTIONS = [
  [0, 1], // across
  [1, 0], // down
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
];

export type ConnectFourAction = { kind: "drop"; column: number };

export type ConnectFourResult =
  | { ok: false; error: string }
  | { ok: true; cell: number; finished?: { winner: number | null } };

export interface ConnectFourState {
  board: (number | null)[]; // seat index that owns each cell
  turn: number;
  yourTurn: boolean;
  lastCell: number | null;
  line: number[] | null;
  winner: number | null;
  over: boolean;
  moves: number;
}

export class ConnectFourEngine implements GameEngine<ConnectFourState, ConnectFourAction, ConnectFourResult> {
  private board: (number | null)[] = Array(COLS * ROWS).fill(null);
  private turn = 0;
  private lastCell: number | null = null;
  private line: number[] | null = null;
  private winner: number | null = null;
  private over = false;
  private moves = 0;

  apply(seat: number, action: ConnectFourAction): ConnectFourResult {
    if (action.kind !== "drop") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const col = action.column;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return { ok: false, error: "Pick a column." };

    let row = ROWS - 1;
    while (row >= 0 && this.board[row * COLS + col] !== null) row--;
    if (row < 0) return { ok: false, error: "That column is full." };

    const cell = row * COLS + col;
    this.board[cell] = seat;
    this.lastCell = cell;
    this.moves++;

    const line = this.lineThrough(row, col, seat);
    if (line) {
      this.line = line;
      this.winner = seat;
      this.over = true;
    } else if (this.moves === COLS * ROWS) {
      this.over = true;
    } else {
      this.turn = 1 - seat;
    }
    return { ok: true, cell, finished: this.over ? { winner: this.winner } : undefined };
  }

  // The four-or-longer run of `seat`'s discs through (row, col), if there is one.
  private lineThrough(row: number, col: number, seat: number): number[] | null {
    for (const [dr, dc] of DIRECTIONS) {
      const cells = [row * COLS + col];
      for (const sign of [1, -1]) {
        let r = row + dr * sign;
        let c = col + dc * sign;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.board[r * COLS + c] === seat) {
          cells.push(r * COLS + c);
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (cells.length >= 4) return cells.sort((a, b) => a - b);
    }
    return null;
  }

  getState(seat: number): ConnectFourState {
    return {
      board: this.board.slice(),
      turn: this.turn,
      yourTurn: !this.over && this.turn === seat,
      lastCell: this.lastCell,
      line: this.line,
      winner: this.winner,
      over: this.over,
      moves: this.moves,
    };
  }
}
