// ---- Server protocol (matches server.js) ----

export type ClientMessage =
  | { type: "create_room"; gameId: string }
  | { type: "join_room"; roomCode: string }
  | { type: "start_game" } // host only, for games that can start before the room is full
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
  // Only for games with a player range (Uno): everyone in the room, host first.
  | { type: "room_players"; players: string[]; minPlayers: number; maxPlayers: number }
  | { type: "game_message"; payload: unknown } // from the server (or relayed from the opponent), unchecked
  | { type: "error"; message: string };

// A game listed by GET /api/games.
export type GameSummary = {
  id: string;
  name: string;
  description: string;
  players: number; // most players a room holds
  minPlayers: number; // fewest it can start with (equal to players for War and Tic-Tac-Toe)
};

// A player's action inside game_message, e.g. { kind: "flip" } in War.
export type GameAction = { kind: string } & Record<string, unknown>;

// What the server sends inside game_message.
export type ServerPayload =
  | { kind: "state"; view: unknown } // this player's view; its shape belongs to the game
  | { kind: "commentary"; text: string; round: number };
