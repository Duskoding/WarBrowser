import type { GuiModule } from "../GuiModule";
import styles from "./tictactoe.css?inline";

type Mark = "X" | "O";

type TicTacToeView = {
  board: (Mark | null)[];
  yourMark: Mark;
  yourTurn: boolean;
  result?: "you" | "opponent" | "draw";
  line?: number[];
  yourName?: string;
  opponentName?: string;
};

export const ticTacToe: GuiModule = {
  id: "tictactoe",
  styles,
  isFinished: (view) => (view as TicTacToeView).result !== undefined,
  mount(root, { send }) {
    root.innerHTML = `
      <div class="ttt">
        <p class="ttt-players" data-id="players"></p>
        <p class="status" data-id="status" role="status"></p>
        <div class="ttt-board" role="group" aria-label="Board">
          ${Array.from({ length: 9 }, (_, i) => `<button class="ttt-cell" data-cell="${i}" aria-label="Square ${i + 1}"></button>`).join("")}
        </div>
        <aside class="commentary" data-id="commentary">Commentary will appear here.</aside>
      </div>
    `;
    const cells = [...root.querySelectorAll<HTMLButtonElement>(".ttt-cell")];
    cells.forEach((cell, i) =>
      cell.addEventListener("click", () => {
        cells.forEach((c) => (c.disabled = true));
        send({ kind: "move", cell: i });
      })
    );

    let view: TicTacToeView | null = null;
    let lastCommentaryRound = 0;

    function render() {
      const v = view;
      if (!v) return;
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
        cell.setAttribute("aria-label", `Square ${i + 1}: ${mark ? `${mark}${mark === v.yourMark ? " (you)" : ""}` : "empty"}`);
        cell.classList.toggle("mine", mark === v.yourMark);
        cell.classList.toggle("winning", v.line?.includes(i) ?? false);
        cell.disabled = !v.yourTurn || mark !== null;
      });
    }

    return {
      applyState(next) {
        view = next as TicTacToeView;
      },
      render,
      commentary(text, round) {
        if (round <= lastCommentaryRound) return;
        lastCommentaryRound = round;
        root.querySelector('[data-id="commentary"]')!.textContent = text;
      }
    };
  }
};
