import type { GameAction } from "../types";

// The contract between the shell (main.ts: accounts, game choice, rooms) and one
// game's screen. Each game lives in games/<id>/ and is listed in games/index.ts
// under the same id the server uses in src/games/.

export interface GameContext {
  // Sends one of this game's actions to the server.
  send(action: GameAction): void;
}

export interface GameScreen {
  // Called with every state the server sends; `view` is this game's view shape.
  update(view: unknown): void;
  // Round commentary, for games that have it.
  commentary?(text: string, round: number): void;
  // Removes everything mount() added.
  destroy(): void;
}

export interface ClientGame {
  id: string;
  // Draws the game into `root` once the room is full and the first state arrives.
  mount(root: HTMLElement, context: GameContext): GameScreen;
  // True once `view` shows a finished game, so the shell can refresh win/loss stats.
  isFinished(view: unknown): boolean;
}
