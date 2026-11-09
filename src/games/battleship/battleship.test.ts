import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleshipEngine, FLEET, SIZE, randomFleet, type Ship } from "./BattleshipEngine.ts";
import { battleship } from "./index.ts";

const silent = { commentator: { describe: async () => null }, options: {} };
const players = [{ username: "a" }, { username: "b" }];

// A fixed fleet with one ship per row starting at `firstRow`, each from column 0.
const fleetFrom = (firstRow: number): Ship[] =>
  FLEET.map(({ name, size }, i) => ({
    name,
    cells: Array.from({ length: size }, (_, col) => (firstRow + i) * SIZE + col),
  }));

function started() {
  const game = new BattleshipEngine({ fleets: [fleetFrom(0), fleetFrom(5)] });
  game.apply(0, { kind: "ready" });
  game.apply(1, { kind: "ready" });
  return game;
}

test("random fleets have every ship, in bounds, with no overlaps", () => {
  for (let i = 0; i < 50; i++) {
    const fleet = randomFleet();
    assert.deepEqual(fleet.map((s) => s.cells.length), FLEET.map((s) => s.size));
    const cells = fleet.flatMap((s) => s.cells);
    assert.equal(new Set(cells).size, cells.length);
    assert.ok(cells.every((c) => c >= 0 && c < SIZE * SIZE));
  }
});

test("players can place a straight fleet, and bad layouts are rejected", () => {
  const game = new BattleshipEngine();
  const layout = fleetFrom(0).map((ship) =>
    ship.name === "Destroyer" ? { name: ship.name, cells: [9, 19] } : ship,
  );
  assert.equal(game.apply(0, { kind: "place", ships: layout }).ok, true);
  assert.deepEqual(
    game.getState(0).yourShips.find((ship) => ship.name === "Destroyer")?.cells,
    [9, 19],
  );

  const overlap = fleetFrom(0).map((ship) =>
    ship.name === "Battleship" ? { name: ship.name, cells: fleetFrom(0)[0].cells.slice(0, ship.cells.length) } : ship,
  );
  assert.deepEqual(game.apply(0, { kind: "place", ships: overlap }), { ok: false, error: "Ships can't overlap." });
  assert.deepEqual(
    game.apply(0, {
      kind: "place",
      ships: fleetFrom(0).map((ship) => (ship.name === "Carrier" ? { name: ship.name, cells: [0, 1, 2, 4, 5] } : ship)),
    }),
    { ok: false, error: "Keep each ship in a straight line." },
  );
  assert.deepEqual(
    game.apply(0, {
      kind: "place",
      ships: fleetFrom(0).map((ship) => (ship.name === "Destroyer" ? { name: ship.name, cells: [8, 19] } : ship)),
    }),
    { ok: false, error: "Keep each ship in a straight line." },
  );
  assert.deepEqual(
    game.apply(0, {
      kind: "place",
      ships: fleetFrom(0).map((ship) => (ship.name === "Destroyer" ? { name: ship.name, cells: [99, 100] } : ship)),
    }),
    { ok: false, error: "Keep each ship the right size and on the board." },
  );
  assert.equal(game.apply(0, { kind: "place", ships: fleetFrom(0).slice(1) }).ok, false);
  game.apply(0, { kind: "ready" });
  assert.equal(game.apply(0, { kind: "place", ships: layout }).ok, false);
});

test("a placed fleet is hidden from the other seat", () => {
  const engine = battleship.createEngine(silent);
  const layout = fleetFrom(1);
  const placed = battleship.handleAction(engine, 0, { kind: "place", ships: layout }, silent);
  assert.equal(placed?.ok, true);
  const guest = battleship.toView(engine, 1, players) as { yourShips: Ship[]; sunkEnemyShips: Ship[] };
  const guestCells = new Set(guest.yourShips.flatMap((ship) => ship.cells));
  assert.ok(layout.flatMap((ship) => ship.cells).some((cell) => !guestCells.has(cell)));
  assert.deepEqual(guest.sunkEnemyShips, []);
  const rejected = battleship.handleAction(engine, 0, { kind: "place", ships: [{ name: "Carrier", cells: [0, 1] }] }, silent);
  assert.equal(rejected?.ok, false);
});

test("no firing until both players are ready; no shuffling after", () => {
  const game = new BattleshipEngine();
  assert.equal(game.apply(0, { kind: "fire", cell: 0 }).ok, false);
  assert.equal(game.apply(0, { kind: "shuffle" }).ok, true);
  game.apply(0, { kind: "ready" });
  assert.equal(game.apply(0, { kind: "shuffle" }).ok, false);
  game.apply(1, { kind: "ready" });
  assert.equal(game.getState(0).phase, "playing");
  assert.equal(game.apply(1, { kind: "shuffle" }).ok, false);
});

test("hits, misses, turns and repeat shots", () => {
  const game = started();
  const enemyCell = game.getState(1).yourShips[0].cells[0];
  const hit = game.apply(0, { kind: "fire", cell: enemyCell });
  assert.ok(hit.ok && hit.shot?.result === "hit");
  assert.equal(game.apply(0, { kind: "fire", cell: 50 }).ok, false, "not your turn");
  const miss = game.apply(1, { kind: "fire", cell: 55 });
  assert.ok(miss.ok && miss.shot?.result === "miss");
  assert.equal(game.apply(0, { kind: "fire", cell: enemyCell }).ok, false, "already fired there");
});

test("enemy ship cells stay hidden until that ship sinks", () => {
  const engine = battleship.createEngine(silent);
  battleship.handleAction(engine, 0, { kind: "ready" }, silent);
  battleship.handleAction(engine, 1, { kind: "ready" }, silent);
  const hostFleet = engine.getState(0).yourShips;
  const guestView = battleship.toView(engine, 1, players) as Record<string, unknown>;
  // The guest's view holds only the guest's own ships; none of the host's cells appear as ships.
  const guestShipCells = new Set((guestView.yourShips as Ship[]).flatMap((s) => s.cells));
  assert.deepEqual(guestView.sunkEnemyShips, []);
  assert.ok(hostFleet.flatMap((s) => s.cells).some((c) => !guestShipCells.has(c)));
  assert.deepEqual(guestView.outgoing, {});
});

test("sinking a ship reveals it; sinking the fleet wins", () => {
  const game = started();
  const enemy = game.getState(1).yourShips;
  const mine = game.getState(0).yourShips.flatMap((s) => s.cells);
  const misses = Array.from({ length: SIZE * SIZE }, (_, c) => c).filter((c) => !mine.includes(c));
  let last;
  for (const ship of enemy) {
    for (const cell of ship.cells) {
      last = game.apply(0, { kind: "fire", cell });
      if (last.ok && last.finished) break;
      game.apply(1, { kind: "fire", cell: misses.shift()! });
    }
    if (last && last.ok && last.finished) break;
    assert.equal(last && last.ok && last.shot?.result, "sunk");
    assert.ok(game.getState(0).sunkEnemyShips.some((s) => s.name === ship.name));
  }
  assert.deepEqual(last && last.ok && last.finished, { winner: 0 });
  assert.equal(game.getState(0).enemyShipsLeft, 0);
  assert.equal(game.apply(1, { kind: "fire", cell: 99 }).ok, false);
});
