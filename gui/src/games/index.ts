import type { GuiModule } from "./GuiModule";
import { poker } from "./poker/poker";
import { ticTacToe } from "./tictactoe/tictactoe";
import { war } from "./war/war";

// Every game the browser can draw, by server game id. A game the server lists
// but isn't here shows as unavailable in the lobby.
export const clientGames: Record<string, GuiModule> = {
  [war.id]: war,
  [ticTacToe.id]: ticTacToe,
  [poker.id]: poker
};
