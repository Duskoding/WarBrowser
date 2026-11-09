import type { GameEngine } from "../../engine/GameEngine.ts";

// Battleship combines Tic-Tac-Toe's turns on a grid with War's per-seat hidden
// view: each player sees their own fleet, but of the opponent's grid only the
// shots they've fired and ships they've sunk. getState(seat) never returns the
// opponent's unhit ship cells.
//
// Cells are row-major: cell = row * SIZE + col.

export const SIZE = 10;
export const FLEET = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

export type Phase = "setup" | "playing" | "over";
export type ShotResult = "miss" | "hit" | "sunk";

export type BattleshipAction =
  | { kind: "shuffle" } // setup: place my fleet again at random
  | { kind: "place"; ships: Ship[] } // setup: the player's own layout
  | { kind: "ready" } // setup: lock in my fleet
  | { kind: "fire"; cell: number };

export type BattleshipResult =
  | { ok: false; error: string }
  | { ok: true; shot?: { cell: number; result: ShotResult; ship?: string }; finished?: { winner: number | null } };

export interface Ship {
  name: string;
  cells: number[];
}

export interface BattleshipState {
  phase: Phase;
  yourReady: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  yourShips: (Ship & { sunk: boolean })[];
  // Shots the opponent fired at you, and shots you fired at them.
  incoming: Record<number, "hit" | "miss">;
  outgoing: Record<number, "hit" | "miss">;
  // Opponent ships you've sunk; the only enemy ship cells you ever see.
  sunkEnemyShips: Ship[];
  enemyShipsLeft: number;
  shots: number; // total shots fired by both players
  winner: number | null;
}

export interface BattleshipOptions {
  random?: () => number;
}

// Why a layout is illegal, or null when every ship is the right size, in a
// straight line, on the board and not overlapping.
export function fleetPlacementError(ships: Ship[]): string | null {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return "Place every ship.";
  const expected = new Map(FLEET.map((ship) => [ship.name, ship.size]));
  const seen = new Set<string>();
  const taken = new Set<number>();
  for (const ship of ships) {
    if (!ship || typeof ship.name !== "string" || !expected.has(ship.name) || seen.has(ship.name)) {
      return "Place every ship.";
    }
    seen.add(ship.name);
    const size = expected.get(ship.name)!;
    const cells = ship.cells;
    if (!Array.isArray(cells) || cells.length !== size || !cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < SIZE * SIZE)) {
      return "Keep each ship the right size and on the board.";
    }
    if (!isStraight(cells)) return "Keep each ship in a straight line.";
    if (cells.some((cell) => taken.has(cell))) return "Ships can't overlap.";
    cells.forEach((cell) => taken.add(cell));
  }
  return null;
}

function isStraight(cells: number[]): boolean {
  const rows = cells.map((cell) => Math.floor(cell / SIZE));
  const cols = cells.map((cell) => cell % SIZE);
  const sameRow = rows.every((row) => row === rows[0]);
  const sameCol = cols.every((col) => col === cols[0]);
  if (sameRow === sameCol) return false;
  const line = [...(sameRow ? cols : rows)].sort((a, b) => a - b);
  return line.every((value, index) => index === 0 || value === line[index - 1] + 1);
}

// Places every ship in FLEET at random, horizontally or vertically, without overlaps.
export function randomFleet(random: () => number = Math.random): Ship[] {
  const taken = new Set<number>();
  return FLEET.map(({ name, size }) => {
    for (;;) {
      const across = random() < 0.5;
      const row = Math.floor(random() * (across ? SIZE : SIZE - size + 1));
      const col = Math.floor(random() * (across ? SIZE - size + 1 : SIZE));
      const cells = Array.from({ length: size }, (_, i) => (across ? row * SIZE + col + i : (row + i) * SIZE + col));
      if (cells.every((c) => !taken.has(c))) {
        cells.forEach((c) => taken.add(c));
        return { name, cells };
      }
    }
  });
}

