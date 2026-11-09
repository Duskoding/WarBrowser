import type { GameEngine } from "../../engine/GameEngine.ts";
import { PILES, type NimAction, type NimResult, type NimState, type NimTake } from "./types.ts";

// Nim is Tic-Tac-Toe's shape: one player moves, the move is checked, then the
// turn passes. Nothing is hidden. Taking the last stone wins.

export class NimEngine implements GameEngine<NimState, NimAction, NimResult> {
  private piles: number[] = PILES.slice();
  private turn = 0;
  private lastTake: NimTake | null = null;
  private winner: number | null = null;
  private over = false;

  apply(seat: number, action: NimAction): NimResult {
    if (action.kind !== "take") return { ok: false, error: "Unknown action" };
    if (this.over) return { ok: false, error: "The game is over." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const { pile, count } = action;
    if (!Number.isInteger(pile) || pile < 0 || pile >= this.piles.length) {
      return { ok: false, error: "Pick a pile." };
    }
    if (!Number.isInteger(count) || count < 1) return { ok: false, error: "Take at least one stone." };
    if (count > this.piles[pile]) return { ok: false, error: "That pile doesn't have that many stones." };

    this.piles[pile] -= count;
    this.lastTake = { seat, pile, count };
    if (this.piles.every((n) => n === 0)) {
      this.over = true;
      this.winner = seat;
      return { ok: true, finished: { winner: seat } };
    }
    this.turn = 1 - seat;
    return { ok: true };
  }

  getState(seat: number): NimState {
    return {
      piles: this.piles.slice(),
      yourTurn: !this.over && this.turn === seat,
      lastTake: this.lastTake,
      winner: this.winner,
      over: this.over,
    };
  }
}
