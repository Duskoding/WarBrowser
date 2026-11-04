// ---- Server protocol (matches server.js) ----

export type ClientMessage =
  | { type: "create_room"; gameId: string }
  | { type: "join_room"; roomCode: string }
  | { type: "game_message"; payload: GameAction }
  | { type: "leave_room" };

export type ServerEvent =
  | { type: "connected" } // local: socket opened
  | { type: "disconnected" } // local: socket closed
  | { type: "room_created"; roomCode: string; username?: string; gameId: string }
  | { type: "room_joined"; roomCode: string; username?: string; opponentUsername?: string; gameId: string }
  | { type: "opponent_joined"; username?: string }
  | { type: "opponent_disconnected" }
  | { type: "room_left" }
  | { type: "game_message"; payload: unknown } // from the server (or relayed from the opponent), unchecked
  | { type: "error"; message: string };

// A game listed by GET /api/games.
export type GameSummary = {
  id: string;
  name: string;
  description: string;
  players: number;
  rules?: string[]; // "How to play" lines
};

// A player's action inside game_message, e.g. { kind: "flip" } in War.
export type GameAction = { kind: string } & Record<string, unknown>;

// What the server sends inside game_message.
export type ServerPayload =
  | { kind: "state"; view: unknown } // this player's view; its shape belongs to the game
  | { kind: "commentary"; text: string; round: number };
