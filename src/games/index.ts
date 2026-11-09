import type { GameModule, GameSummary } from "./GameModule.ts";
import { battleship } from "./battleship/index.ts";
import { connect4 } from "./connect4/index.ts";
import { crazy8 } from "./crazy8/index.ts";
import { dots } from "./dots/index.ts";
import { gofish } from "./gofish/index.ts";
import { goofspiel } from "./goofspiel/index.ts";
import { rps } from "./rps/index.ts";
import { ticTacToe } from "./tictactoe/index.ts";
import { uno } from "./uno/index.ts";
import { war } from "./war/index.ts";

// Every game the server can host. To add one, write a GameModule and list it here.
export const games: GameModule[] = [war, ticTacToe, uno, crazy8, gofish, rps, goofspiel, connect4, dots, battleship];

// Used when a client sends create_room without a gameId.
export const DEFAULT_GAME_ID = "war";

export function findGame(id: unknown): GameModule | undefined {
  return games.find((game) => game.id === id);
}

export function gameSummaries(): GameSummary[] {
  return games.map(({ id, name, description, players }) => ({ id, name, description, players }));
}
