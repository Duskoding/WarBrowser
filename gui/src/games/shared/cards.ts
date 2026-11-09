// Card drawing shared by the card games' screens. Pair with cards.css.

export type ViewSuit = "S" | "H" | "D" | "C";
export type ViewCard = { rank: number; suit: ViewSuit };

export const SUIT_SYMBOL: Record<ViewSuit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME: Record<ViewSuit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };

// Ace can be 14 (War, Crazy Eights, Go Fish) or 1 (Goofspiel).
export function rankLabel(rank: number): string {
  return ({ 1: "A", 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[rank] ?? String(rank);
}

export const isRed = (suit: ViewSuit) => suit === "H" || suit === "D";

export function cardText(card: ViewCard): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

// A card face as an element; `tag` is "button" for a playable card.
export function cardElement(card: ViewCard, tag: "div" | "button" = "div"): HTMLElement {
  const el = document.createElement(tag);
  el.className = "pcard" + (isRed(card.suit) ? " red" : "");
  el.innerHTML = `<span class="r"></span><span class="s"></span>`;
  el.querySelector(".r")!.textContent = rankLabel(card.rank);
  el.querySelector(".s")!.textContent = SUIT_SYMBOL[card.suit];
  el.setAttribute("aria-label", `${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}`);
  return el;
}

// A face-down card (draw pile, opponent's hand).
export function cardBack(label = ""): HTMLElement {
  const el = document.createElement("div");
  el.className = "pcard back";
  if (label) el.textContent = label;
  return el;
}

// Shows commentary only if it's newer than what's on screen.
export function commentaryBox(el: Element) {
  let lastRound = 0;
  return (text: string, round: number) => {
    if (round <= lastRound) return;
    lastRound = round;
    el.textContent = text;
  };
}
