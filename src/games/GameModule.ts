// Server plugin contract for every game (issue #46).
// Names the four module jobs: engine factory, action handler, state→view mapper,
// and win/record via `finished` on the action result (the shared server records
// matches). Live code still uses GameDefinition / GameSession in ./types.ts
// until a later migration. createEngine returns a GameEngine (#45); concrete
// engines adopt that interface in later issues.

import type { EngineResult, GameEngine } from "../engine/GameEngine.ts";
import type { PlayerInfo } from "./types.ts";

export interface GameModuleContext {
  // Settings from room/server setup (e.g. War's maxRounds).
  // Note: live GameContext also passes a War commentator; when War adopts this
  // module shape, wire commentary here or keep it game-local.
  options: Record<string, unknown>;
}

export type GameModuleActionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      // Set on the action that ends the game. winner is a seat index, or null for a draw.
      finished?: { winner: number | null };
      // Optional War-style commentary; other games omit it.
      commentary?: { round: number; text: Promise<string | null> };
    };

export interface GameModule<
  TState = unknown,
  TAction = unknown,
  TResult extends EngineResult = EngineResult,
> {
  id: string;
  name: string;
  description: string;
  players: number;

  createEngine(context: GameModuleContext): GameEngine<TState, TAction, TResult>;

  // Return null for a payload this game does not handle; the server may relay it.
  handleAction(
    engine: GameEngine<TState, TAction, TResult>,
    seat: number,
    payload: Record<string, unknown>,
  ): GameModuleActionResult | null;

  toView(
    engine: GameEngine<TState, TAction, TResult>,
    seat: number,
    players: PlayerInfo[],
  ): unknown;
}
