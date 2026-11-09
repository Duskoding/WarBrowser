import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./battleship.css?inline";

type Ship = { name: string; cells: number[]; sunk?: boolean };

type BattleshipView = {
  size: number;
  phase: "setup" | "playing" | "over";
  yourReady: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  yourShips: Ship[];
  incoming: Record<string, "hit" | "miss">;
  outgoing: Record<string, "hit" | "miss">;
  sunkEnemyShips: Ship[];
  enemyShipsLeft: number;
  fleet: { name: string; size: number }[];
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

type Drag = { name: string; across: boolean; grab: number; pointerId: number };

export const battleship: GuiModule = {
  id: "battleship",
  styles: shared + styles,
  isFinished: (view) => (view as BattleshipView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 20%, #1f5a7a, #0c2433)");
    root.innerHTML = `
      <div class="game bs">
        <p class="players" data-id="players"></p>
        <p class="status" data-id="status"></p>
        <div class="row" data-id="setup">
          <button class="small-btn ghost-btn" data-id="shuffle">Shuffle my fleet</button>
          <button class="small-btn ghost-btn" data-id="rotate">Rotate</button>
          <button class="small-btn" data-id="ready">Ready</button>
        </div>
        <div class="bs-boards">
          <section class="bs-side">
            <p class="label">Enemy waters <span data-id="left"></span></p>
            <div class="bs-grid enemy" data-id="enemy"></div>
          </section>
          <section class="bs-side">
            <p class="label">Your fleet</p>
            <div class="bs-grid mine" data-id="mine"></div>
          </section>
        </div>
        <aside class="commentary" data-id="commentary">Commentary appears when a ship sinks.</aside>
      </div>
    `;
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
    $("shuffle").addEventListener("click", () => send({ kind: "shuffle" }));
    $("rotate").addEventListener("click", () => rotateSelected());
    $("ready").addEventListener("click", () => {
      $<HTMLButtonElement>("ready").disabled = true;
      send({ kind: "ready" });
    });

    let view: BattleshipView | null = null;
    let size = 0;
    let enemyCells: HTMLButtonElement[] = [];
    let myCells: HTMLElement[] = [];
    let selected: string | null = null;
    let notice = "";
    let drag: Drag | null = null;
    let preview: { cells: number[]; ok: boolean } | null = null;

    function isAcross(cells: number[], n: number) {
      if (cells.length < 2) return true;
      const row = Math.floor(cells[0] / n);
      return cells.every((cell) => Math.floor(cell / n) === row);
    }

    function cellsFrom(row: number, col: number, length: number, across: boolean, n: number) {
      if (row < 0 || col < 0 || row >= n || col >= n) return null;
      if (across && col + length > n) return null;
      if (!across && row + length > n) return null;
      return Array.from({ length }, (_, i) => (across ? row * n + col + i : (row + i) * n + col));
    }

    function cellFromPoint(x: number, y: number) {
      const rect = $("mine").getBoundingClientRect();
      if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom || size === 0) return null;
      const col = Math.min(size - 1, Math.floor(((x - rect.left) / rect.width) * size));
      const row = Math.min(size - 1, Math.floor(((y - rect.top) / rect.height) * size));
      return row * size + col;
    }

    function overlaps(name: string, cells: number[]) {
      return view?.yourShips.some((ship) => ship.name !== name && ship.cells.some((cell) => cells.includes(cell))) ?? true;
    }

    function sendFleet(ships: { name: string; cells: number[] }[]) {
      send({ kind: "place", ships });
    }

    function rotateSelected() {
      const v = view;
      if (!v || v.phase !== "setup" || v.yourReady || drag) return;
      const ship = v.yourShips.find((item) => item.name === selected);
      if (!ship) {
        notice = "Select a ship on your grid, then press Rotate.";
        render();
        return;
      }
      const sorted = [...ship.cells].sort((a, b) => a - b);
      const origin = sorted[0];
      const row = Math.floor(origin / v.size);
      const col = origin % v.size;
      const cells = cellsFrom(row, col, ship.cells.length, !isAcross(ship.cells, v.size), v.size);
      if (!cells || overlaps(ship.name, cells)) {
        notice = "That rotation doesn't fit. Drag the ship somewhere it can turn.";
        render();
        return;
      }
      notice = "";
      sendFleet(v.yourShips.map((item) => (item.name === ship.name ? { name: ship.name, cells } : { name: item.name, cells: item.cells.slice() })));
    }

    function paintMine(v: BattleshipView) {
      const shipAt = new Map<number, boolean>();
      const chosen = new Set(v.yourShips.find((ship) => ship.name === selected)?.cells ?? []);
      v.yourShips.forEach((ship) => {
        if (drag?.name === ship.name) return;
        ship.cells.forEach((cell) => shipAt.set(cell, !!ship.sunk));
      });
      myCells.forEach((span, cell) => {
        const shot = v.incoming[cell];
        const ship = shipAt.has(cell);
        const shown = preview?.cells.includes(cell) ?? false;
        span.className =
          "bs-cell" +
          (ship || (shown && preview?.ok) ? " ship" : "") +
          (shot ? ` ${shot}` : "") +
          (ship && shipAt.get(cell) ? " sunk" : "") +
          (shown ? (preview?.ok ? " preview" : " preview bad") : "") +
          (!drag && chosen.has(cell) ? " selected" : "");
      });
    }

    function build(n: number) {
      size = n;
      $("enemy").style.setProperty("--n", String(n));
      $("mine").style.setProperty("--n", String(n));
      enemyCells = Array.from({ length: n * n }, (_, cell) => {
        const button = document.createElement("button");
        button.className = "bs-cell";
        button.setAttribute("aria-label", `Row ${Math.floor(cell / n) + 1}, column ${(cell % n) + 1}`);
        button.addEventListener("click", () => {
          enemyCells.forEach((b) => (b.disabled = true));
          send({ kind: "fire", cell });
        });
        return button;
      });
      myCells = Array.from({ length: n * n }, (_, cell) => {
        const span = document.createElement("span");
        span.className = "bs-cell";
        span.dataset.cell = String(cell);
        return span;
      });
      $("enemy").replaceChildren(...enemyCells);
      $("mine").replaceChildren(...myCells);
    }

    function render() {
      const v = view;
      if (!v) return;
      if (v.size !== size) build(v.size);
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"}`;

      let status = "";
      if (v.phase === "setup") {
        status = v.yourReady
          ? "Waiting for your opponent to place their fleet…"
          : notice || "Drag a ship to move it, or shuffle, then press Ready" + (v.opponentReady ? " (they're ready)" : "");
      } else if (v.phase === "playing") {
        status = v.yourTurn ? "Your turn: fire at enemy waters" : "Opponent is aiming…";
      }
      if (v.result === "you") status = "You sank their fleet. You win!";
      else if (v.result === "opponent") status = "Your fleet is sunk. You lose.";
      $("status").textContent = status;

      const placing = v.phase === "setup" && !v.yourReady;
      $("setup").hidden = !placing;
      $<HTMLButtonElement>("ready").disabled = !placing;
      $<HTMLButtonElement>("rotate").disabled = !placing;
      $("left").textContent = v.phase === "setup" ? "" : `· ${v.enemyShipsLeft} of ${v.fleet.length} ships left`;

      const sunkEnemy = new Set(v.sunkEnemyShips.flatMap((s) => s.cells));
      enemyCells.forEach((button, cell) => {
        const shot = v.outgoing[cell];
        button.className = "bs-cell" + (shot ? ` ${shot}` : "") + (sunkEnemy.has(cell) ? " sunk" : "");
        button.disabled = !v.yourTurn || !!shot;
      });
      paintMine(v);
    }

    function moveDrag(x: number, y: number) {
      if (!drag || !view) return;
      const spec = view.fleet.find((ship) => ship.name === drag?.name);
      const cell = cellFromPoint(x, y);
      if (!spec || cell === null) {
        preview = null;
      } else {
        const row = Math.floor(cell / view.size);
        const col = cell % view.size;
        const originRow = drag.across ? row : row - drag.grab;
        const originCol = drag.across ? col - drag.grab : col;
        const cells = cellsFrom(originRow, originCol, spec.size, drag.across, view.size);
        preview = cells ? { cells, ok: !overlaps(drag.name, cells) } : { cells: [], ok: false };
      }
      paintMine(view);
    }

    function sameCells(a: number[], b: number[]) {
      if (a.length !== b.length) return false;
      const left = [...a].sort((x, y) => x - y);
      const right = [...b].sort((x, y) => x - y);
      return left.every((cell, i) => cell === right[i]);
    }

    function finishDrag(commit: boolean) {
      const current = drag;
      const shown = preview;
      drag = null;
      preview = null;
      const v = view;
      const ship = v?.yourShips.find((item) => item.name === current?.name);
      if (commit && current && shown?.ok && v && ship && !sameCells(ship.cells, shown.cells)) {
        notice = "";
        sendFleet(
          v.yourShips.map((item) =>
            item.name === current.name ? { name: item.name, cells: shown.cells } : { name: item.name, cells: item.cells.slice() },
          ),
        );
      }
      render();
    }

    const mine = $("mine");
    mine.addEventListener("pointerdown", (ev) => {
      if (drag) return;
      const v = view;
      if (!v || v.phase !== "setup" || v.yourReady) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const cellEl = target.closest<HTMLElement>("[data-cell]");
      if (!cellEl?.dataset.cell) return;
      const cell = Number(cellEl.dataset.cell);
      const ship = v.yourShips.find((item) => item.cells.includes(cell));
      if (!ship) return;
      selected = ship.name;
      drag = {
        name: ship.name,
        across: isAcross(ship.cells, v.size),
        grab: [...ship.cells].sort((a, b) => a - b).indexOf(cell),
        pointerId: ev.pointerId,
      };
      mine.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      moveDrag(ev.clientX, ev.clientY);
    });
    mine.addEventListener("pointermove", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      moveDrag(ev.clientX, ev.clientY);
    });
    mine.addEventListener("pointerup", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      finishDrag(true);
    });
    mine.addEventListener("pointercancel", (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      finishDrag(false);
    });

    return {
      applyState(next) {
        view = next as BattleshipView;
        notice = "";
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
