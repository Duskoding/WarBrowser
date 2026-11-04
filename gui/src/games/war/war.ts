import type { GuiModule } from "../GuiModule";
import styles from "./war.css?inline";

// The War table: felt, flipping cards, the war lineup and round commentary.
// Drawn inside its own shadow root (see ../GuiModule.ts), so ids and CSS here
// can't clash with the lobby or other games.

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: number; suit: Suit }; // rank 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

type TiedPair = { yours: Card; opponent: Card };

type LastRound = {
  wasWar: boolean;
  winner: "you" | "opponent" | null;
  cardsWon: number;
};

type StakeCard = { faceUp: true; card: Card } | { faceUp: false };

type WarView = {
  yourCard: Card | null;
  opponentCard: Card | null;
  pile: number;
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  inWar: boolean;
  warCards: TiedPair[];
  yourStakes?: StakeCard[];
  opponentStakes?: StakeCard[];
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

/** After a round resolves, show faces briefly then tuck to backs. */
const REVEAL_MS = 1500;

const FELT = "radial-gradient(ellipse 90% 70% at 50% 35%, #165a32 0%, #0e3d22 100%)";
const FELT_WAR = "radial-gradient(ellipse 90% 70% at 50% 35%, #6b1a1a 0%, #3d0e0e 100%)";

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;

const canFlip = (v: WarView) => v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);

function warResult(v: WarView): string {
  const round = v.lastRound;
  if (!round || round.winner === null) return "The war ended in a draw.";
  const cards = `${round.cardsWon} cards`;
  return round.winner === "you"
    ? `You won the war and took ${cards}!`
    : `${v.opponentName || "Your opponent"} won the war and took ${cards}.`;
}

function roundTakeResult(v: WarView): string {
  const round = v.lastRound;
  if (!round) return STATUS.roundOver;
  if (round.winner === "you") return "You take the cards!";
  if (round.winner === "opponent") return "Opponent takes the cards.";
  return "Draw — cards go back.";
}

