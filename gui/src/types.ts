// Message protocol from SPEC.md ("WebSocket protocol").
// PLACEHOLDER: the spec doesn't define the card format or `pile`, so the
// shapes of Card and pile are guesses — confirm with the engine/server owners.

export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number; // 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
  suit: Suit;
};

export type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

export type StatePayload = {
  yourCard: Card | null;
  opponentCard: Card | null; // null = face-down until both have flipped
  pile: number; // PLACEHOLDER: assumed to be the number of cards in the middle
  scoreA: number; // PLACEHOLDER: assumed A = this player, B = opponent
  scoreB: number;
  phase: Phase;
};

// Client → Server
export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "flip" };

// Server → Client
export type ServerMessage =
  | ({ type: "state" } & StatePayload)
  | { type: "commentary"; text: string }
  | { type: "error"; message: string };
