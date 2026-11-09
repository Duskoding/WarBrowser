import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleshipEngine, FLEET, SIZE, randomFleet, type Ship } from "./BattleshipEngine.ts";
import { battleship, buildBattleshipPrompt } from "./index.ts";

const players = [{ username: "a" }, { username: "b" }];

// Deterministic PRNG (mulberry32), so random placement is reproducible.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fixed fleet with one ship per row starting at `firstRow`, each from column 0.
// Rows 0-4 are the first seat's fleet, rows 5-9 the second's. Destroyers sit on
// cells 40-41 and 90-91, Carriers on cells 0-4 and 50-54.
const fleetFrom = (firstRow: number): Ship[] =>
  FLEET.map(({ name, size }, i) => ({
    name,
    cells: Array.from({ length: size }, (_, col) => (firstRow + i) * SIZE + col),
  }));

const started = (): BattleshipEngine => {
  const game = new BattleshipEngine({ fleets: [fleetFrom(0), fleetFrom(5)] });
  game.apply(0, { kind: "ready" });
  game.apply(1, { kind: "ready" });
  return game;
};

// A commentator context that records every prompt it is asked to describe.
function context(prompts: string[] = []) {
  return {
    options: {},
    players: 2,
    commentator: {
      describe: async (prompt: string) => {
        prompts.push(prompt);
        return prompt;
      },
    },
  };
}

// Every cell of a view's ship lists (own ships and sunk enemy ships).
function shipCellsIn(view: Record<string, unknown>): Set<number> {
  const own = view.yourShips as Ship[];
  const sunk = view.sunkEnemyShips as Ship[];
  return new Set([...own, ...sunk].flatMap((s) => s.cells));
}

function isStraight(cells: number[]): boolean {
  const across = cells.every(
    (c, i) => i === 0 || (Math.floor(c / SIZE) === Math.floor(cells[0] / SIZE) && c === cells[i - 1] + 1),
  );
  const down = cells.every((c, i) => i === 0 || (c % SIZE === cells[0] % SIZE && c === cells[i - 1] + SIZE));
  return across || down;
}

// Seat 0 fires at every enemy ship cell in fleet order; seat 1 answers with
// misses on seat 0's board. Returns each module result, stopping at the win.
function playOut(engine: BattleshipEngine, prompts: string[] = []) {
  const targets = engine.getState(1).yourShips.flatMap((s) => s.cells);
  const mine = new Set(engine.getState(0).yourShips.flatMap((s) => s.cells));
  const misses = Array.from({ length: SIZE * SIZE }, (_, c) => c).filter((c) => !mine.has(c));
  const results: ReturnType<typeof battleship.handleAction>[] = [];
  for (const cell of targets) {
    const result = battleship.handleAction(engine, 0, { kind: "fire", cell }, context(prompts));
    results.push(result);
    if (result?.ok && result.finished) break;
    battleship.handleAction(engine, 1, { kind: "fire", cell: misses.shift()! }, context(prompts));
  }
  return results;
}

test("random fleets are complete, straight, in bounds and never overlap", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const fleet = randomFleet(seeded(seed));
    assert.deepEqual(fleet.map((s) => s.name), FLEET.map((s) => s.name));
    assert.deepEqual(fleet.map((s) => s.cells.length), FLEET.map((s) => s.size));
    for (const ship of fleet) assert.ok(isStraight(ship.cells), `${ship.name} is straight (seed ${seed})`);
    const cells = fleet.flatMap((s) => s.cells);
    assert.equal(new Set(cells).size, cells.length, `no overlaps (seed ${seed})`);
    assert.ok(cells.every((c) => Number.isInteger(c) && c >= 0 && c < SIZE * SIZE), `in bounds (seed ${seed})`);
  }
});

