import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { commentaryBox } from "../shared/cards";
import styles from "./nim.css?inline";

type Who = "you" | "opponent";

type NimView = {
  piles: number[];
  yourTurn: boolean;
  youFirst: boolean;
  lastTake?: { who: Who; pile: number; count: number };
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

export const nim: GuiModule = {
  id: "nim",
  styles: shared + styles,
  isFinished: (view) => (view as NimView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 15%, #6a4a28, #24180e)");
    root.innerHTML = `
      <div class="game nim">
        <p class="players" data-id="players"></p>
        <p class="status" data-id="status"></p>
        <p class="note" data-id="hint">Tap a stone to take it and every stone above it, from one pile.</p>
        <div class="nim-piles" data-id="piles"></div>
        <aside class="commentary" data-id="commentary">Commentary appears when someone takes the last stone.</aside>
      </div>
    `;
    const $ = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    let view: NimView | null = null;

    function render() {
      const v = view;
      if (!v) return;
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"}`;

      let status = v.yourTurn ? "Your turn" : "Opponent's turn…";
      if (v.lastTake && !v.result) {
        const who = v.lastTake.who === "you" ? "You took" : "Opponent took";
        const stones = v.lastTake.count === 1 ? "1 stone" : `${v.lastTake.count} stones`;
        status = `${who} ${stones} from pile ${v.lastTake.pile + 1}. ${v.yourTurn ? "Your turn" : "Opponent's turn…"}`;
      }
      if (v.result === "you") status = "You took the last stone. You win!";
      else if (v.result === "opponent") status = "Your opponent took the last stone. You lose.";
      $("status").textContent = status;

      $("piles").replaceChildren(
        ...v.piles.map((count, pile) => {
          const column = document.createElement("section");
          column.className = "nim-pile";
          const label = document.createElement("p");
          label.className = "label";
          label.textContent = `Pile ${pile + 1}`;
          const stones = document.createElement("div");
          stones.className = "nim-stones";
          if (count === 0) {
            const empty = document.createElement("p");
            empty.className = "nim-empty";
            empty.textContent = "empty";
            stones.append(empty);
          }
          for (let fromTop = 1; fromTop <= count; fromTop++) {
            const button = document.createElement("button");
            button.className = "nim-stone";
            button.type = "button";
            button.disabled = !v.yourTurn;
            button.setAttribute("aria-label", `Take ${fromTop} from pile ${pile + 1}`);
            button.addEventListener("click", () => {
              stones.querySelectorAll("button").forEach((el) => {
                el.disabled = true;
              });
              send({ kind: "take", pile, count: fromTop });
            });
            stones.append(button);
          }
          column.append(label, stones);
          return column;
        }),
      );
    }

    return {
      applyState(next) {
        view = next as NimView;
      },
      render,
      commentary: commentaryBox($("commentary")),
    };
  },
};
