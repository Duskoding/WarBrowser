import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { SUIT_NAME, SUIT_SYMBOL, cardBack, cardElement, cardText, commentaryBox, isRed, type ViewCard, type ViewSuit } from "../shared/cards";
import styles from "./crazy8.css?inline";

type CrazyEightsView = {
  yourHand: ViewCard[];
  playable: ViewCard[];
  opponentCount: number;
  top: ViewCard;
  suit: ViewSuit;
  stockCount: number;
  yourTurn: boolean;
  canDraw: boolean;
  canPass: boolean;
  lastPlay: { who: "you" | "opponent"; card?: ViewCard; suit?: ViewSuit; drew?: boolean; passed?: boolean } | null;
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

const SUITS: ViewSuit[] = ["S", "H", "D", "C"];
const same = (a: ViewCard, b: ViewCard) => a.rank === b.rank && a.suit === b.suit;

export const crazy8: GuiModule = {
  id: "crazy8",
  styles: shared + styles,
  isFinished: (view) => (view as CrazyEightsView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 30%, #6a2b6e, #331438)");
    root.innerHTML = `
      <div class="game c8">
        <p class="players" data-id="players"></p>
        <div class="hand opp" data-id="opp"></div>
        <div class="c8-table">
          <button class="c8-stock" data-id="stock" aria-label="Draw a card"></button>
          <div class="c8-discard" data-id="top"></div>
          <p class="c8-suit" data-id="suit"></p>
        </div>
        <p class="status" data-id="status" role="status"></p>
        <p class="note" data-id="last"></p>
        <div class="row">
          <button class="small-btn ghost-btn" data-id="pass">Pass</button>
        </div>
        <div class="c8-picker" data-id="picker" hidden>
          <p class="label">Your 8 is wild: name the suit</p>
          <div class="row">${SUITS.map((s) => `<button class="c8-pick${isRed(s) ? " red" : ""}" data-suit="${s}" aria-label="${SUIT_NAME[s]}">${SUIT_SYMBOL[s]}</button>`).join("")}</div>
        </div>
        <p class="label">Your hand</p>
        <div class="hand" data-id="hand"></div>
        <aside class="commentary" data-id="commentary">Commentary appears for wild 8s and the winning card.</aside>
      </div>
    `;
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
    let view: CrazyEightsView | null = null;
    let pendingEight: ViewCard | null = null;

    $("stock").addEventListener("click", () => send({ kind: "draw" }));
    $("pass").addEventListener("click", () => send({ kind: "pass" }));
    root.querySelectorAll<HTMLButtonElement>(".c8-pick").forEach((button) =>
      button.addEventListener("click", () => {
        if (!pendingEight) return;
        send({ kind: "play", card: pendingEight, suit: button.dataset.suit });
        pendingEight = null;
        $("picker").hidden = true;
      })
    );

    function render() {
      const v = view;
      if (!v) return;
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"} (${v.opponentCount} cards)`;
      $("opp").replaceChildren(...Array.from({ length: v.opponentCount }, () => cardBack()));

      $("stock").replaceChildren(cardBack(String(v.stockCount)));
      $<HTMLButtonElement>("stock").disabled = !v.canDraw;
      $("top").replaceChildren(cardElement(v.top));
      $("suit").innerHTML = `Suit to match: <span></span>`;
      const suitSpan = $("suit").querySelector("span")!;
      suitSpan.textContent = `${SUIT_SYMBOL[v.suit]} ${SUIT_NAME[v.suit]}`;
      suitSpan.className = isRed(v.suit) ? "red" : "";

      let status = v.yourTurn
        ? v.playable.length ? "Your turn: play a highlighted card" + (v.canDraw ? " or draw" : "") : v.canDraw ? "No match: draw a card" : "No match: pass"
        : "Opponent's turn…";
      if (v.result === "you") status = "You win!";
      else if (v.result === "opponent") status = "You lose.";
      else if (v.result === "draw") status = "It's a draw: nobody could play.";
      $("status").textContent = status;

      const last = v.lastPlay;
      const who = last?.who === "you" ? "You" : "They";
      $("last").textContent = !last
        ? ""
        : last.card
          ? `${who} played ${cardText(last.card)}` + (last.suit ? ` and named ${SUIT_NAME[last.suit]}.` : ".")
          : last.drew ? `${who} drew a card.` : `${who} passed.`;

      $<HTMLButtonElement>("pass").disabled = !v.canPass;
      $("pass").hidden = !v.yourTurn;
      if (!v.yourTurn) {
        pendingEight = null;
        $("picker").hidden = true;
      }

      $("hand").replaceChildren(
        ...v.yourHand.map((card) => {
          const el = cardElement(card, "button") as HTMLButtonElement;
          const playable = v.playable.some((p) => same(p, card));
          el.classList.toggle("playable", playable);
          el.disabled = !playable;
          el.addEventListener("click", () => {
            if (card.rank === 8) {
              pendingEight = card;
              $("picker").hidden = false;
              return;
            }
            send({ kind: "play", card });
          });
          return el;
        })
      );
    }

    return {
      applyState(next) {
        view = next as CrazyEightsView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
