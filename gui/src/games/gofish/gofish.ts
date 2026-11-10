import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { cardBack, cardElement, cardText, commentaryBox, rankLabel, type ViewCard } from "../shared/cards";
import styles from "./gofish.css?inline";

type GoFishView = {
  yourHand: ViewCard[];
  opponentCount: number;
  stockCount: number;
  yourBooks: number[];
  opponentBooks: number[];
  yourTurn: boolean;
  lastAsk: { who: "you" | "opponent"; rank: number; got: number; drew?: ViewCard; lucky?: boolean; book?: number } | null;
  result?: "you" | "opponent" | "draw";
  yourName?: string;
  opponentName?: string;
};

const NAMES: Record<number, string> = { 6: "Sixes", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };
const plural = (rank: number) => NAMES[rank] ?? `${rank}s`;

function describeAsk(ask: NonNullable<GoFishView["lastAsk"]>): string {
  const mine = ask.who === "you";
  let text = `${mine ? "You" : "They"} asked for ${plural(ask.rank)}: `;
  if (ask.got > 0) text += `${mine ? "they" : "you"} handed over ${ask.got}.`;
  else {
    text += "go fish!";
    if (ask.drew) text += ` You drew ${cardText(ask.drew)}.`;
    if (ask.lucky) text += mine ? " That's the rank you asked for: go again." : " They drew what they asked for.";
  }
  if (ask.book) text += ` ${mine ? "You" : "They"} made a book of ${plural(ask.book)}.`;
  return text;
}

export const gofish: GuiModule = {
  id: "gofish",
  styles: shared + styles,
  isFinished: (view) => (view as GoFishView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 30%, #1f7a74, #0e3b39)");
    root.innerHTML = `
      <div class="game gf">
        <p class="players" data-id="players"></p>
        <div class="hand opp" data-id="opp"></div>
        <div class="gf-books">
          <div><p class="label">Their books</p><div class="row" data-id="their-books"></div></div>
          <div class="gf-pond"><p class="label">Pond</p><div data-id="pond"></div></div>
          <div><p class="label">Your books</p><div class="row" data-id="your-books"></div></div>
        </div>
        <p class="status" data-id="status" role="status"></p>
        <p class="note" data-id="last"></p>
        <p class="label">Ask for a rank you hold</p>
        <div class="row" data-id="asks"></div>
        <p class="label">Your hand</p>
        <div class="hand" data-id="hand"></div>
        <aside class="commentary" data-id="commentary">Commentary appears when a book is made.</aside>
      </div>
    `;
    const $ = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    let view: GoFishView | null = null;

    const book = (rank: number) => {
      const el = document.createElement("span");
      el.className = "gf-book";
      el.textContent = rankLabel(rank);
      return el;
    };

    function render() {
      const v = view;
      if (!v) return;
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"} (${v.opponentCount} cards)`;
      $("opp").replaceChildren(...Array.from({ length: v.opponentCount }, () => cardBack()));
      $("their-books").replaceChildren(...v.opponentBooks.map(book));
      $("your-books").replaceChildren(...v.yourBooks.map(book));
      $("pond").replaceChildren(cardBack(String(v.stockCount)));

      let status = v.yourTurn ? "Your turn: ask for a rank" : "Opponent's turn…";
      if (v.result === "you") status = `You win, ${v.yourBooks.length} books to ${v.opponentBooks.length}!`;
      else if (v.result === "opponent") status = `You lose, ${v.yourBooks.length} books to ${v.opponentBooks.length}.`;
      else if (v.result === "draw") status = "It's a draw.";
      $("status").textContent = status;
      $("last").textContent = v.lastAsk ? describeAsk(v.lastAsk) : "";

      const ranks = [...new Set(v.yourHand.map((c) => c.rank))];
      $("asks").replaceChildren(
        ...ranks.map((rank) => {
          const button = document.createElement("button");
          button.className = "small-btn";
          button.textContent = plural(rank);
          button.disabled = !v.yourTurn;
          button.addEventListener("click", () => {
            $("asks").querySelectorAll("button").forEach((b) => (b.disabled = true));
            send({ kind: "ask", rank });
          });
          return button;
        })
      );
      $("hand").replaceChildren(...v.yourHand.map((card) => cardElement(card)));
    }

    return {
      applyState(next) {
        view = next as GoFishView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
