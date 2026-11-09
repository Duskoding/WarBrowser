import type { GameModule, GameSummary } from "./GameModule.ts";
import { poker } from "./poker/index.ts";
import { ticTacToe } from "./tictactoe/index.ts";
import { uno } from "./uno/index.ts";
import { war } from "./war/index.ts";

// Every game the server can host. To add one, write a GameModule and list it here.
export const games: GameModule[] = [war, ticTacToe, uno, poker];

// Used when a client sends create_room without a gameId.
export const DEFAULT_GAME_ID = "war";

export function findGame(id: unknown): GameModule | undefined {
  return games.find((game) => game.id === id);
}

export function gameSummaries(): GameSummary[] {
  return games.map(({ id, name, description, players, rules }) => (
    rules?.length ? { id, name, description, players, rules } : { id, name, description, players }
  ));
}
