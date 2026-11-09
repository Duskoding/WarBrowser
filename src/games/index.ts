import type { GameModule, GameSummary } from "./GameModule.ts";
import { ticTacToe } from "./tictactoe/index.ts";
import { uno } from "./uno/index.ts";
import { war } from "./war/index.ts";
import { rps } from "./rps/index.ts";

// Every game the server can host. To add one, write a GameModule and list it here.
export const games: GameModule[] = [war, ticTacToe, uno, rps];

// Used when a client sends create_room without a gameId.
export const DEFAULT_GAME_ID = "war";

export function findGame(id: unknown): GameModule | undefined {
  return games.find((game) => game.id === id);
}

export function gameSummaries(): GameSummary[] {
  return games.map(({ id, name, description, players }) => ({ id, name, description, players }));
}