export class BattleshipEngine implements GameEngine<BattleshipState, BattleshipAction, BattleshipResult> {
  private readonly random: () => number;
  private fleets: [Ship[], Ship[]];
  // shots[seat] = cells that seat has fired at (on the opponent's grid).
  private shotsBy: [Map<number, "hit" | "miss">, Map<number, "hit" | "miss">] = [new Map(), new Map()];
  private ready: [boolean, boolean] = [false, false];
  private phase: Phase = "setup";
  private turn = 0;
  private winner: number | null = null;

  constructor(options: BattleshipOptions & { fleets?: [Ship[], Ship[]] } = {}) {
    this.random = options.random ?? Math.random;
    this.fleets = options.fleets ?? [randomFleet(this.random), randomFleet(this.random)];
  }

  apply(seat: number, action: BattleshipAction): BattleshipResult {
    if (this.phase === "over") return { ok: false, error: "The game is over." };

    if (action.kind === "shuffle" || action.kind === "ready" || action.kind === "place") {
      if (this.phase !== "setup") return { ok: false, error: "The battle has already started." };
      if (this.ready[seat]) return { ok: false, error: "You're already ready." };
      if (action.kind === "shuffle") {
        this.fleets[seat] = randomFleet(this.random);
      } else if (action.kind === "place") {
        const error = fleetPlacementError(action.ships);
        if (error) return { ok: false, error };
        this.fleets[seat] = action.ships.map((ship) => ({ name: ship.name, cells: ship.cells.slice() }));
      } else {
        this.ready[seat] = true;
        if (this.ready[0] && this.ready[1]) this.phase = "playing";
      }
      return { ok: true };
    }

    if (action.kind !== "fire") return { ok: false, error: "Unknown action" };
    if (this.phase !== "playing") return { ok: false, error: "Wait until both players are ready." };
    if (seat !== this.turn) return { ok: false, error: "It's not your turn." };
    const { cell } = action;
    if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return { ok: false, error: "Pick a square." };
    const shots = this.shotsBy[seat];
    if (shots.has(cell)) return { ok: false, error: "You already fired there." };

    const enemy = this.fleets[1 - seat];
    const ship = enemy.find((s) => s.cells.includes(cell));
    shots.set(cell, ship ? "hit" : "miss");
    let result: ShotResult = ship ? "hit" : "miss";
    if (ship && ship.cells.every((c) => shots.has(c))) result = "sunk";

    if (enemy.every((s) => s.cells.every((c) => shots.has(c)))) {
      this.phase = "over";
      this.winner = seat;
      return { ok: true, shot: { cell, result, ship: ship?.name }, finished: { winner: seat } };
    }
    this.turn = 1 - seat;
    return { ok: true, shot: { cell, result, ship: result === "sunk" ? ship!.name : undefined } };
  }

  getState(seat: number): BattleshipState {
    const mine = this.fleets[seat];
    const enemy = this.fleets[1 - seat];
    const incoming = this.shotsBy[1 - seat];
    const outgoing = this.shotsBy[seat];
    const sunkEnemyShips = enemy
      .filter((s) => s.cells.every((c) => outgoing.has(c)))
      .map((s) => ({ name: s.name, cells: s.cells.slice() }));
    return {
      phase: this.phase,
      yourReady: this.ready[seat],
      opponentReady: this.ready[1 - seat],
      yourTurn: this.phase === "playing" && this.turn === seat,
      yourShips: mine.map((s) => ({ name: s.name, cells: s.cells.slice(), sunk: s.cells.every((c) => incoming.has(c)) })),
      incoming: Object.fromEntries(incoming),
      outgoing: Object.fromEntries(outgoing),
      sunkEnemyShips,
      enemyShipsLeft: enemy.length - sunkEnemyShips.length,
      shots: this.shotsBy[0].size + this.shotsBy[1].size,
      winner: this.winner,
    };
  }
}
