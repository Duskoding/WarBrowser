// Shared pure-engine contract for every game (issue #45).
// Implementations are plain classes: no sockets, DB, HTTP, or commentary.
// Seat indices are stable for the match (0 .. n-1). finished.winner is a seat
// index, or null for a draw. getState must not expose info that seat should not see.

export type EngineResult =
  | { ok: false; error: string }
  | {
      ok: true;
      finished?: { winner: number | null };
    };

export interface GameEngine<
  TState,
  TAction,
  TResult extends EngineResult = EngineResult,
> {
  apply(seat: number, action: TAction): TResult;
  getState(seat: number): TState;
}
