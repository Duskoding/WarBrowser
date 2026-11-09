import type { GuiModule } from "../GuiModule";
import styles from "./poker.css?inline";

type Suit = "♠" | "♥" | "♦" | "♣";
type Card = { rank: number; suit: Suit };
type Phase = "preflop" | "flop" | "turn" | "river" | "handOver" | "gameOver";

type Legal = {
  fold: boolean;
  check: boolean;
  call: number;
  minRaiseTo: number | null;
  maxRaiseTo: number | null;
};

type PokerView = {
  phase: Phase;
  handNumber: number;
  youAreButton: boolean;
  yourName?: string;
  opponentName?: string;
  yourCards: Card[];
  opponentCards: Card[] | null;
  board: Card[];
  pot: number;
  yourStack: number;
  opponentStack: number;
  yourCommitted: number;
  opponentCommitted: number;
  yourTurn: boolean;
  legal: Legal | null;
  lastAction: { who: "you" | "opponent"; type: string; amount: number } | null;
  result: {
    reason: "fold" | "showdown";
    winners: ("you" | "opponent")[];
    youWon: number;
    opponentWon: number;
    yourHand: string | null;
    opponentHand: string | null;
  } | null;
  youReady: boolean;
  winner: "you" | "opponent" | null;
};

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const FELT = "radial-gradient(ellipse 90% 70% at 50% 35%, #165a32 0%, #0e3d22 100%)";

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;
const money = (n: number) => n.toLocaleString("en-US");

function makeCard(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "card slot";
  el.innerHTML = `<div class="face"></div><div class="back"></div>`;
  return el;
}

const shown = new WeakMap<HTMLElement, string>();

function setCard(el: HTMLElement, card: Card | null | undefined) {
  const key = card === undefined ? "empty" : card === null ? "down" : cardLabel(card);
  if (shown.get(el) === key) return;
  shown.set(el, key);
  el.classList.toggle("slot", card === undefined);
  if (!card) {
    el.classList.remove("flipped");
    return;
  }
  const face = el.querySelector<HTMLDivElement>(".face")!;
  face.textContent = cardLabel(card);
  face.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
  void el.offsetWidth;
  el.classList.add("flipped");
}

function describeAction(v: PokerView): string {
  const a = v.lastAction;
  if (!a) return "";
  const who = a.who === "you" ? "You" : v.opponentName || "Opponent";
  const past = a.who === "you" ? "" : "s";
  switch (a.type) {
    case "fold":
      return `${who} folded`;
    case "check":
      return `${who} checked`;
    case "call":
      return `${who} called ${money(a.amount)}`;
    case "raise":
      return `${who} raised to ${money(a.amount)}`;
    case "smallBlind":
      return `${who} post${past} the small blind (${money(a.amount)})`;
    case "bigBlind":
      return `${who} post${past} the big blind (${money(a.amount)})`;
    default:
      return "";
  }
}

function describeResult(v: PokerView): string {
  const r = v.result;
  if (!r) return "";
  const opp = v.opponentName || "Opponent";
  if (r.winners.length === 2) {
    return `Split pot of ${money(r.youWon + r.opponentWon)}${r.yourHand ? ` — ${r.yourHand}` : ""}`;
  }
  const youWon = r.winners[0] === "you";
  const amount = money(youWon ? r.youWon : r.opponentWon);
  const hand = youWon ? r.yourHand : r.opponentHand;
  const who = youWon ? "You win" : `${opp} wins`;
  if (r.reason === "fold") return `${who} ${amount} — ${youWon ? opp : "you"} folded`;
  return `${who} ${amount} with ${hand}`;
}

