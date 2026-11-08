export type Color = "red" | "yellow" | "green" | "blue";
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "skip" | "reverse" | "drawTwo" | "wild" | "wildDrawFour";

export interface Card {
  // Wild and Wild Draw Four are printed without a color; color is null until played.
  color: Color | null;
  rank: Rank;
}

export type UnoAction =
  | { kind: "play"; cardIndex: number; chosenColor?: Color }
  | { kind: "draw" };

export type UnoResult =
  | { ok: false; error: string }
  | { ok: true; finished?: { winner: number | null } };

/** Per-seat engine state from getState(seat). */
export interface UnoState {
  hand: Card[];
  // Every seat's hand size, including your own, indexed by seat.
  handCounts: number[];
  discardTop: Card;
  // The color discardTop counts as. Equal to discardTop.color, except after a
  // wild, where discardTop.color stays null and this holds the chosen color.
  activeColor: Color;
  direction: 1 | -1;
  currentSeat: number;
  yourTurn: boolean;
  drawPileCount: number;
  discardPileCount: number;
  round: number;
  winner: number | null;
  over: boolean;
}

export interface UnoEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
}

// House-rule defaults assumed for #34 (open to revisiting):
// - No stacking: a Draw Two/Draw Four cannot be played on top of another to
//   pass the penalty along (matches official rules).
// - Drawing is "draw one, then your turn ends" — a drawn card is not played
//   immediately even if it would be legal; it waits in hand for your next turn.
// - No "Uno" call penalty: hand size reaching 1 is visible in handCounts, but
//   nothing enforces calling it out.
// - No challenge on Wild Draw Four: it may be played whenever a wild could be,
//   with no check for whether the player held a matching-color card instead.
// - A player may draw on their turn even when they hold a legal play; nothing
//   forces playing a card just because one is available (official Uno does).
