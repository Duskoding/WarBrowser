export type Color = "red" | "yellow" | "green" | "blue";
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "skip" | "reverse" | "drawTwo" | "wild" | "wildDrawFour";

export interface Card {
  // Wild and Wild Draw Four are printed without a color; color is null until played.
  color: Color | null;
  rank: Rank;
}

export type UnoAction =
  | { kind: "play"; cardIndex: number; chosenColor?: Color }
  | { kind: "draw" }
  // Allowed out of turn: call UNO for yourself, or catch someone who didn't.
  | { kind: "uno" }
  | { kind: "catch" };

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
  // Indexed by seat: who has called UNO for their current hand.
  calledUno: boolean[];
  // The seat that played down to one card without calling UNO and can be
  // caught (+2 cards) until the next card is played or drawn; null if none.
  catchable: number | null;
  // Cards the current player must draw unless they stack another draw card.
  // 0 when no Draw Two / Wild Draw Four penalty is waiting.
  pendingDraw: number;
  round: number;
  winner: number | null;
  over: boolean;
}

export interface UnoEngineOptions {
  shuffle?: <T>(items: T[]) => T[];
}

// House-rule defaults assumed for #34 (open to revisiting):
// - Stacking (decided by the team, overriding the earlier no-stacking default):
//   Draw Two and Wild Draw Four don't make the next player draw straight away.
//   That player may stack another draw card to add to the penalty and pass it
//   on, or draw the whole total and lose their turn. A Draw Two can go on a
//   Draw Two; a Wild Draw Four can go on either; a Draw Two can't go on a Wild
//   Draw Four. While a penalty is waiting, no other card can be played.
// - Drawing is "draw one, then your turn ends" — a drawn card is not played
//   immediately even if it would be legal; it waits in hand for your next turn.
// - Calling UNO: allowed on your turn with two cards (before playing one) or
//   any time with one card. Play down to one card without calling and any
//   other player can catch you (you draw 2) until the next card is played or
//   drawn, or until you call it yourself.
// - No challenge on Wild Draw Four: it may be played whenever a wild could be,
//   with no check for whether the player held a matching-color card instead.
// - A player may draw on their turn even when they hold a legal play; nothing
//   forces playing a card just because one is available (official Uno does).
