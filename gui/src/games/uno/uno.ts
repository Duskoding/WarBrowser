import type { GuiModule } from "../GuiModule";
import styles from "./uno.css?inline";

type Color = "red" | "yellow" | "green" | "blue";
type Rank = number | "skip" | "reverse" | "drawTwo" | "wild" | "wildDrawFour";
type Card = { color: Color | null; rank: Rank };

// One player's view, from toView in src/games/uno/index.ts on the server.
type UnoView = {
  hand: Card[]; // in server order: play sends the index into this array
  handCounts: number[]; // every seat's hand size
  names: string[];
  yourSeat: number;
  discardTop: Card;
  activeColor: Color; // the color to match (a wild's chosen color)
  direction: 1 | -1;
  currentSeat: number;
  yourTurn: boolean;
  drawPileCount: number;
  round: number; // moves so far; matches the commentary's round
  over: boolean;
  winnerSeat: number | null;
};

const COLORS: Color[] = ["red", "yellow", "green", "blue"];
const COLOR_NAMES: Record<Color, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };
const SYMBOLS: Record<string, string> = { skip: "⊘", reverse: "⇄", drawTwo: "+2", wild: "★", wildDrawFour: "+4" };
const RANK_NAMES: Record<string, string> = {
  skip: "Skip",
  reverse: "Reverse",
  drawTwo: "Draw Two",
  wild: "Wild",
  wildDrawFour: "Wild Draw Four"
};
const TABLE = "radial-gradient(circle at 50% 35%, #3a1d5c 0%, #1d0f30 60%, #120a1f 100%)";

const isWild = (card: Card) => card.rank === "wild" || card.rank === "wildDrawFour";
const cardName = (card: Card) => {
  const rank = RANK_NAMES[String(card.rank)] ?? String(card.rank);
  return card.color ? `${COLOR_NAMES[card.color]} ${rank}` : rank;
};
const sameCard = (a: Card, b: Card) => a.color === b.color && a.rank === b.rank;

// Same rule as UnoEngine.canPlay; only used to highlight cards. The server
// still checks every move.
const canPlay = (card: Card, v: UnoView) =>
  isWild(card) || card.color === v.activeColor || card.rank === v.discardTop.rank;

// Sort for display by color, then rank; each card keeps its server index.
const COLOR_ORDER = (card: Card) => (card.color ? COLORS.indexOf(card.color) : COLORS.length);
const RANK_ORDER = (card: Card) => (typeof card.rank === "number" ? card.rank : 10 + Object.keys(SYMBOLS).indexOf(card.rank));

function cardElement(card: Card, tag: "button" | "div" = "div"): HTMLElement {
  const el = document.createElement(tag);
  el.className = `uno-card ${card.color ?? "wild"}`;
  el.setAttribute("aria-label", cardName(card));
  const label = SYMBOLS[String(card.rank)] ?? String(card.rank);
  el.innerHTML = `<span class="corner"></span><span class="face"></span><span class="corner end"></span>`;
  el.querySelectorAll("span").forEach((span) => (span.textContent = label));
  return el;
}

// A built-in line about the move that just happened, worked out by comparing
// two views. Shown in the commentary box until the AI line for that move arrives.
function describeMove(before: UnoView, after: UnoView): string | null {
  const seat = before.currentSeat;
  const who = seat === after.yourSeat ? "You" : after.names[seat] ?? `Player ${seat + 1}`;
  if (!sameCard(before.discardTop, after.discardTop) || after.handCounts[seat] < before.handCounts[seat]) {
    const chose = isWild(after.discardTop) ? ` and chose ${COLOR_NAMES[after.activeColor]}` : "";
    return `${who} played ${cardName(after.discardTop)}${chose}.`;
  }
  if (after.handCounts[seat] > before.handCounts[seat]) return `${who} drew a card.`;
  return null;
}

