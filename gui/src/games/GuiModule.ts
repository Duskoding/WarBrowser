// Client plugin contract for every game (issue #47).
// Names the three GUI jobs: entry point (mount), session/state (applyState), and
// render. Live code still uses ClientGame / GameScreen in ./types.ts until a
// later migration. applyState does not have to call render; the shell or module
// may call render after state updates.

import type { GameAction } from "../types";

export interface GuiModuleContext {
  send(action: GameAction): void;
  setBackground(background: string | null): void;
}

export interface GuiModuleScreen {
  // Store/apply the latest per-seat server view for this game.
  applyState(view: unknown): void;
  // Paint from the current state into the mounted shadow root.
  render(): void;
  commentary?(text: string, round: number): void;
  destroy?(): void;
}

export interface GuiModule {
  id: string;
  // Inline CSS for the game's shadow root (after games/base.css).
  styles: string;
  // Entry point: create the screen inside `root` when the room is ready.
  mount(root: ShadowRoot, context: GuiModuleContext): GuiModuleScreen;
  // True once `view` shows a finished game, so the shell can refresh win/loss stats.
  isFinished(view: unknown): boolean;
}
