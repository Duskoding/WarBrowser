import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./dots.css?inline";

type Owner = "you" | "opponent" | null;
type Dir = "h" | "v";

type DotsView = {
  size: number;
  h: Owner[][];
  v: Owner[][];
  boxes: Owner[];
  yourScore: number;
  opponentScore: number;
  yourTurn: boolean;
  lastLine: { dir: Dir; row: number; col: number } | null;
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

// The board is a (2·size + 1)² CSS grid: dots on even/even cells, lines between
// them, boxes on odd/odd cells.
export const dots: GuiModule = {
  id: "dots",
  styles: shared + styles,
  isFinished: (view) => (view as DotsView).result !== undefined,
  mount(root, { send }) {
    root.innerHTML = `
      <div class="game dots">
        <p class="players" data-id="players"></p>
        <div class="score"><span class="you-score">You <strong data-id="you"></strong></span><span class="them-score">Them <strong data-id="them"></strong></span></div>
        <p class="status" data-id="status" role="status"></p>
        <div class="dots-board" data-id="board"></div>
        <aside class="commentary" data-id="commentary">Commentary appears when a box is closed.</aside>
      </div>
    `;
    const $ = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    let view: DotsView | null = null;
    let size = 0;
    const lineButtons = new Map<string, HTMLButtonElement>();
    const boxCells: HTMLElement[] = [];

    function build(n: number) {
      size = n;
      lineButtons.clear();
      boxCells.length = 0;
      const board = $("board");
      board.style.setProperty("--n", String(n));
      const cells: HTMLElement[] = [];
      for (let gr = 0; gr <= 2 * n; gr++) {
        for (let gc = 0; gc <= 2 * n; gc++) {
          const evenR = gr % 2 === 0;
          const evenC = gc % 2 === 0;
          if (evenR && evenC) {
            const dot = document.createElement("span");
            dot.className = "dot";
            cells.push(dot);
          } else if (!evenR && !evenC) {
            const box = document.createElement("span");
            box.className = "box";
            boxCells.push(box);
            cells.push(box);
          } else {
            const dir: Dir = evenR ? "h" : "v";
            const row = evenR ? gr / 2 : (gr - 1) / 2;
            const col = evenR ? (gc - 1) / 2 : gc / 2;
            const button = document.createElement("button");
            button.className = `line ${dir}`;
            button.setAttribute("aria-label", `${dir === "h" ? "Horizontal" : "Vertical"} line, row ${row + 1}, column ${col + 1}`);
            button.addEventListener("click", () => {
              lineButtons.forEach((b) => (b.disabled = true));
              send({ kind: "line", dir, row, col });
            });
            lineButtons.set(`${dir}${row},${col}`, button);
            cells.push(button);
          }
        }
      }
      board.replaceChildren(...cells);
    }

    function render() {
      const v = view;
      if (!v) return;
      if (v.size !== size) build(v.size);
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"}`;
      $("you").textContent = String(v.yourScore);
      $("them").textContent = String(v.opponentScore);

      let status = v.yourTurn ? "Your turn: draw a line" : "Opponent's turn…";
      if (v.result === "you") status = "You win!";
      else if (v.result === "opponent") status = "You lose.";
      else if (v.result === "draw") status = "It's a draw.";
      $("status").textContent = status;

      for (const [key, button] of lineButtons) {
        const dir = key[0] as Dir;
        const [row, col] = key.slice(1).split(",").map(Number);
        const owner = v[dir][row][col];
        button.className = `line ${dir}` + (owner ? ` drawn ${owner}` : "");
        const last = v.lastLine;
        button.classList.toggle("last", !!last && last.dir === dir && last.row === row && last.col === col);
        button.disabled = !v.yourTurn || owner !== null;
        const where = `${dir === "h" ? "Horizontal" : "Vertical"} line, row ${row + 1}, column ${col + 1}`;
        button.setAttribute("aria-label", owner ? `${where}, drawn by ${owner === "you" ? "you" : "your opponent"}` : where);
      }
      boxCells.forEach((box, i) => {
        const owner = v.boxes[i];
        box.className = "box" + (owner ? ` ${owner}` : "");
        box.setAttribute("role", "img");
        box.setAttribute("aria-label", `Box ${i + 1}: ${owner === "you" ? "yours" : owner ? "theirs" : "open"}`);
      });
    }

    return {
      applyState(next) {
        view = next as DotsView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
