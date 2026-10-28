// ---- Server protocol (matches server.js on s8119-internet-multiplayer) ----

export type ClientMessage =
  | { type: "create_room" }
  | { type: "join_room"; roomCode: string }
  | { type: "game_message"; payload: GamePayload }
  | { type: "leave_room" };

export type ServerEvent =
  | { type: "connected" } // local: socket opened
  | { type: "disconnected" } // local: socket closed
  | { type: "room_created"; roomCode: string }
  | { type: "room_joined"; roomCode: string }
  | { type: "opponent_joined" }
  | { type: "opponent_disconnected" }
  | { type: "room_left" }
  | { type: "game_message"; payload: unknown } // relayed from the opponent, unchecked
  | { type: "error"; message: string };

// ---- Game messages sent inside game_message ----
// PLACEHOLDER: the server has no game rules yet, so the room creator's browser
// runs a stand-in engine (game.ts) and sends each player's view to the other.

export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number; // 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
  suit: Suit;
};

export type Phase = "waiting" | "flipped" | "war" | "roundOver" | "gameOver";

export type GameState = {
  you: PlayerView;
  them: PlayerView;
  phase: "waiting" | "playing" | "war" | "over";
  winner?: "you" | "them";
  commentary?: string;
// One player's view of the table.
export type GameView = {
  yourCard: Card | null;
  opponentCard: Card | null; // null = face-down until both have flipped
  pile: number; // cards in the middle
  yourCount: number;
  opponentCount: number;
  phase: Phase;
  winner?: "you" | "opponent";
};

export type GamePayload =
  | { kind: "flip" } // guest → host
  | { kind: "state"; view: GameView } // host → guest
  | { kind: "commentary"; text: string }; // host → guest

// Same rule for the Flip button and the fake opponent.
export const canFlip = (v: GameView) =>
  v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);
