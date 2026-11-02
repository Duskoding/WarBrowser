import type { ClientGame } from "../types";
import styles from "./tictactoe.css?inline";

type Mark = "X" | "O";

// One player's view of the board, from src/games/tictactoe.ts on the server.
type TicTacToeView = {
  board: (Mark | null)[]; // 9 squares, row by row
  yourMark: Mark;
  yourTurn: boolean;
  result?: "you" | "opponent" | "draw";
  line?: number[]; // the winning three squares
  yourName?: string;
  opponentName?: string;
};

export const ticTacToe: ClientGame = {
  id: "tictactoe",
  styles,
  isFinished: (view) => (view as TicTacToeView).result !== undefined,
  mount(root, { send }) {
    root.innerHTML = `
      <div class="ttt">
        <p class="ttt-players" data-id="players"></p>
        <p class="status" data-id="status"></p>
        <div class="ttt-board" role="grid" aria-label="Board">
          ${Array.from({ length: 9 }, (_, i) => `<button class="ttt-cell" data-cell="${i}" aria-label="Square ${i + 1}"></button>`).join("")}
        </div>
      </div>
    `;
    const cells = [...root.querySelectorAll<HTMLButtonElement>(".ttt-cell")];
    cells.forEach((cell, i) =>
      cell.addEventListener("click", () => {
        cells.forEach((c) => (c.disabled = true)); // re-enabled by the next state
        send({ kind: "move", cell: i });
      })
    );

    return {
      update(view) {
        const v = view as TicTacToeView;
        const theirMark: Mark = v.yourMark === "X" ? "O" : "X";
        root.querySelector('[data-id="players"]')!.textContent =
          `${v.yourName ?? "You"} (${v.yourMark}) vs ${v.opponentName ?? "Opponent"} (${theirMark})`;

        let status = v.yourTurn ? "Your turn" : "Opponent's turn…";
        if (v.result === "you") status = "You win!";
        else if (v.result === "opponent") status = "You lose.";
        else if (v.result === "draw") status = "It's a draw.";
        root.querySelector('[data-id="status"]')!.textContent = status;

        cells.forEach((cell, i) => {
          const mark = v.board[i];
          cell.textContent = mark ?? "";
          cell.classList.toggle("mine", mark === v.yourMark);
          cell.classList.toggle("winning", v.line?.includes(i) ?? false);
          cell.disabled = !v.yourTurn || mark !== null;
        });
      }
    };
  }
};
