import assert from "node:assert/strict";
import { test } from "node:test";
import { uno } from "./index.ts";
import { findGame, gameSummaries, games } from "../index.ts";

const identity = <T>(items: T[]): T[] => items.slice();
const silent = (players: number) => ({
  commentator: { describe: async () => null },
  options: { shuffle: identity },
  players,
});
const names = (n: number) => Array.from({ length: n }, (_, i) => ({ username: `p${i}` }));

test("the module reports a view per seat and relays unknown payloads", () => {
  const context = silent(3);
  const engine = uno.createEngine(context);
  assert.equal(uno.handleAction(engine, 0, { kind: "chat" }, context), null);

  const view = uno.toView(engine, 1, names(3)) as Record<string, unknown>;
  assert.equal(Array.isArray(view.hand), true);
  assert.deepEqual(view.handCounts, [7, 7, 7]);
  assert.equal(view.yourSeat, 1);
  assert.deepEqual(view.names, ["p0", "p1", "p2"]);
});

test("rejects acting out of turn through handleAction", () => {
  const context = silent(2);
  const engine = uno.createEngine(context);
  const result = uno.handleAction(engine, 1, { kind: "draw" }, context);
  assert.deepEqual(result, { ok: false, error: "It's not your turn." });
});

test("rejects an invalid chosen color", () => {
  const context = silent(2);
  const engine = uno.createEngine(context);
  const view = uno.toView(engine, 0, names(2)) as { hand: { rank: unknown }[] };
  const wildIndex = view.hand.findIndex((c) => c.rank === "wild" || c.rank === "wildDrawFour");
  if (wildIndex === -1) return; // no wild dealt this shuffle; nothing to assert
  const result = uno.handleAction(
    engine,
    0,
    { kind: "play", cardIndex: wildIndex, chosenColor: "purple" },
    context,
  );
  assert.deepEqual(result, { ok: false, error: "Choose a valid color." });
});

test("a completed game reports finished and commentary", () => {
  const context = silent(2);
  const engine = uno.createEngine(context);

  let result;
  let guard = 0;
  while (guard++ < 2000) {
    const seat = engine.getState(0).currentSeat;
    const s = engine.getState(seat);
    const playable = s.hand.findIndex(
      (c) =>
        c.rank === "wild" ||
        c.rank === "wildDrawFour" ||
        c.color === s.activeColor ||
        c.rank === s.discardTop.rank,
    );
    if (playable === -1) {
      result = uno.handleAction(engine, seat, { kind: "draw" }, context);
    } else {
      const needsColor = ["wild", "wildDrawFour"].includes(s.hand[playable].rank as string);
      result = uno.handleAction(
        engine,
        seat,
        { kind: "play", cardIndex: playable, chosenColor: needsColor ? "red" : undefined },
        context,
      );
    }
    assert.ok(result && (result.ok === false || result.ok === true));
    if (result?.ok && result.finished) break;
  }

  assert.ok(result?.ok);
  if (result?.ok) {
    assert.ok(result.finished);
    assert.equal(typeof result.commentary?.round, "number");
  }
});

test("the registry lists uno with a 2-8 player range", () => {
  const ids = games.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("uno"));
  assert.deepEqual(findGame("uno")?.players, { min: 2, max: 8 });
  assert.deepEqual(
    gameSummaries().map((g) => g.id),
    ids,
  );
});
