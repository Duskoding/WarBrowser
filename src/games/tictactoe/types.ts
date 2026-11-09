export type Mark = "X" | "O";

export type TicTacToeAction = { kind: "move"; cell: number };

export interface TicTacToeState {
  board: (Mark | null)[];
  yourMark: Mark;
  yourTurn: boolean;
  turn: number;
  winner: number | null;
  line: number[] | null;
  over: boolean;
}

export type TicTacToeResult =
  | { ok: false; error: string }
  | { ok: true; finished?: { winner: number | null } };
