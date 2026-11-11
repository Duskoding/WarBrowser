import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./connect4.css?inline";

type Owner = "you" | "opponent" | null;

type ConnectFourView = {
  cols: number;
  rows: number;
  board: Owner[];
  yourTurn: boolean;
  lastCell: number | null;
  line?: number[];
  youFirst: boolean;
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

// "Column 3: yours, theirs, 4 empty", listing discs from the bottom up.
function columnLabel(v: ConnectFourView, col: number): string {
  const discs: string[] = [];
  for (let row = v.rows - 1; row >= 0; row--) {
    const owner = v.board[row * v.cols + col];
    if (owner === null) break;
    discs.push(owner === "you" ? "yours" : "theirs");
  }
  const empty = v.rows - discs.length;
  return `Column ${col + 1}: ${[...discs, empty ? `${empty} empty` : "full"].join(", ")}`;
}

export const connect4: GuiModule = {
  id: "connect4",
  styles: shared + styles,
  isFinished: (view) => (view as ConnectFourView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 30%, #23407a, #142650)");
    root.innerHTML = `
      <div class="game c4">
        <p class="players" data-id="players"></p>
        <p class="status" data-id="status" role="status"></p>
        <div class="c4-board" data-id="board" role="group" aria-label="Board"></div>
        <aside class="commentary" data-id="commentary">Commentary appears when the game ends.</aside>
      </div>
    `;
    const $ = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    let view: ConnectFourView | null = null;
    let columns: HTMLButtonElement[] = [];

    function build(v: ConnectFourView) {
      const board = $("board");
      board.style.setProperty("--cols", String(v.cols));
      columns = Array.from({ length: v.cols }, (_, col) => {
        const button = document.createElement("button");
        button.className = "c4-col";
        button.setAttribute("aria-label", `Column ${col + 1}`);
        button.innerHTML = Array.from({ length: v.rows }, () => `<span class="c4-cell"></span>`).join("");
        button.addEventListener("click", () => {
          columns.forEach((c) => (c.disabled = true));
          send({ kind: "drop", column: col });
        });
        return button;
      });
      board.replaceChildren(...columns);
    }

    function render() {
      const v = view;
      if (!v) return;
      if (columns.length !== v.cols) build(v);
      $("players").innerHTML = `<span class="disc you"></span> <b></b> vs <span class="disc opponent"></span> <b></b>`;
      const [you, them] = $("players").querySelectorAll("b");
      you.textContent = v.yourName ?? "You";
      them.textContent = v.opponentName ?? "Opponent";

      let status = v.yourTurn ? "Your turn: pick a column" : "Opponent's turn…";
      if (v.result === "you") status = "You win!";
      else if (v.result === "opponent") status = "You lose.";
      else if (v.result === "draw") status = "It's a draw.";
      $("status").textContent = status;

      columns.forEach((button, col) => {
        const cells = button.querySelectorAll<HTMLElement>(".c4-cell");
        let full = true;
        cells.forEach((cellEl, row) => {
          const cell = row * v.cols + col;
          const owner = v.board[cell];
          if (owner === null) full = false;
          cellEl.className = "c4-cell" + (owner ? ` ${owner}` : "");
          cellEl.classList.toggle("last", cell === v.lastCell);
          cellEl.classList.toggle("winning", v.line?.includes(cell) ?? false);
        });
        button.disabled = !v.yourTurn || full;
        button.setAttribute("aria-label", columnLabel(v, col));
      });
    }

    return {
      applyState(next) {
        view = next as ConnectFourView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