test("a seeded random option makes the engine's fleets reproducible", () => {
  const engine = new BattleshipEngine({ random: seeded(3) });
  const expected = randomFleet(seeded(3));
  assert.deepEqual(
    engine.getState(0).yourShips.map(({ name, cells }) => ({ name, cells })),
    expected,
  );
});

test("setup: shuffle re-places only the shuffling seat's fleet, and the result stays valid", () => {
  const engine = new BattleshipEngine({ random: seeded(11) });
  const before0 = engine.getState(0).yourShips.map((s) => s.cells);
  const before1 = engine.getState(1).yourShips.map((s) => s.cells);
  assert.deepEqual(engine.apply(0, { kind: "shuffle" }), { ok: true });
  assert.notDeepEqual(engine.getState(0).yourShips.map((s) => s.cells), before0);
  assert.deepEqual(engine.getState(1).yourShips.map((s) => s.cells), before1);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(engine.apply(0, { kind: "shuffle" }), { ok: true });
    const cells = engine.getState(0).yourShips.flatMap((s) => s.cells);
    assert.equal(new Set(cells).size, cells.length);
    assert.equal(cells.length, FLEET.reduce((n, s) => n + s.size, 0));
  }
});

test("setup: nothing but shuffle and ready until both players are ready", () => {
  const engine = new BattleshipEngine({ random: seeded(5) });
  assert.deepEqual(engine.apply(0, { kind: "fire", cell: 0 }), { ok: false, error: "Wait until both players are ready." });
  assert.deepEqual(engine.apply(0, { kind: "ready" }), { ok: true });
  assert.deepEqual(engine.apply(0, { kind: "ready" }), { ok: false, error: "You're already ready." });
  assert.deepEqual(engine.apply(0, { kind: "fire", cell: 0 }), { ok: false, error: "Wait until both players are ready." });
  assert.deepEqual(engine.apply(1, { kind: "fire", cell: 0 }), { ok: false, error: "Wait until both players are ready." });
  assert.equal(engine.getState(0).phase, "setup");
  assert.equal(engine.getState(0).yourReady, true);
  assert.equal(engine.getState(0).opponentReady, false);
  assert.equal(engine.getState(1).opponentReady, true);
  assert.equal(engine.getState(1).yourTurn, false);
});

test("setup: shuffling after ready is refused and leaves the fleet unchanged", () => {
  const engine = new BattleshipEngine({ random: seeded(9) });
  engine.apply(0, { kind: "ready" });
  const before = engine.getState(0).yourShips.map((s) => s.cells);
  assert.deepEqual(engine.apply(0, { kind: "shuffle" }), { ok: false, error: "You're already ready." });
  assert.deepEqual(engine.getState(0).yourShips.map((s) => s.cells), before);
  // The other seat can still shuffle until it is ready.
  assert.deepEqual(engine.apply(1, { kind: "shuffle" }), { ok: true });
  engine.apply(1, { kind: "ready" });
  assert.equal(engine.getState(0).phase, "playing");
  assert.deepEqual(engine.apply(0, { kind: "shuffle" }), { ok: false, error: "The battle has already started." });
});

test("a hit does not keep the turn; a miss passes it too", () => {
  const game = started();
  assert.equal(game.apply(1, { kind: "fire", cell: 0 }).ok, false, "seat 1 is not first");
  const hit = game.apply(0, { kind: "fire", cell: 50 });
  assert.ok(hit.ok);
  assert.equal(hit.shot?.result, "hit");
  assert.equal(game.getState(0).yourTurn, false);
  assert.equal(game.getState(1).yourTurn, true);
  assert.deepEqual(game.apply(0, { kind: "fire", cell: 60 }), { ok: false, error: "It's not your turn." });
  const miss = game.apply(1, { kind: "fire", cell: 55 });
  assert.ok(miss.ok);
  assert.equal(miss.shot?.result, "miss");
  assert.equal(game.getState(0).yourTurn, true);
});

