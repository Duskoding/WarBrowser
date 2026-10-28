<<<<<<< HEAD
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
// The server runs WarEngine: players send { kind: "flip" }, and the server
// sends each player their own { kind: "state" } view (and later commentary).

=======
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
export type Suit = "♠" | "♥" | "♦" | "♣";

export type Card = {
  rank: number; // 2–14 (11 = J, 12 = Q, 13 = K, 14 = A)
  suit: Suit;
};

export type PlayerView = {
  cardsLeft: number;
  faceUp: Card | null;
};

<<<<<<< HEAD
export type GamePayload =
  | { kind: "flip" } // player → server
  | { kind: "state"; view: GameView } // server → player
  | { kind: "commentary"; text: string }; // server → player

// Same rule for the Flip button and the fake opponent.
export const canFlip = (v: GameView) =>
  v.phase !== "gameOver" && !(v.yourCard !== null && v.opponentCard === null);
=======
export type GameState = {
  you: PlayerView;
  them: PlayerView;
  phase: "waiting" | "playing" | "war" | "over";
  winner?: "you" | "them";
  commentary?: string;
};
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
