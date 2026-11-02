import "./war.css";
import type { ClientGame } from "../types";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: number; suit: Suit }; // rank 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

// One player's view of the table, from src/games/war.ts on the server.
type WarView = {
  yourCard: Card | null;
  opponentCard: Card | null; // null = face-down until both have flipped
  pile: number; // cards in the middle
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  winner?: "you" | "opponent";
  yourName?: string;
  opponentName?: string;
};

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const STATUS: Record<Phase, string> = {
  waiting: "Flip when ready",
  flipped: "Opponent flipped — your turn!",
  war: "WAR! Flip again",
  roundOver: "Flip for the next round",
  gameOver: ""
};

const canFlip = (v: WarView) => v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);

export const war: ClientGame = {
  id: "war",
  isFinished: (view) => (view as WarView).phase === "gameOver",
  mount(root, { send }) {
    root.innerHTML = `
      <div class="war-table">
        <section class="player them">
          <h2><span data-id="them-name">Opponent</span> <span class="count" data-id="them-count"></span></h2>
          <div class="card" data-id="them-card"><div class="face"></div><div class="back"></div></div>
        </section>
        <div class="middle">
          <p class="status" data-id="status"></p>
          <p class="pile" data-id="pile"></p>
        </div>
        <section class="player you">
          <div class="card" data-id="you-card"><div class="face"></div><div class="back"></div></div>
          <h2><span data-id="you-name">You</span> <span class="count" data-id="you-count"></span></h2>
        </section>
        <button data-id="flip" disabled>Flip</button>
        <aside class="commentary" data-id="commentary">Commentary will appear here.</aside>
      </div>
    `;
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector(`[data-id="${id}"]`) as T;
    const flipBtn = $<HTMLButtonElement>("flip");
    flipBtn.addEventListener("click", () => {
      flipBtn.disabled = true; // re-enabled by the next state
      send({ kind: "flip" });
    });

    const shown = new WeakMap<HTMLElement, string>();
    function renderCard(el: HTMLElement, card: Card | null) {
      const key = card ? `${card.rank}${card.suit}` : "";
      if (shown.get(el) === key) return; // don't replay the flip on unchanged cards
      shown.set(el, key);
      if (!card) {
        el.classList.remove("flipped");
        return;
      }
      const face = el.querySelector<HTMLDivElement>(".face")!;
      face.textContent = `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;
      face.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
      el.classList.remove("flipped");
      void el.offsetWidth; // restart the animation
      el.classList.add("flipped");
    }

    let lastCommentaryRound = 0;

    return {
      update(view) {
        const v = view as WarView;
        $("you-name").textContent = v.yourName || "You";
        $("them-name").textContent = v.opponentName || "Opponent";
        $("you-count").textContent = `(${v.yourCount})`;
        $("them-count").textContent = `(${v.opponentCount})`;
        renderCard($("you-card"), v.yourCard);
        renderCard($("them-card"), v.opponentCard);
        $("pile").textContent = v.pile > 0 ? `${v.pile} card${v.pile === 1 ? "" : "s"} in the middle` : "";

        let status = STATUS[v.phase];
        if (v.phase === "gameOver") status = v.winner === "you" ? "You win!" : v.winner ? "You lose." : "It's a draw.";
        else if (v.yourCard && !v.opponentCard) status = "Waiting for opponent to flip…";
        $("status").textContent = status;

        document.body.classList.toggle("war", v.phase === "war");
        flipBtn.disabled = !canFlip(v);
      },
      commentary(text, round) {
        if (round <= lastCommentaryRound) return; // a slow reply for an older round
        lastCommentaryRound = round;
        $("commentary").textContent = text;
      },
      destroy() {
        document.body.classList.remove("war");
        root.innerHTML = "";
      }
    };
  }
};
