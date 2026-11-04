import type { GameDefinition, GameSummary } from "./types.ts";
import { ticTacToe } from "./tictactoe.ts";
import { war } from "./war.ts";

// Every game the server can host. To add one, write a GameDefinition next to
// these and list it here (see "Adding a game" in the README).
export const games: GameDefinition[] = [war, ticTacToe];

// Used when a client sends create_room without a gameId.
export const DEFAULT_GAME_ID = "war";

export function findGame(id: unknown): GameDefinition | undefined {
  return games.find((game) => game.id === id);
}

export function gameSummaries(): GameSummary[] {
  return games.map(({ id, name, description, players }) => ({ id, name, description, players }));
}