test("out-of-range cells are rejected and do not spend the turn", () => {
  const game = started();
  for (const cell of [-1, SIZE * SIZE, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1000]) {
    assert.deepEqual(game.apply(0, { kind: "fire", cell }), { ok: false, error: "Pick a square." }, `cell ${cell}`);
  }
  assert.equal(game.getState(0).yourTurn, true);
  assert.equal(game.getState(0).shots, 0);
});

test("firing at a repeated cell is refused; the opponent may fire at the same index", () => {
  const game = started();
  assert.ok(game.apply(0, { kind: "fire", cell: 99 }).ok);
  assert.ok(game.apply(1, { kind: "fire", cell: 99 }).ok, "same index on the other grid");
  assert.deepEqual(game.apply(0, { kind: "fire", cell: 99 }), { ok: false, error: "You already fired there." });
  assert.equal(game.getState(0).yourTurn, true);
});

test("hit and sunk results name a ship only when it sinks, and only that ship is revealed", () => {
  const game = started();
  // Seat 1's Destroyer is on cells 90 and 91; seat 0 fires one at a time.
  const first = game.apply(0, { kind: "fire", cell: 90 });
  assert.ok(first.ok);
  assert.equal(first.shot?.result, "hit");
  assert.equal(first.shot?.ship, undefined);
  assert.deepEqual(game.getState(0).sunkEnemyShips, []);
  assert.equal(game.getState(1).yourShips.find((s) => s.name === "Destroyer")?.sunk, false);

  game.apply(1, { kind: "fire", cell: 95 });
  const second = game.apply(0, { kind: "fire", cell: 91 });
  assert.ok(second.ok);
  assert.equal(second.shot?.result, "sunk");
  assert.equal(second.shot?.ship, "Destroyer");
  assert.equal(second.finished, undefined);
  assert.deepEqual(game.getState(0).sunkEnemyShips, [{ name: "Destroyer", cells: [90, 91] }]);
  assert.equal(game.getState(0).enemyShipsLeft, 4);
  assert.equal(game.getState(1).yourShips.find((s) => s.name === "Destroyer")?.sunk, true);
  assert.equal(game.getState(0).yourTurn, false, "sinking a ship does not keep the turn either");
});

test("a shot that sinks a ship is reported as sunk with its name, from the module too", async () => {
  const game = started();
  const prompts: string[] = [];
  battleship.handleAction(game, 0, { kind: "fire", cell: 90 }, context(prompts));
  battleship.handleAction(game, 1, { kind: "fire", cell: 95 }, context(prompts));
  const sink = battleship.handleAction(game, 0, { kind: "fire", cell: 91 }, context(prompts));
  assert.ok(sink?.ok);
  assert.equal(sink.finished, undefined);
  assert.ok(sink.commentary);
  assert.equal(await sink.commentary.text, buildBattleshipPrompt(0, "Destroyer", false));
});

test("sinking the last ship wins; finished is set only on that action", async () => {
  const game = started();
  const prompts: string[] = [];
  const results = playOut(game, prompts);
  const last = results[results.length - 1];
  assert.deepEqual(last && last.ok && last.finished, { winner: 0 });
  for (const result of results.slice(0, -1)) {
    assert.ok(result?.ok);
    assert.equal(result.finished, undefined);
  }
  assert.equal(game.getState(0).winner, 0);
  assert.equal(game.getState(0).phase, "over");
  assert.equal(game.getState(0).enemyShipsLeft, 0);
  assert.equal(game.getState(0).yourTurn, false);
  assert.equal(game.getState(1).yourTurn, false);
});

