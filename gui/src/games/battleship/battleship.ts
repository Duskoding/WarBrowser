import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./battleship.css?inline";

type Ship = { name: string; cells: number[] };

type BattleshipView = {
  size: number;
  phase: "setup" | "playing" | "over";
  yourReady: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  yourShips: (Ship & { sunk: boolean })[];
  incoming: Record<string, "hit" | "miss">;
  outgoing: Record<string, "hit" | "miss">;
  sunkEnemyShips: Ship[];
  enemyShipsLeft: number;
  fleet: { name: string; size: number }[];
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

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
    $("ready").addEventListener("click", () => {
      $<HTMLButtonElement>("ready").disabled = true;
      send({ kind: "ready" });
    });

    let view: BattleshipView | null = null;
    let size = 0;
    let enemyCells: HTMLButtonElement[] = [];
    let myCells: HTMLElement[] = [];

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
      myCells = Array.from({ length: n * n }, () => {
        const span = document.createElement("span");
        span.className = "bs-cell";
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
          : "Place your fleet: shuffle until you like it, then press Ready" + (v.opponentReady ? " (they're ready)" : "");
      } else if (v.phase === "playing") {
        status = v.yourTurn ? "Your turn: fire at enemy waters" : "Opponent is aiming…";
      }
      if (v.result === "you") status = "You sank their fleet. You win!";
      else if (v.result === "opponent") status = "Your fleet is sunk. You lose.";
      $("status").textContent = status;

      $("setup").hidden = v.phase !== "setup" || v.yourReady;
      $<HTMLButtonElement>("ready").disabled = v.yourReady;
      $("left").textContent = v.phase === "setup" ? "" : `· ${v.enemyShipsLeft} of ${v.fleet.length} ships left`;

      const sunkEnemy = new Set(v.sunkEnemyShips.flatMap((s) => s.cells));
      enemyCells.forEach((button, cell) => {
        const shot = v.outgoing[cell];
        button.className = "bs-cell" + (shot ? ` ${shot}` : "") + (sunkEnemy.has(cell) ? " sunk" : "");
        button.disabled = !v.yourTurn || !!shot;
      });

      const shipAt = new Map<number, boolean>();
      v.yourShips.forEach((s) => s.cells.forEach((c) => shipAt.set(c, s.sunk)));
      myCells.forEach((span, cell) => {
        const shot = v.incoming[cell];
        const ship = shipAt.has(cell);
        span.className =
          "bs-cell" + (ship ? " ship" : "") + (shot ? ` ${shot}` : "") + (ship && shipAt.get(cell) ? " sunk" : "");
      });
    }

    return {
      applyState(next) {
        view = next as BattleshipView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
