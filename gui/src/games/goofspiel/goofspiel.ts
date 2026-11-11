import type { GuiModule } from "../GuiModule";
import shared from "../shared/shared.css?inline";
import { cardBack, cardElement, commentaryBox, rankLabel, type ViewSuit } from "../shared/cards";
import styles from "./goofspiel.css?inline";

type Outcome = "you" | "opponent" | "draw";

type GoofspielView = {
  round: number;
  prize: number | null;
  carried: number[];
  yourHand: number[];
  yourBid: number | null;
  opponentBid: boolean;
  yourScore: number;
  opponentScore: number;
  prizesLeft: number;
  yourSuit: ViewSuit;
  lastRound: { round: number; yours: number; theirs: number; prizes: number[]; winner: Outcome } | null;
  result?: Outcome;
  yourName?: string;
  opponentName?: string;
};

export const goofspiel: GuiModule = {
  id: "goofspiel",
  styles: shared + styles,
  isFinished: (view) => (view as GoofspielView).result !== undefined,
  mount(root, { send, setBackground }) {
    setBackground("radial-gradient(circle at 50% 30%, #2b5f8a, #173a57)");
    root.innerHTML = `
      <div class="game goof">
        <p class="players" data-id="players"></p>
        <div class="score" data-id="score"><span>You <strong></strong></span><span>Them <strong></strong></span></div>
        <div class="goof-table">
          <div class="goof-slot"><p class="label">Their bid</p><div data-id="their-bid"></div></div>
          <div class="goof-slot prize"><p class="label" data-id="prize-label">Prize</p><div class="row" data-id="prize"></div></div>
          <div class="goof-slot"><p class="label">Your bid</p><div data-id="your-bid"></div></div>
        </div>
        <p class="status" data-id="status" role="status"></p>
        <p class="note" data-id="last"></p>
        <p class="label">Your hand — click a card to bid it</p>
        <div class="hand" data-id="hand"></div>
        <aside class="commentary" data-id="commentary">Commentary will appear here.</aside>
      </div>
    `;
    const $ = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    let view: GoofspielView | null = null;

    function render() {
      const v = view;
      if (!v) return;
      $("players").textContent = `${v.yourName ?? "You"} vs ${v.opponentName ?? "Opponent"} · round ${v.round} of 13`;
      const [yours, theirs] = $("score").querySelectorAll("strong");
      yours.textContent = String(v.yourScore);
      theirs.textContent = String(v.opponentScore);

      const prizes = v.prize === null ? [] : [...v.carried, v.prize];
      $("prize").replaceChildren(...prizes.map((p) => cardElement({ rank: p, suit: "D" })));
      $("prize-label").textContent =
        v.carried.length > 0 ? `Prize (${prizes.reduce((a, b) => a + b, 0)} points, carried from a tie)` : "Prize";

      $("your-bid").replaceChildren(v.yourBid === null ? cardBack("?") : cardElement({ rank: v.yourBid, suit: v.yourSuit }));
      $("their-bid").replaceChildren(cardBack(v.opponentBid ? "✓" : "…"));

      let status = v.yourBid === null ? "Choose your bid" : "Waiting for your opponent's bid…";
      if (v.yourBid === null && v.opponentBid) status = "Choose your bid (they've bid)";
      if (v.result === "you") status = "You win!";
      else if (v.result === "opponent") status = "You lose.";
      else if (v.result === "draw") status = "It's a draw.";
      $("status").textContent = status;

      const last = v.lastRound;
      $("last").textContent = last
        ? `Round ${last.round}: you bid ${rankLabel(last.yours)}, they bid ${rankLabel(last.theirs)}. ` +
          (last.winner === "draw"
            ? "Tie: the prize stays on the table."
            : `${last.winner === "you" ? "You" : "They"} took ${last.prizes.reduce((a, b) => a + b, 0)} points.`)
        : "";

      const canBid = v.result === undefined && v.yourBid === null;
      $("hand").replaceChildren(
        ...v.yourHand.map((value) => {
          const card = cardElement({ rank: value, suit: v.yourSuit }, "button") as HTMLButtonElement;
          card.disabled = !canBid;
          card.addEventListener("click", () => {
            $("hand").querySelectorAll("button").forEach((b) => (b.disabled = true));
            send({ kind: "bid", value });
          });
          return card;
        })
      );
    }

    return {
      applyState(next) {
        view = next as GoofspielView;
      },
      render,
      commentary: commentaryBox($("commentary"))
    };
  }
};
