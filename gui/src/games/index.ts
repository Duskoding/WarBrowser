import type { GuiModule } from "./GuiModule";
import { battleship } from "./battleship/battleship";
import { connect4 } from "./connect4/connect4";
import { crazy8 } from "./crazy8/crazy8";
import { dots } from "./dots/dots";
import { gofish } from "./gofish/gofish";
import { goofspiel } from "./goofspiel/goofspiel";
import { rps } from "./rps/rps";
import { ticTacToe } from "./tictactoe/tictactoe";
import { war } from "./war/war";

// Every game the browser can draw, by server game id. A game the server lists
// but isn't here shows as unavailable in the lobby.
export const clientGames: Record<string, GuiModule> = {
  [war.id]: war,
  [ticTacToe.id]: ticTacToe,
  [rps.id]: rps,
  [goofspiel.id]: goofspiel,
  [connect4.id]: connect4,
  [dots.id]: dots,
  [battleship.id]: battleship,
  [crazy8.id]: crazy8,
  [gofish.id]: gofish
};
