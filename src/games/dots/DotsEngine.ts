import type { GameEngine } from "../../engine/GameEngine.ts";

// Dots and Boxes uses Tic-Tac-Toe's turns and move checks, with one twist:
// closing a box gives the same player another turn.
//
// With SIZE boxes per side there are SIZE + 1 rows of dots. A horizontal line
// h[row][col] joins dot (row, col) to (row, col + 1); a vertical line
// v[row][col] joins dot (row, col) to (row + 1, col). Box (row, col) is closed
// by h[row][col], h[row + 1][col], v[row][col] and v[row][col + 1].

export const SIZE = 4;

export type Direction = "h" | "v";
export type DotsAction = { kind: "line"; dir: Direction; row: number; col: number };

export type DotsResult =
  | { ok: false; error: string }
  | { ok: true; closed: number[]; finished?: { winner: number | null } };

export interface DotsState {
  size: number;
  h: (number | null)[][]; // seat that drew each line
  v: (number | null)[][];
  boxes: (number | null)[]; // seat that closed each box, row-major
  scores: [number, number];
  turn: number;
  yourTurn: boolean;
  lastLine: { dir: Direction; row: number; col: number } | null;
  winner: number | null;
  over: boolean;
}

const grid = (rows: number, cols: number) => Array.from({ length: rows }, () => Array<number | null>(cols).fill(null));

export class DotsEngine implements GameEngine<DotsState, DotsAction, DotsResult> {
  private h = grid(SIZE + 1, SIZE);
  private v = grid(SIZE, SIZE + 1);
  private boxes: (number | null)[] = Array(SIZE * SIZE).fill(null);
  private scores: [number, number] = [0, 0];
  private turn = 0;
  private lastLine: DotsState["lastLine"] = null;
  private winner: number | null = null;
  private over = false;

  apply(seat: number, action: DotsAction): DotsResult {
    if (action.kind !== "line") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const { dir, row, col } = action;
    const lines = dir === "h" ? this.h : dir === "v" ? this.v : null;
    if (!lines || !Number.isInteger(row) || !Number.isInteger(col) || lines[row]?.[col] === undefined) {
      return { ok: false, error: "Pick a line between two dots." };
    }
    if (lines[row][col] !== null) return { ok: false, error: "That line is already drawn." };

    lines[row][col] = seat;
    this.lastLine = { dir, row, col };

    // The boxes on each side of the new line.
    const sides = dir === "h" ? [[row - 1, col], [row, col]] : [[row, col - 1], [row, col]];
    const closed: number[] = [];
    for (const [r, c] of sides) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      const box = r * SIZE + c;
      if (this.boxes[box] === null && this.isClosed(r, c)) {
        this.boxes[box] = seat;
        this.scores[seat]++;
        closed.push(box);
      }
    }

    if (this.boxes.every((owner) => owner !== null)) {
      this.over = true;
      const [a, b] = this.scores;
      this.winner = a === b ? null : a > b ? 0 : 1;
      return { ok: true, closed, finished: { winner: this.winner } };
    }
    if (closed.length === 0) this.turn = 1 - seat; // closing a box earns another turn
    return { ok: true, closed };
  }

  private isClosed(r: number, c: number): boolean {
    return [this.h[r][c], this.h[r + 1][c], this.v[r][c], this.v[r][c + 1]].every((line) => line !== null);
  }

  getState(seat: number): DotsState {
    return {
      size: SIZE,
      h: this.h.map((row) => row.slice()),
      v: this.v.map((row) => row.slice()),
      boxes: this.boxes.slice(),
      scores: [this.scores[0], this.scores[1]],
      turn: this.turn,
      yourTurn: !this.over && this.turn === seat,
      lastLine: this.lastLine,
      winner: this.winner,
      over: this.over,
    };
  }
}