export const poker: GuiModule = {
  id: "poker",
  styles,
  isFinished: (view) => (view as PokerView).phase === "gameOver",
  mount(root, { send, setBackground }) {
    setBackground(FELT);
    const table = document.createElement("div");
    table.className = "poker";
    table.innerHTML = `
      <section class="seat them">
        <span class="dealer" data-id="them-dealer" hidden>D</span>
        <strong data-id="them-name">Opponent</strong>
        <span class="stack" data-id="them-stack"></span>
      </section>
      <div class="hand" data-id="them-cards"></div>
      <p class="bet" data-id="them-bet"></p>
      <div class="hand board" data-id="board"></div>
      <p class="pot" data-id="pot"></p>
      <p class="bet" data-id="you-bet"></p>
      <div class="hand" data-id="you-cards"></div>
      <section class="seat you">
        <span class="dealer" data-id="you-dealer" hidden>D</span>
        <strong data-id="you-name">You</strong>
        <span class="stack" data-id="you-stack"></span>
      </section>
      <p class="status" data-id="status"></p>
      <p class="last-action" data-id="last"></p>
      <div class="controls" data-id="controls">
        <button type="button" data-id="fold">Fold</button>
        <button type="button" data-id="check">Check</button>
        <div class="raise">
          <input data-id="amount" type="number" inputmode="numeric" step="1" aria-label="Bet amount" />
          <button type="button" data-id="raise">Raise</button>
          <button type="button" data-id="allin">All-in</button>
        </div>
        <p class="hint" data-id="hint"></p>
      </div>
      <div class="controls" data-id="next" hidden>
        <button type="button" data-id="next-hand">Next hand</button>
      </div>
      <aside class="commentary" data-id="commentary">Commentary will appear here.</aside>
    `;
    root.append(table);

    const q = <T extends HTMLElement = HTMLElement>(id: string) =>
      table.querySelector<T>(`[data-id="${id}"]`)!;

    const themCards = [makeCard(), makeCard()];
    const youCards = [makeCard(), makeCard()];
    const boardCards = Array.from({ length: 5 }, makeCard);
    q("them-cards").append(...themCards);
    q("you-cards").append(...youCards);
    q("board").append(...boardCards);

    const foldBtn = q<HTMLButtonElement>("fold");
    const checkBtn = q<HTMLButtonElement>("check");
    const raiseBtn = q<HTMLButtonElement>("raise");
    const allInBtn = q<HTMLButtonElement>("allin");
    const nextBtn = q<HTMLButtonElement>("next-hand");
    const amountInput = q<HTMLInputElement>("amount");

    let view: PokerView | null = null;
    let inputKey = "";
    let lastCommentaryRound = 0;

    const lock = () => {
      for (const button of [foldBtn, checkBtn, raiseBtn, allInBtn, nextBtn]) button.disabled = true;
      amountInput.disabled = true;
    };

    foldBtn.addEventListener("click", () => {
      lock();
      send({ kind: "fold" });
    });
    checkBtn.addEventListener("click", () => {
      const legal = view?.legal;
      if (!legal) return;
      lock();
      send(legal.check ? { kind: "check" } : { kind: "call" });
    });
    raiseBtn.addEventListener("click", () => {
      const legal = view?.legal;
      if (!legal || legal.minRaiseTo === null || legal.maxRaiseTo === null) return;
      const typed = Math.round(Number(amountInput.value));
      const to = Number.isFinite(typed) ? typed : legal.minRaiseTo;
      lock();
      send({ kind: "raise", to: Math.min(Math.max(to, legal.minRaiseTo), legal.maxRaiseTo) });
    });
    allInBtn.addEventListener("click", () => {
      const max = view?.legal?.maxRaiseTo;
      if (max == null) return;
      lock();
      send({ kind: "raise", to: max });
    });
    nextBtn.addEventListener("click", () => {
      lock();
      send({ kind: "next_hand" });
    });

    function render() {
      const v = view;
      const opp = v?.opponentName || "Opponent";
      q("you-name").textContent = v?.yourName || "You";
      q("them-name").textContent = opp;
      q("you-stack").textContent = v ? money(v.yourStack) : "";
      q("them-stack").textContent = v ? money(v.opponentStack) : "";
      q<HTMLElement>("you-dealer").hidden = !v?.youAreButton;
      q<HTMLElement>("them-dealer").hidden = !v || v.youAreButton;

      const over = v?.phase === "handOver" || v?.phase === "gameOver";
      themCards.forEach((el, i) => setCard(el, v ? (v.opponentCards?.[i] ?? null) : undefined));
      youCards.forEach((el, i) => setCard(el, v?.yourCards[i]));
      boardCards.forEach((el, i) => setCard(el, v?.board[i]));

      q("pot").textContent = v ? `Pot ${money(v.pot)}` : "";
      q("you-bet").textContent = v && v.yourCommitted > 0 ? `Your bet: ${money(v.yourCommitted)}` : "";
      q("them-bet").textContent = v && v.opponentCommitted > 0 ? `${opp}'s bet: ${money(v.opponentCommitted)}` : "";

      let status = "Dealing…";
      let last = "";
      if (!v) status = "Dealing…";
      else if (v.phase === "gameOver") {
        status = v.winner === "you" ? "You win the match!" : `${opp} wins the match.`;
        last = describeResult(v);
      } else if (v.phase === "handOver") {
        status = describeResult(v);
      } else {
        status = v.yourTurn ? "Your turn" : `Waiting for ${opp}…`;
        last = describeAction(v);
      }
      q("status").textContent = status;
      q("last").textContent = last;

      const legal = v?.legal ?? null;
      const playing = !!v && !over;
      q<HTMLElement>("controls").hidden = !playing;
      q<HTMLElement>("next").hidden = v?.phase !== "handOver";
      nextBtn.disabled = !v || v.youReady || v.phase === "gameOver";
      nextBtn.textContent = v?.youReady ? `Waiting for ${opp}…` : "Next hand";

      const yourTurn = !!v?.yourTurn && !!legal;
      foldBtn.disabled = !yourTurn || !legal?.fold;
      checkBtn.textContent = legal && !legal.check ? `Call ${money(legal.call)}` : "Check";
      checkBtn.disabled = !yourTurn || !(legal?.check || (legal?.call ?? 0) > 0);
      const canRaise = yourTurn && legal?.minRaiseTo != null && legal.maxRaiseTo != null;
      raiseBtn.textContent = v && v.opponentCommitted > 0 ? "Raise to" : "Bet";
      raiseBtn.disabled = !canRaise;
      allInBtn.disabled = !canRaise;
      amountInput.disabled = !canRaise;
      if (legal?.minRaiseTo != null && legal.maxRaiseTo != null) {
        amountInput.min = String(legal.minRaiseTo);
        amountInput.max = String(legal.maxRaiseTo);
        q("hint").textContent = `${money(legal.minRaiseTo)} – ${money(legal.maxRaiseTo)}`;
      } else {
        q("hint").textContent = "";
      }
      const key = `${v?.handNumber}|${v?.phase}|${v?.yourTurn}|${legal?.minRaiseTo}|${legal?.maxRaiseTo}`;
      if (key !== inputKey) {
        inputKey = key;
        amountInput.value = legal?.minRaiseTo != null ? String(legal.minRaiseTo) : "";
      }
    }

    return {
      applyState(next) {
        view = next as PokerView;
      },
      render,
      commentary(text, round) {
        if (round <= lastCommentaryRound) return;
        lastCommentaryRound = round;
        q("commentary").textContent = text;
      },
    };
  },
};