export const war: GuiModule = {
  id: "war",
  styles,
  isFinished: (view) => (view as WarView).phase === "gameOver",
  mount(root, { send, setBackground }) {
    const table = document.createElement("main");
    table.className = "table";
    table.innerHTML = `
      <section class="player them">
        <h2><span id="them-name">Opponent</span> <span class="count" id="them-count"></span></h2>
        <div class="card" id="them-card"><div class="face"></div><div class="back"></div></div>
        <div class="stakes" id="them-stakes" hidden aria-label="Opponent war cards"></div>
      </section>
      <div class="middle">
        <p class="status" id="status"></p>
        <p class="pile" id="pile"></p>
      </div>
      <section class="player you">
        <div class="stakes" id="you-stakes" hidden aria-label="Your war cards"></div>
        <div class="card" id="you-card"><div class="face"></div><div class="back"></div></div>
        <h2><span id="you-name">You</span> <span class="count" id="you-count"></span></h2>
      </section>
      <button id="flip" disabled>Flip</button>
      <aside class="commentary" id="commentary">Commentary will appear here.</aside>
    `;
    root.append(table);

    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.getElementById(id) as T;
    const flipBtn = $<HTMLButtonElement>("flip");
    flipBtn.addEventListener("click", () => {
      flipBtn.disabled = true;
      send({ kind: "flip" });
    });

    const shown = new WeakMap<HTMLElement, string>();
    function renderCard(el: HTMLElement, card: Card | null) {
      const key = card ? `${card.rank}${card.suit}` : "";
      if (shown.get(el) === key) return;
      shown.set(el, key);
      if (!card) {
        el.classList.remove("flipped");
        return;
      }
      const face = el.querySelector<HTMLDivElement>(".face")!;
      face.textContent = cardLabel(card);
      face.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
      el.classList.remove("flipped");
      void el.offsetWidth;
      el.classList.add("flipped");
    }

    function renderStakes(el: HTMLElement, stakes: StakeCard[]) {
      el.hidden = stakes.length === 0;
      el.replaceChildren(
        ...stakes.map((stake) => {
          const chip = document.createElement("div");
          if (!stake.faceUp) {
            chip.className = "stake-card back";
            chip.title = "Face-down";
            return chip;
          }
          chip.className = "stake-card face";
          chip.textContent = cardLabel(stake.card);
          if (stake.card.suit === "♥" || stake.card.suit === "♦") chip.classList.add("red");
          return chip;
        })
      );
    }

    let view: WarView | null = null;
    let cardsTucked = false;
    let revealKey = "";
    let tuckTimer: number | undefined;
    let lastCommentaryRound = 0;

    function syncReveal(v: WarView) {
      const resolved = v.phase === "roundOver" || v.phase === "gameOver";
      const hasFaces =
        !!v.yourCard ||
        !!v.opponentCard ||
        (v.yourStakes?.length ?? 0) > 0 ||
        (v.opponentStakes?.length ?? 0) > 0;
      if (!resolved || !hasFaces) {
        cardsTucked = false;
        revealKey = "";
        clearTimeout(tuckTimer);
        return;
      }
      const key = [
        v.phase,
        v.yourCount,
        v.opponentCount,
        v.lastRound?.winner ?? "",
        v.lastRound?.cardsWon ?? 0,
        v.yourCard ? cardLabel(v.yourCard) : "",
        v.opponentCard ? cardLabel(v.opponentCard) : "",
        v.yourStakes?.length ?? 0,
        v.opponentStakes?.length ?? 0
      ].join(":");
      if (key === revealKey) return;
      revealKey = key;
      cardsTucked = false;
      clearTimeout(tuckTimer);
      tuckTimer = window.setTimeout(() => {
        cardsTucked = true;
        render();
      }, REVEAL_MS);
    }

    function render() {
      const v = view;
      if (!v) return;
      syncReveal(v);
      const tuck = cardsTucked && (v.phase === "roundOver" || v.phase === "gameOver");
      const yourCard = tuck ? null : v.yourCard;
      const themCard = tuck ? null : v.opponentCard;
      const yourStakes = tuck ? [] : (v.yourStakes ?? []);
      const themStakes = tuck ? [] : (v.opponentStakes ?? []);
      const warLayout = yourStakes.length > 0 || themStakes.length > 0;
      $("you-name").textContent = v.yourName || "You";
      $("them-name").textContent = v.opponentName || "Opponent";
      $("you-count").textContent = `(${v.yourCount})`;
      $("them-count").textContent = `(${v.opponentCount})`;
      $("you-card").hidden = warLayout && !yourCard;
      $("them-card").hidden = warLayout && !themCard;
      renderCard($("you-card"), yourCard);
      renderCard($("them-card"), themCard);
      renderStakes($("you-stakes"), yourStakes);
      renderStakes($("them-stakes"), themStakes);
      table.classList.toggle("war-layout", warLayout);
      $("pile").textContent = v.pile > 0 ? `${v.pile} card${v.pile === 1 ? "" : "s"} in the middle` : "";

      let status: string;
      if (v.phase === "gameOver" && tuck) status = v.winner === "you" ? "You win!" : v.winner ? "You lose." : "It's a draw.";
      else if (v.phase === "gameOver" && !tuck) status = roundTakeResult(v);
      else if (v.yourCard && !v.opponentCard) {
        status = `${v.inWar ? "WAR! " : ""}Waiting for opponent to flip…`;
      } else if (v.inWar) {
        status = v.phase === "flipped" ? "WAR! Opponent flipped — your turn!" : "WAR! Flip again";
      } else if (v.phase === "roundOver" && !tuck && v.lastRound?.wasWar) {
        status = warResult(v);
      } else if (v.phase === "roundOver" && !tuck) {
        status = roundTakeResult(v);
      } else status = STATUS[v.phase];
      $("status").textContent = status;

      setBackground(v.inWar || (!!v.lastRound?.wasWar && !tuck) ? FELT_WAR : FELT);
      flipBtn.disabled = !canFlip(v) || (v.phase === "roundOver" && !tuck);
    }

    return {
      applyState(next) {
        view = next as WarView;
      },
      render,
      commentary(text, round) {
        if (round <= lastCommentaryRound) return;
        lastCommentaryRound = round;
        $("commentary").textContent = text;
      },
      destroy() {
        clearTimeout(tuckTimer);
      }
    };
  }
};
