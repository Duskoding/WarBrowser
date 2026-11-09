import type { GuiModule } from "./GuiModule";
import { ticTacToe } from "./tictactoe/tictactoe";
import { war } from "./war/war";
import { rps } from "./rps/rps";

// Every game the browser can draw, by server game id. A game the server lists
// but isn't here shows as unavailable in the lobby.
export const clientGames: Record<string, GuiModule> = {
  [war.id]: war,
  [ticTacToe.id]: ticTacToe,
  [rps.id]: rps
};
