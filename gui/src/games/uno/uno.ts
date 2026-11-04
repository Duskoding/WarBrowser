import type { ClientGame } from "../types";
import styles from "./uno.css?inline";

type Color = "red" | "yellow" | "green" | "blue";
type Card = { id: number; color: Color | null; value: string };
type UnoEvent =
  | { kind: "start" }
  | { kind: "play"; seat: number; card: Card; color: Color }
  | { kind: "draw"; seat: number; kept: boolean }
  | { kind: "pass"; seat: number }
  | { kind: "uno"; seat: number }
  | { kind: "caught"; seat: number; by: number };

// One player's view, from unoView in src/games/uno.ts on the server.
type UnoView = {
  you: number;
  hand: Card[];
  playable: number[]; // ids of cards in `hand` you may play now
  top: Card;
  color: Color; // colour to match (a wild's chosen colour)
  direction: 1 | -1;
  drawPile: number;
  turn: number;
  yourTurn: boolean;
  drawn: number | null; // id of the card you just drew and may play
  canCallUno: boolean;
  canCatch: boolean;
  players: { seat: number; name: string; cards: number; calledUno: boolean; catchable: boolean }[];
  last: UnoEvent;
  winner: number | null;
  winnerName?: string;
};

const COLORS: Color[] = ["red", "yellow", "green", "blue"];
const COLOR_NAMES: Record<Color, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };
const LABELS: Record<string, string> = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };
const NAMES: Record<string, string> = { skip: "Skip", reverse: "Reverse", draw2: "Draw Two", wild: "Wild", wild4: "Wild Draw Four" };
const TABLE = "radial-gradient(circle at 50% 35%, #3a1d5c 0%, #1d0f30 60%, #120a1f 100%)";

const cardName = (card: Card) =>
  card.color === null ? NAMES[card.value] : `${COLOR_NAMES[card.color]} ${NAMES[card.value] ?? card.value}`;

function cardElement(card: Card, tag: "button" | "div" = "div"): HTMLElement {
  const el = document.createElement(tag);
  el.className = `uno-card ${card.color ?? "wild"}`;
  el.dataset.value = card.value;
  el.setAttribute("aria-label", cardName(card));
  const label = LABELS[card.value] ?? card.value;
  el.innerHTML = `<span class="corner"></span><span class="face"></span><span class="corner end"></span>`;
  el.querySelectorAll("span").forEach((span) => (span.textContent = label));
  return el;
}

// Order a hand by colour, then value, so it's easy to scan.
const handOrder = (a: Card, b: Card) =>
  (COLORS.indexOf(a.color!) + 1 || 5) - (COLORS.indexOf(b.color!) + 1 || 5) || a.value.localeCompare(b.value, "en", { numeric: true });

function describe(event: UnoEvent, name: (seat: number) => string): string {
  switch (event.kind) {
    case "start": return "New game! Match the colour or number of the top card.";
    case "play": return `${name(event.seat)} played ${cardName(event.card)}${event.card.color === null ? ` and chose ${COLOR_NAMES[event.color]}` : ""}.`;
    case "draw": return `${name(event.seat)} drew a card${event.kept ? " they can play" : ""}.`;
    case "pass": return `${name(event.seat)} kept the card and passed.`;
    case "uno": return `${name(event.seat)} called UNO!`;
    case "caught": return `${name(event.by)} caught ${name(event.seat)} without calling UNO: +2 cards!`;
  }
}

