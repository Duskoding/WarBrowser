// The poker table. main.ts shows/hides it and feeds it poker_state views.

import { sendGame } from "./connection";
import type { Card, PokerAction, PokerView } from "./types";

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const TEMPLATE = `
  <section class="seat them">
    <span class="dealer" id="pk-them-dealer" hidden>D</span>
    <strong id="pk-them-name">Opponent</strong>
    <span class="stack" id="pk-them-stack"></span>
  </section>
  <div class="hand" id="pk-them-cards"></div>
  <p class="bet" id="pk-them-bet"></p>
  <div class="hand board" id="pk-board"></div>
  <p class="pot" id="pk-pot"></p>
  <p class="bet" id="pk-you-bet"></p>
  <div class="hand" id="pk-you-cards"></div>
  <section class="seat you">
    <span class="dealer" id="pk-you-dealer" hidden>D</span>
    <strong id="pk-you-name">You</strong>
    <span class="stack" id="pk-you-stack"></span>
  </section>
  <p class="status" id="pk-status"></p>
  <p class="last-action" id="pk-last"></p>
  <div class="controls" id="pk-controls">
    <button type="button" id="pk-fold">Fold</button>
    <button type="button" id="pk-check">Check</button>
    <div class="raise">
      <input id="pk-amount" type="number" inputmode="numeric" step="1" aria-label="Bet amount" />
      <button type="button" id="pk-raise">Raise</button>
      <button type="button" id="pk-allin">All-in</button>
    </div>
    <p class="hint" id="pk-hint"></p>
  </div>
  <div class="controls" id="pk-next" hidden>
    <button type="button" id="pk-next-hand">Next hand</button>
  </div>
`;

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;

function makeCard(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "card slot";
  el.innerHTML = `<div class="face"></div><div class="back"></div>`;
  return el;
}

const shown = new WeakMap<HTMLElement, string>();

// card === undefined: empty slot; null: face-down; Card: face-up.
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
  void el.offsetWidth; // restart the flip animation
  el.classList.add("flipped");
}

const money = (n: number) => n.toLocaleString("en-US");

function describeAction(v: PokerView): string {
  const a = v.lastAction;
  if (!a) return "";
  const who = a.who === "you" ? "You" : v.opponentName || "Opponent";
  const past = a.who === "you" ? "" : "s"; // "You post" / "Sam posts"
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

export type PokerTable = {
  render(v: PokerView | null, opts: { opponentHere: boolean; name: string; opponentName: string }): void;
};

export function createPokerTable(root: HTMLElement): PokerTable {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;

  const themCards = [makeCard(), makeCard()];
  const youCards = [makeCard(), makeCard()];
  const boardCards = Array.from({ length: 5 }, makeCard);
  $("pk-them-cards").append(...themCards);
  $("pk-you-cards").append(...youCards);
  $("pk-board").append(...boardCards);

  const foldBtn = $<HTMLButtonElement>("pk-fold");
  const checkBtn = $<HTMLButtonElement>("pk-check");
  const raiseBtn = $<HTMLButtonElement>("pk-raise");
  const allInBtn = $<HTMLButtonElement>("pk-allin");
  const nextBtn = $<HTMLButtonElement>("pk-next-hand");
  const amountInput = $<HTMLInputElement>("pk-amount");
  const controlButtons = [foldBtn, checkBtn, raiseBtn, allInBtn, nextBtn];

  let current: PokerView | null = null;
  let inputKey = "";

  const act = (action: PokerAction) => {
    controlButtons.forEach((b) => (b.disabled = true)); // re-enabled by the next state
    amountInput.disabled = true;
    sendGame({ kind: "action", action });
  };

  foldBtn.addEventListener("click", () => act({ type: "fold" }));
  checkBtn.addEventListener("click", () => {
    const legal = current?.legal;
    if (legal) act(legal.check ? { type: "check" } : { type: "call" });
  });
  raiseBtn.addEventListener("click", () => {
    const legal = current?.legal;
    if (!legal || legal.minRaiseTo === null || legal.maxRaiseTo === null) return;
    const typed = Math.round(Number(amountInput.value));
    const to = Number.isFinite(typed) ? typed : legal.minRaiseTo;
    act({ type: "raise", to: Math.min(Math.max(to, legal.minRaiseTo), legal.maxRaiseTo) });
  });
  allInBtn.addEventListener("click", () => {
    const max = current?.legal?.maxRaiseTo;
    if (max != null) act({ type: "raise", to: max });
  });
  nextBtn.addEventListener("click", () => {
    nextBtn.disabled = true;
    sendGame({ kind: "next_hand" });
  });

  function render(v: PokerView | null, opts: { opponentHere: boolean; name: string; opponentName: string }) {
    current = v;
    const opp = v?.opponentName || opts.opponentName || "Opponent";
    $("pk-you-name").textContent = v?.yourName || opts.name;
    $("pk-them-name").textContent = opts.opponentHere ? opp : "Opponent";
    $("pk-you-stack").textContent = v ? money(v.yourStack) : "";
    $("pk-them-stack").textContent = v ? money(v.opponentStack) : "";
    $("pk-you-dealer").hidden = !v?.youAreButton;
    $("pk-them-dealer").hidden = !v || v.youAreButton;

    const over = v?.phase === "handOver" || v?.phase === "gameOver";
    themCards.forEach((el, i) => setCard(el, v ? (v.opponentCards?.[i] ?? null) : undefined));
    youCards.forEach((el, i) => setCard(el, v?.yourCards[i]));
    boardCards.forEach((el, i) => setCard(el, v?.board[i]));

    $("pk-pot").textContent = v ? `Pot ${money(v.pot)}` : "";
    $("pk-you-bet").textContent = v && v.yourCommitted > 0 ? `Your bet: ${money(v.yourCommitted)}` : "";
    $("pk-them-bet").textContent = v && v.opponentCommitted > 0 ? `${opp}'s bet: ${money(v.opponentCommitted)}` : "";

    let status = "";
    let last = "";
    if (!opts.opponentHere) status = "Waiting for opponent — share the invite link";
    else if (!v) status = "Dealing…";
    else if (v.phase === "gameOver") {
      status = v.winner === "you" ? "You win the match!" : `${opp} wins the match.`;
      last = describeResult(v);
    } else if (v.phase === "handOver") {
      status = describeResult(v);
    } else {
      status = v.yourTurn ? "Your turn" : `Waiting for ${opp}…`;
      last = describeAction(v);
    }
    $("pk-status").textContent = status;
    $("pk-last").textContent = last;

    const legal = v?.legal ?? null;
    const playing = !!v && !over && opts.opponentHere;
    $("pk-controls").hidden = !playing;
    $("pk-next").hidden = !(v?.phase === "handOver");
    nextBtn.disabled = !v || v.youReady;
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
      $("pk-hint").textContent = `${money(legal.minRaiseTo)} – ${money(legal.maxRaiseTo)}`;
    } else {
      $("pk-hint").textContent = "";
    }
    // Default the amount to the minimum raise once per decision, without clobbering typing.
    const key = `${v?.handNumber}|${v?.phase}|${v?.yourTurn}|${legal?.minRaiseTo}|${legal?.maxRaiseTo}`;
    if (key !== inputKey) {
      inputKey = key;
      amountInput.value = legal?.minRaiseTo != null ? String(legal.minRaiseTo) : "";
    }
  }

  return { render };
}