export const uno: GuiModule = {
  id: "uno",
  styles,
  isFinished: (view) => (view as UnoView).over,
  mount(root, { send, setBackground }) {
    setBackground(TABLE);
    root.innerHTML = `
      <div class="uno">
        <ul class="opponents" data-id="opponents" aria-label="Other players"></ul>
        <div class="center">
          <button class="draw-pile" data-id="draw" aria-label="Draw a card">
            <span class="back">UNO</span><span class="count" data-id="count"></span>
          </button>
          <div data-id="top" aria-label="Top of the discard pile"></div>
          <div class="current" data-id="current">
            <span class="swatch"></span><span class="direction" data-id="direction"></span>
          </div>
        </div>
        <p class="status" data-id="status" aria-live="polite"></p>
        <div class="picker" data-id="picker" hidden>
          <p>Choose a color</p>
          <div class="swatches">
            ${COLORS.map((c) => `<button class="swatch-button ${c}" data-color="${c}" aria-label="${COLOR_NAMES[c]}"></button>`).join("")}
          </div>
          <button class="ghost small" data-id="cancel">Cancel</button>
        </div>
        <p class="hand-title" data-id="hand-title"></p>
        <div class="hand" data-id="hand" aria-label="Your hand"></div>
        <aside class="commentary" data-id="commentary">Moves and commentary will appear here.</aside>
      </div>
    `;
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;

    let view: UnoView | null = null;
    let previous: UnoView | null = null;
    let pendingWild: number | null = null; // hand index of a wild waiting for a color
    let waiting = false; // a move was sent; the next state re-enables the controls
    let lastCommentaryRound = 0; // round of the line in the commentary box

    const act = (payload: { kind: string } & Record<string, unknown>) => {
      waiting = true;
      pendingWild = null;
      render();
      send(payload);
    };

    $("draw").addEventListener("click", () => act({ kind: "draw" }));
    $("cancel").addEventListener("click", () => {
      pendingWild = null;
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((button) =>
      button.addEventListener("click", () => {
        if (pendingWild !== null) act({ kind: "play", cardIndex: pendingWild, chosenColor: button.dataset.color });
      })
    );

    function playerName(v: UnoView, seat: number) {
      return seat === v.yourSeat ? "You" : v.names[seat] ?? `Player ${seat + 1}`;
    }

    function renderOpponents(v: UnoView) {
      // Everyone else in turn order, starting with the player after you.
      const seats = v.names.map((_, i) => (v.yourSeat + i) % v.names.length).slice(1);
      $("opponents").replaceChildren(
        ...seats.map((seat) => {
          const count = v.handCounts[seat] ?? 0;
          const li = document.createElement("li");
          li.className = "opponent";
          li.classList.toggle("turn", !v.over && seat === v.currentSeat);
          li.classList.toggle("winner", seat === v.winnerSeat);
          li.classList.toggle("last-card", count === 1 && !v.over);
          li.innerHTML = `<strong></strong><span class="backs" aria-hidden="true"></span><span class="count"></span>`;
          li.querySelector("strong")!.textContent = v.names[seat] ?? `Player ${seat + 1}`;
          li.querySelector(".backs")!.append(
            ...Array.from({ length: Math.min(count, 10) }, () => Object.assign(document.createElement("span"), { className: "mini-back" }))
          );
          li.querySelector(".count")!.textContent = `${count} card${count === 1 ? "" : "s"}${count === 1 && !v.over ? " · UNO!" : ""}`;
          return li;
        })
      );
    }

    function renderHand(v: UnoView) {
      const myTurn = v.yourTurn && !v.over && !waiting;
      const order = v.hand.map((card, index) => ({ card, index }));
      order.sort((a, b) => COLOR_ORDER(a.card) - COLOR_ORDER(b.card) || RANK_ORDER(a.card) - RANK_ORDER(b.card));
      $("hand").replaceChildren(
        ...order.map(({ card, index }) => {
          const button = cardElement(card, "button") as HTMLButtonElement;
          const playable = myTurn && canPlay(card, v);
          button.disabled = !playable;
          button.classList.toggle("playable", playable);
          button.classList.toggle("choosing", pendingWild === index);
          button.addEventListener("click", () => {
            if (isWild(card)) {
              pendingWild = index;
              render();
              return;
            }
            act({ kind: "play", cardIndex: index });
          });
          return button;
        })
      );
      const n = v.hand.length;
      $("hand-title").textContent = `Your hand · ${n} card${n === 1 ? "" : "s"}`;
    }

    function statusText(v: UnoView) {
      if (v.over) return v.winnerSeat === v.yourSeat ? "You win! 🎉" : `${playerName(v, v.winnerSeat ?? 0)} wins!`;
      if (!v.yourTurn) return `${playerName(v, v.currentSeat)}'s turn…`;
      if (pendingWild !== null) return "Pick a color for your wild card";
      return v.hand.some((card) => canPlay(card, v)) ? "Your turn: play a card or draw" : "Your turn: no match, draw a card";
    }

    function render() {
      const v = view;
      if (!v) return;
      renderOpponents(v);
      $("top").replaceChildren(cardElement(v.discardTop));
      $("count").textContent = String(v.drawPileCount);
      $("current").className = `current ${v.activeColor}`;
      $("current").title = `Color to match: ${COLOR_NAMES[v.activeColor]}`;
      $("direction").textContent = v.direction === 1 ? "↻" : "↺";
      $("direction").title = v.direction === 1 ? "Play goes clockwise" : "Play goes counter-clockwise";

      const draw = $<HTMLButtonElement>("draw");
      draw.disabled = !v.yourTurn || v.over || waiting;
      draw.classList.toggle("hint", !draw.disabled && !v.hand.some((card) => canPlay(card, v)));
      $("picker").hidden = pendingWild === null;
      $("status").textContent = statusText(v);
      renderHand(v);
    }

    function showMove(before: UnoView | null, after: UnoView) {
      if (!before || after.round <= lastCommentaryRound) return;
      const text = describeMove(before, after);
      if (!text) return;
      lastCommentaryRound = after.round;
      $("commentary").textContent = text;
    }

    return {
      applyState(next) {
        previous = view;
        view = next as UnoView;
        waiting = false;
        pendingWild = null;
        showMove(previous, view);
      },
      render,
      commentary(text, round) {
        // The AI line replaces the built-in one for the same move, never a newer one.
        if (round < lastCommentaryRound) return;
        lastCommentaryRound = round;
        $("commentary").textContent = text;
      }
    };
  }
};
