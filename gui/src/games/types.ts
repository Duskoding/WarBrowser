import type { GameAction } from "../types";

// The contract between the shell (main.ts: accounts, game choice, rooms) and one
// game's screen. Each game lives in games/<id>/ and is listed in games/index.ts
// under the same id the server uses in src/games/.
//
// Each game draws into its own shadow root, so its CSS can't change the lobby or
// other games, and the shell's CSS can't change the game. Inherited values (text
// colour, font) and CSS custom properties like --felt still pass through.

export interface GameContext {
  // Sends one of this game's actions to the server.
  send(action: GameAction): void;
  // Sets the page background behind the game (any CSS background value), or
  // null for the default. The shell resets it when the game is closed.
  setBackground(background: string | null): void;
}

export interface GameScreen {
  // Called with every state the server sends; `view` is this game's view shape.
  update(view: unknown): void;
  // Round commentary, for games that have it.
  commentary?(text: string, round: number): void;
  // Stops timers and anything else outside `root`; the shell removes `root` itself.
  destroy?(): void;
}

export interface ClientGame {
  id: string;
  // This game's CSS, applied inside its shadow root after games/base.css (as
  // adopted stylesheets, so setting root.innerHTML doesn't remove them).
  // Import it with `import styles from "./<id>.css?inline"`.
  styles: string;
  // Draws the game into `root` once the room is full and the first state arrives.
  mount(root: ShadowRoot, context: GameContext): GameScreen;
  // True once `view` shows a finished game, so the shell can refresh win/loss stats.
  isFinished(view: unknown): boolean;
}
