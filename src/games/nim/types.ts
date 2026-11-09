export const PILES = [3, 4, 5];

export type NimAction = { kind: "take"; pile: number; count: number };

export interface NimTake {
  seat: number;
  pile: number;
  count: number;
}

export interface NimState {
  piles: number[];
  yourTurn: boolean;
  lastTake: NimTake | null;
  winner: number | null;
  over: boolean;
}

export type NimResult =
  | { ok: false; error: string }
  | { ok: true; finished?: { winner: number | null } };
