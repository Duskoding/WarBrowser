import type { GameDefinition } from './types.ts';

// A small second game, mainly a working example of a GameDefinition that isn't
// War: turn-based, with a board instead of cards.

export type Mark = 'X' | 'O';
const marks: Mark[] = ['X', 'O']; // seat 0 plays X and moves first

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export class TicTacToe {
  readonly board: (Mark | null)[] = Array(9).fill(null);
  turn = 0; // seat to move
  winner: number | null = null;
  line: number[] | null = null;
  over = false;

  move(seat: number, cell: unknown): string | null {
    if (this.over) return 'The game is over.';
    if (seat !== this.turn) return "It's not your turn.";
    if (!Number.isInteger(cell) || (cell as number) < 0 || (cell as number) > 8) return 'Pick a square.';
    const index = cell as number;
    if (this.board[index]) return 'That square is taken.';

    this.board[index] = marks[seat];
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
    return null;
  }
}

export const ticTacToe: GameDefinition = {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  description: 'Take turns placing X and O. Three in a row wins.',
  players: 2,
  create() {
    const game = new TicTacToe();
    return {
      view(seat, players) {
        return {
          board: game.board,
          yourMark: marks[seat],
          yourTurn: !game.over && game.turn === seat,
          result: !game.over ? undefined : game.winner === null ? 'draw' : game.winner === seat ? 'you' : 'opponent',
          line: game.line ?? undefined,
          yourName: players[seat]?.username,
          opponentName: players[1 - seat]?.username,
        };
      },
      act(seat, payload) {
        if (payload.kind !== 'move') return null;
        const error = game.move(seat, payload.cell);
        if (error) return { ok: false, error };
        return { ok: true, finished: game.over ? { winner: game.winner } : undefined };
      },
    };
  },
};
