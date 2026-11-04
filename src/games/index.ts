import type { GameDefinition, GameSummary } from "./types.ts";
import { ticTacToe } from "./tictactoe.ts";
import { uno } from "./uno.ts";
import { war } from "./war.ts";

// Every game the server can host. To add one, write a GameDefinition next to
// these and list it here (see "Adding a game" in the README). The lobby shows
// them in this order, so Uno, the main game, comes first.
export const games: GameDefinition[] = [uno, war, ticTacToe];

// Used when a client sends create_room without a gameId (older clients only knew War).
export const DEFAULT_GAME_ID = "war";

export function findGame(id: unknown): GameDefinition | undefined {
  return games.find((game) => game.id === id);
}

// True for games like Uno whose rooms can start before they're full.
export function hasFlexibleSeats(game: GameDefinition): boolean {
  return (game.minPlayers ?? game.players) < game.players;
}

export function gameSummaries(): GameSummary[] {
  return games.map(({ id, name, description, players, minPlayers }) => ({
    id,
    name,
    description,
    players,
    minPlayers: minPlayers ?? players,
  }));
}
