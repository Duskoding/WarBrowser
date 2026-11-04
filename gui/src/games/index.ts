import type { ClientGame } from "./types";
import { ticTacToe } from "./tictactoe/tictactoe";
import { uno } from "./uno/uno";
import { war } from "./war/war";

// Every game the browser can draw, by server game id. A game the server lists
// but isn't here shows as unavailable in the lobby.
export const clientGames: Record<string, ClientGame> = {
  [uno.id]: uno,
  [war.id]: war,
  [ticTacToe.id]: ticTacToe
};
