// Server plugin contract for every game (issues #46 / #29).
// Names the four module jobs: engine factory, action handler, state→view mapper,
// and win/record via `finished` on the action result (the shared server records
// matches). createEngine returns a GameEngine (#45). Each game builds its own
// commentary prompt; the shared commentator only sends that string to the API.

import type { EngineResult, GameEngine } from "../engine/GameEngine.ts";

export interface PlayerInfo {
  username: string;
}

// Kept here so game modules have no Node-only imports and can run in either runtime.
export interface GameCommentator {
  describe(prompt: string): Promise<string | null>;
}

export interface GameModuleContext {
  options: Record<string, unknown>;
  commentator: GameCommentator;
  // The actual seated player count for this room's match, within the
  // module's players.min/max range. Fixed-player-count games can ignore it.
  players: number;
}

export type GameModuleActionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      // Set on the action that ends the game. winner is a seat index, or null for a draw.
      finished?: { winner: number | null };
      // Commentary for this action; each game supplies the prompt via commentator.describe.
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
  // Room needs at least `min` players before the host can start it, and
  // stops accepting joiners at `max`.
  players: { min: number; max: number };
  // Optional "How to play" lines, shown from the lobby.
  rules?: string[];

  createEngine(context: GameModuleContext): GameEngine<TState, TAction, TResult>;

  // Return null for a payload this game does not handle; the server may relay it.
  handleAction(
    engine: GameEngine<TState, TAction, TResult>,
    seat: number,
    payload: Record<string, unknown>,
    context: GameModuleContext,
  ): GameModuleActionResult | null;

  toView(
    engine: GameEngine<TState, TAction, TResult>,
    seat: number,
    players: PlayerInfo[],
  ): unknown;
}

// What GET /api/games returns for each game.
export type GameSummary = Pick<GameModule, "id" | "name" | "description" | "players" | "rules">;