test("commentary is produced only for sinking shots, and the winning shot says so", async () => {
  const game = started();
  const prompts: string[] = [];
  const results = playOut(game, prompts);
  const withCommentary = results.map((r, i) => (r?.ok && r.commentary ? i : -1)).filter((i) => i >= 0);
  // Each enemy ship's last cell completes it; there are five ships.
  const targets = fleetFrom(5).flatMap((s) => s.cells);
  const lastCellIndexes = FLEET.map((_, i) => targets.indexOf(fleetFrom(5)[i].cells.at(-1)!));
  assert.deepEqual(withCommentary, lastCellIndexes);
  assert.deepEqual(
    prompts,
    FLEET.map((ship, i) => buildBattleshipPrompt(0, ship.name, i === FLEET.length - 1)),
  );
  const texts = await Promise.all(results.flatMap((r) => (r?.ok && r.commentary ? [r.commentary.text] : [])));
  assert.deepEqual(texts, prompts);
  assert.ok(prompts.at(-1)!.includes("wins the battle"));
  assert.ok(prompts[0].includes("sank the opponent's Carrier"));
});

test("commentary is not produced on a plain hit or miss", () => {
  const game = started();
  const prompts: string[] = [];
  const hit = battleship.handleAction(game, 0, { kind: "fire", cell: 50 }, context(prompts));
  const miss = battleship.handleAction(game, 1, { kind: "fire", cell: 55 }, context(prompts));
  for (const result of [hit, miss]) {
    assert.ok(result?.ok);
    assert.equal("commentary" in result, false);
  }
  assert.deepEqual(prompts, []);
});

test("actions after the end are refused, for both seats and every kind", () => {
  const game = started();
  playOut(game);
  for (const seat of [0, 1]) {
    for (const action of [{ kind: "fire", cell: 0 }, { kind: "shuffle" }, { kind: "ready" }] as const) {
      assert.deepEqual(game.apply(seat, action), { ok: false, error: "The game is over." });
      const result = battleship.handleAction(game, seat, action, context());
      assert.deepEqual(result, { ok: false, error: "The game is over." });
    }
  }
});

test("handleAction validates payloads and returns null for unknown kinds", () => {
  const game = started();
  const bad = [{ kind: "fire" }, { kind: "fire", cell: "50" }, { kind: "fire", cell: null }, { kind: "fire", cell: 1.5 }, { kind: "fire", cell: [3] }];
  for (const payload of bad) {
    assert.deepEqual(battleship.handleAction(game, 0, payload, context()), { ok: false, error: "Pick a square." }, JSON.stringify(payload));
  }
  assert.deepEqual(battleship.handleAction(game, 0, { kind: "fire", cell: 100 }, context()), { ok: false, error: "Pick a square." });
  for (const payload of [{}, { kind: 5 }, { kind: "FIRE", cell: 1 }, { kind: "bogus" }, { kind: "" }]) {
    assert.equal(battleship.handleAction(game, 0, payload, context()), null, JSON.stringify(payload));
  }
  // The rejected payloads did not spend the turn or record a shot.
  assert.equal(game.getState(0).shots, 0);
  assert.equal(game.getState(0).yourTurn, true);
});

test("handleAction passes setup actions through and reports their errors", () => {
  const game = new BattleshipEngine({ random: seeded(2) });
  assert.deepEqual(battleship.handleAction(game, 0, { kind: "shuffle" }, context()), { ok: true, finished: undefined });
  assert.deepEqual(battleship.handleAction(game, 0, { kind: "ready" }, context()), { ok: true, finished: undefined });
  assert.deepEqual(battleship.handleAction(game, 0, { kind: "ready" }, context()), { ok: false, error: "You're already ready." });
  assert.deepEqual(battleship.handleAction(game, 0, { kind: "fire", cell: 3 }, context()), { ok: false, error: "Wait until both players are ready." });
});

test("toView before the battle shows only the viewer's own ships and no result", () => {
  const game = new BattleshipEngine({ fleets: [fleetFrom(0), fleetFrom(5)] });
  const view = battleship.toView(game, 0, players) as Record<string, unknown>;
  assert.equal(view.size, SIZE);
  assert.equal(view.phase, "setup");
  assert.deepEqual(view.fleet, FLEET);
  assert.equal(view.result, undefined);
  assert.equal(view.yourName, "a");
  assert.equal(view.opponentName, "b");
  assert.deepEqual([...shipCellsIn(view)].sort((x, y) => x - y), fleetFrom(0).flatMap((s) => s.cells).sort((x, y) => x - y));
});

