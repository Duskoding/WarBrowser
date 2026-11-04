// Client plugin contract for every game (issues #47 / #29).
// Names the three GUI jobs: entry point (mount), session/state (applyState), and
// render. applyState does not have to call render; the shell calls render after
// state updates.

import type { GameAction } from "../types";

export interface GuiModuleContext {
  send(action: GameAction): void;
  setBackground(background: string | null): void;
}

export interface GuiModuleScreen {
  applyState(view: unknown): void;
  render(): void;
  commentary?(text: string, round: number): void;
  destroy?(): void;
}

export interface GuiModule {
  id: string;
  styles: string;
  mount(root: ShadowRoot, context: GuiModuleContext): GuiModuleScreen;
  isFinished(view: unknown): boolean;
}
