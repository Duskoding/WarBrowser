import type { RoundSummary } from "../engine/types.ts";

// The contract between the room server (server.js) and a game. Each game is one
// GameDefinition, listed in src/games/index.ts. The server handles accounts,
// rooms, seats and sockets; the game only handles its own rules and views.

export interface PlayerInfo {
  username: string;
}

// Same shape as Commentator in src/commentator.ts, kept here so game code has no
// Node-only imports and can also run in the browser preview.
export interface GameCommentator {
  describe(summary: RoundSummary): Promise<string | null>;
}

export interface GameContext {
  // Round commentary from the Claude API. Its prompt is written for War, so
  // other games ignore it for now.
  commentator: GameCommentator;
  // Settings from createWarServer({ engineOptions }), e.g. War's maxRounds.
  options: Record<string, unknown>;
}

export type ActionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      // Set on the action that ends the game. winner is a seat index, or null for a draw.
      finished?: { winner: number | null };
      // Commentary for this action, tagged with a round so clients can drop stale replies.
      commentary?: { round: number; text: Promise<string | null> };
    };

export interface GameSession {
  // What the player in `seat` may see right now. Sent to that player after every action.
  view(seat: number, players: PlayerInfo[]): unknown;
  // Applies an action from the player in `seat`. Return null for a payload this
  // game doesn't handle; the server relays it to the other players instead.
  act(seat: number, payload: Record<string, unknown>): ActionResult | null;
}

export interface GameDefinition {
  id: string; // used in create_room and the client's game registry
  name: string;
  description: string;
  // The room's maximum. The game starts automatically when this many players are in.
  players: number;
  // Set lower than `players` for a game that can start with fewer: the host
  // then starts it with start_game once at least this many have joined.
  minPlayers?: number;
  // playerCount is how many players were seated (minPlayers..players).
  create(context: GameContext, playerCount: number): GameSession;
}

// What GET /api/games returns for each game.
export type GameSummary = Pick<GameDefinition, "id" | "name" | "description" | "players"> & {
  minPlayers: number;
};
