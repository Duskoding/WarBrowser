// ---- Server protocol (matches server.js) ----

export type ClientMessage =
  | { type: "create_room"; gameId: string }
  | { type: "join_room"; roomCode: string }
  | { type: "start_game" }
  | { type: "restart_game" }
  | { type: "game_message"; payload: GameAction }
  | { type: "rematch" }
  | { type: "leave_room" };

export type ServerEvent =
  | { type: "connected" } // local: socket opened
  | { type: "disconnected" } // local: socket closed
  | { type: "room_created"; roomCode: string; gameId: string; host: string; players: string[]; min: number; max: number }
  | { type: "room_joined"; roomCode: string; gameId: string; host: string; players: string[]; min: number; max: number }
  | { type: "players_update"; players: string[] } // roster changed while the room waits for the host to start
  | { type: "player_left"; username: string } // someone left or disconnected; any running game was discarded
  | { type: "rematch_requested"; username: string } // someone seated wants a new game; waiting on the others
  | { type: "room_left" }
  | { type: "room_closed"; reason: "idle" }
  | { type: "game_message"; payload: unknown } // from the server (or relayed from another player), unchecked
  | { type: "error"; message: string };

// A game listed by GET /api/games.
export type GameSummary = {
  id: string;
  name: string;
  description: string;
  players: { min: number; max: number };
  rules?: string[];
};

// A player's action inside game_message, e.g. { kind: "flip" } in War.
export type GameAction = { kind: string } & Record<string, unknown>;

// What the server sends inside game_message.
export type ServerPayload =
  | { kind: "state"; view: unknown } // this player's view; its shape belongs to the game
  | { kind: "commentary"; text: string; round: number };