export const uno: ClientGame = {
  id: "uno",
  styles,
  isFinished: (view) => (view as UnoView).winner !== null,
  mount(root, { send, setBackground }) {
    setBackground(TABLE);
    root.innerHTML = `
      <div class="uno">
        <ul class="opponents" data-id="opponents"></ul>
        <div class="center">
          <button class="pile draw-pile" data-id="draw" aria-label="Draw a card">
            <span class="back">UNO</span><span class="count" data-id="count"></span>
          </button>
          <div class="pile" data-id="top"></div>
          <div class="current" data-id="current">
            <span class="swatch"></span><span class="direction" data-id="direction"></span>
          </div>
        </div>
        <p class="status" data-id="status" aria-live="polite"></p>
        <p class="last" data-id="last"></p>
        <div class="actions">
          <button class="uno-call" data-id="uno">UNO!</button>
          <button class="ghost" data-id="catch">Catch them!</button>
          <button class="ghost" data-id="pass">Keep it &amp; pass</button>
        </div>
        <div class="picker" data-id="picker" hidden>
          <p>Choose a colour</p>
          <div class="swatches">
            ${COLORS.map((c) => `<button class="swatch-button ${c}" data-color="${c}" aria-label="${COLOR_NAMES[c]}"></button>`).join("")}
          </div>
          <button class="ghost small" data-id="cancel">Cancel</button>
        </div>
        <p class="hand-title" data-id="hand-title"></p>
        <div class="hand" data-id="hand"></div>
      </div>
    `;
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-id="${id}"]`)!;
    let pendingWild: number | null = null;
    let busy = false; // an action is on its way; the next state re-enables controls

    const act = (payload: { kind: string } & Record<string, unknown>) => {
      busy = true;
      root.querySelectorAll("button").forEach((b) => (b.disabled = true));
      send(payload);
    };

    $("draw").addEventListener("click", () => act({ kind: "draw" }));
    $("pass").addEventListener("click", () => act({ kind: "pass" }));
    $("uno").addEventListener("click", () => act({ kind: "uno" }));
    $("catch").addEventListener("click", () => act({ kind: "catch" }));
    $("cancel").addEventListener("click", () => {
      pendingWild = null;
      $("picker").hidden = true;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((button) =>
      button.addEventListener("click", () => {
        if (pendingWild === null) return;
        const cardId = pendingWild;
        pendingWild = null;
        $("picker").hidden = true;
        act({ kind: "play", cardId, color: button.dataset.color });
      })
    );

    return {
      update(view) {
        const v = view as UnoView;
        busy = false;
        pendingWild = null;
        $("picker").hidden = true;
        // act() disabled every button; the colour picker is always usable once shown.
        $("picker").querySelectorAll("button").forEach((b) => (b.disabled = false));
        const name = (seat: number) => (seat === v.you ? "You" : v.players[seat]?.name ?? `Player ${seat + 1}`);
        const over = v.winner !== null;

        // Opponents in turn order starting after you.
        const others = v.players.slice(v.you + 1).concat(v.players.slice(0, v.you));
        $("opponents").replaceChildren(
          ...others.map((p) => {
            const li = document.createElement("li");
            li.className = "opponent";
            li.classList.toggle("turn", !over && p.seat === v.turn);
            li.classList.toggle("winner", p.seat === v.winner);
            li.innerHTML = `<strong></strong><span class="backs"></span><span class="count"></span>`;
            li.querySelector("strong")!.textContent = p.name;
            li.querySelector(".backs")!.append(
              ...Array.from({ length: Math.min(p.cards, 10) }, () => Object.assign(document.createElement("span"), { className: "mini-back" }))
            );
            li.querySelector(".count")!.textContent =
              `${p.cards} card${p.cards === 1 ? "" : "s"}${p.calledUno && p.cards === 1 ? " · UNO!" : ""}`;
            return li;
          })
        );

        $("top").replaceChildren(cardElement(v.top));
        $("count").textContent = String(v.drawPile);
        $("current").className = `current ${v.color}`;
        $("current").title = `Colour to match: ${COLOR_NAMES[v.color]}`;
        $("direction").textContent = v.direction === 1 ? "↻" : "↺";

        let status: string;
        if (over) status = v.winner === v.you ? "You win! 🎉" : `${v.winnerName} wins!`;
        else if (v.drawn !== null) status = "You drew a playable card: play it or keep it.";
        else if (v.yourTurn) status = v.playable.length ? "Your turn: play a card" : "Your turn: no match, draw a card";
        else status = `${v.players[v.turn]?.name}'s turn…`;
        $("status").textContent = status;
        $("last").textContent = describe(v.last, name);

        const drawButton = $<HTMLButtonElement>("draw");
        drawButton.disabled = !v.yourTurn || v.drawn !== null;
        drawButton.classList.toggle("hint", v.yourTurn && v.drawn === null && v.playable.length === 0);
        $("pass").hidden = v.drawn === null;
        $<HTMLButtonElement>("pass").disabled = false;
        $("uno").hidden = !v.canCallUno;
        $<HTMLButtonElement>("uno").disabled = false;
        $("catch").hidden = !v.canCatch;
        $<HTMLButtonElement>("catch").disabled = false;

        $("hand-title").textContent = `Your hand · ${v.hand.length} card${v.hand.length === 1 ? "" : "s"}`;
        $("hand").replaceChildren(
          ...[...v.hand].sort(handOrder).map((card) => {
            const button = cardElement(card, "button") as HTMLButtonElement;
            const playable = v.playable.includes(card.id);
            button.disabled = !playable;
            button.classList.toggle("playable", playable);
            button.classList.toggle("just-drawn", card.id === v.drawn);
            button.addEventListener("click", () => {
              if (busy) return;
              if (card.color === null) {
                pendingWild = card.id;
                $("picker").hidden = false;
                return;
              }
              act({ kind: "play", cardId: card.id });
            });
            return button;
          })
        );
      },
    };
  },
};
