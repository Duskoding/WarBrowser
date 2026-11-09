import type { GuiModule } from "./GuiModule";
import { crazy8 } from "./crazy8/crazy8";
import { gofish } from "./gofish/gofish";
import { ticTacToe } from "./tictactoe/tictactoe";
import { war } from "./war/war";

// Every game the browser can draw, by server game id. A game the server lists
// but isn't here shows as unavailable in the lobby.
export const clientGames: Record<string, GuiModule> = {
  [war.id]: war,
  [ticTacToe.id]: ticTacToe,
  [crazy8.id]: crazy8,
  [gofish.id]: gofish
};