test("toView never reveals the opponent's unhit ship cells, from either seat", () => {
  const game = started();
  game.apply(0, { kind: "fire", cell: 90 });
  game.apply(1, { kind: "fire", cell: 95 });
  game.apply(0, { kind: "fire", cell: 50 });
  const enemyOf0 = new Set(fleetFrom(5).flatMap((s) => s.cells));
  const enemyOf1 = new Set(fleetFrom(0).flatMap((s) => s.cells));
  const view0 = battleship.toView(game, 0, players) as Record<string, unknown>;
  const view1 = battleship.toView(game, 1, players) as Record<string, unknown>;
  // Only the Destroyer's cells are sunk so far, and none is revealed yet.
  assert.deepEqual(view0.sunkEnemyShips, []);
  assert.ok([...shipCellsIn(view0)].every((c) => !enemyOf0.has(c)));
  assert.ok([...shipCellsIn(view1)].every((c) => !enemyOf1.has(c)));
  assert.deepEqual(view0.outgoing, { 90: "hit", 50: "hit" });
  assert.deepEqual(view1.incoming, { 90: "hit", 50: "hit" });
  assert.equal(view0.yourTurn, false);
  assert.equal(view1.yourTurn, true);
});

test("toView after a sink reveals exactly the sunk enemy ship, and marks it sunk on its owner's view", () => {
  const game = started();
  game.apply(0, { kind: "fire", cell: 90 });
  game.apply(1, { kind: "fire", cell: 95 });
  game.apply(0, { kind: "fire", cell: 91 });
  const view0 = battleship.toView(game, 0, players) as Record<string, unknown>;
  const view1 = battleship.toView(game, 1, players) as Record<string, unknown>;
  assert.deepEqual(view0.sunkEnemyShips, [{ name: "Destroyer", cells: [90, 91] }]);
  assert.equal(view0.enemyShipsLeft, 4);
  const enemyUnhit = new Set(fleetFrom(5).flatMap((s) => s.cells).filter((c) => c !== 90 && c !== 91));
  assert.ok([...shipCellsIn(view0)].every((c) => !enemyUnhit.has(c)));
  const ownDestroyer = (view1.yourShips as (Ship & { sunk: boolean })[]).find((s) => s.name === "Destroyer");
  assert.equal(ownDestroyer?.sunk, true);
  assert.equal((view1.sunkEnemyShips as Ship[]).length, 0);
});

test("toView after the end: the winner sees result 'you' and the loser sees 'opponent'", () => {
  const game = started();
  playOut(game);
  const view0 = battleship.toView(game, 0, players) as Record<string, unknown>;
  const view1 = battleship.toView(game, 1, players) as Record<string, unknown>;
  assert.equal(view0.phase, "over");
  assert.equal(view0.result, "you");
  assert.equal(view1.result, "opponent");
  assert.equal(view0.enemyShipsLeft, 0);
  assert.equal((view0.sunkEnemyShips as Ship[]).length, FLEET.length);
});

test("toView reports readiness for each seat during setup", () => {
  const game = new BattleshipEngine({ fleets: [fleetFrom(0), fleetFrom(5)] });
  game.apply(1, { kind: "ready" });
  const view0 = battleship.toView(game, 0, players) as Record<string, unknown>;
  const view1 = battleship.toView(game, 1, players) as Record<string, unknown>;
  assert.equal(view0.yourReady, false);
  assert.equal(view0.opponentReady, true);
  assert.equal(view1.yourReady, true);
  assert.equal(view1.opponentReady, false);
});
