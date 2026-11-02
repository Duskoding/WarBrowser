import type { ClientGame } from "../types";
import styles from "./war.css?inline";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: number; suit: Suit }; // rank 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

// A pair of cards that tied and started (or extended) a war.
type TiedPair = { yours: Card; opponent: Card };

// How the last resolved round ended; cleared when the next round starts.
type LastRound = {
  wasWar: boolean;
  winner: "you" | "opponent" | null; // null = draw
  cardsWon: number;
};

// One player's view of the table, from src/games/war.ts on the server.
type WarView = {
  yourCard: Card | null;
  opponentCard: Card | null; // visible as soon as the opponent flips; null until then
  pile: number; // cards in the middle
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  inWar: boolean; // true for the whole war, until it resolves
  warCards: TiedPair[]; // the tied cards so far (more than one when wars chain)
  lastRound: LastRound | null;
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

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;

function tiedCard(card: Card): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "tied-card";
  el.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
  el.textContent = cardLabel(card);
  return el;
}

function warResult(v: WarView): string {
  const round = v.lastRound;
  if (!round || round.winner === null) return "The war ended in a draw.";
  const cards = `${round.cardsWon} cards`;
  return round.winner === "you"
    ? `You won the war and took ${cards}!`
    : `${v.opponentName || "Your opponent"} won the war and took ${cards}.`;
}

const canFlip = (v: WarView) => v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);

export const war: ClientGame = {
  id: "war",
  styles,
  isFinished: (view) => (view as WarView).phase === "gameOver",
  mount(root, { send, setBackground }) {
    root.innerHTML = `
      <div class="war-table">
        <section class="player them">
          <h2><span data-id="them-name">Opponent</span> <span class="count" data-id="them-count"></span></h2>
          <div class="card" data-id="them-card"><div class="face"></div><div class="back"></div></div>
        </section>
        <div class="middle">
          <p class="status" data-id="status"></p>
          <div class="war-cards" data-id="war-cards" hidden></div>
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
        else if (v.yourCard && !v.opponentCard) status = `${v.inWar ? "WAR! " : ""}Waiting for opponent to flip…`;
        else if (v.inWar) status = v.phase === "flipped" ? "WAR! Opponent flipped — your turn!" : "WAR! Flip again";
        else if (v.phase === "roundOver" && v.lastRound?.wasWar) status = warResult(v);
        $("status").textContent = status;

        const pairs = v.inWar ? v.warCards : [];
        const warCards = $("war-cards");
        warCards.hidden = pairs.length === 0;
        warCards.replaceChildren(
          ...pairs.map((pair) => {
            const row = document.createElement("div");
            row.className = "war-pair";
            row.append("Tied: ", tiedCard(pair.yours), " vs ", tiedCard(pair.opponent));
            return row;
          })
        );

        setBackground(v.inWar ? "var(--felt-war)" : null);
        flipBtn.disabled = !canFlip(v);
      },
      commentary(text, round) {
        if (round <= lastCommentaryRound) return; // a slow reply for an older round
        lastCommentaryRound = round;
        $("commentary").textContent = text;
      }
    };
  }
};
