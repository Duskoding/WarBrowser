import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameModule, GameModuleContext } from "./GameModule.ts";
import { DEFAULT_GAME_ID, findGame, gameSummaries, games } from "./index.ts";

// Contract checks every GameModule must pass, plus seeded random playthroughs
// of every game to the end. Per-game rules are tested in each game's folder.

type Payload = Record<string, unknown>;

// mulberry32: a tiny seeded generator so every playthrough is repeatable.
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

function shuffler(random: () => number) {
  return <T>(items: T[]): T[] => {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
}

function contextFor(seed: number, players: number, describe = async (_prompt: string) => null as string | null): GameModuleContext {
  const random = seeded(seed);
  return {
    options: { shuffle: shuffler(random), random, maxRounds: 400 },
    commentator: { describe },
    players,
  };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const COLORS = ["red", "yellow", "green", "blue"];
const SUITS = ["S", "H", "D", "C"];

// Every payload worth trying for `seat` right now. Most are illegal at any
// moment; the playthrough keeps only the ones the server accepts.
const candidates: Record<string, (engine: any, seat: number) => Payload[]> = {
  war: () => [{ kind: "flip" }],
  tictactoe: () => range(9).map((cell) => ({ kind: "move", cell })),
  uno: (engine, seat) => [
    { kind: "draw" },
    ...range(engine.getState(seat).hand.length).flatMap((cardIndex) =>
      COLORS.map((chosenColor) => ({ kind: "play", cardIndex, chosenColor })),
    ),
  ],
  crazy8: (engine, seat) => [
    { kind: "draw" },
    { kind: "pass" },
    ...engine.getState(seat).yourHand.flatMap((card: unknown) => SUITS.map((suit) => ({ kind: "play", card, suit }))),
  ],
  gofish: () => range(13).map((i) => ({ kind: "ask", rank: i + 2 })),
  rps: () => ["rock", "paper", "scissors"].map((choice) => ({ kind: "pick", choice })),
  goofspiel: () => range(13).map((i) => ({ kind: "bid", value: i + 1 })),
  connect4: () => range(7).map((column) => ({ kind: "drop", column })),
  dots: () =>
    ["h", "v"].flatMap((dir) => range(5).flatMap((row) => range(5).map((col) => ({ kind: "line", dir, row, col })))),
  battleship: () => [{ kind: "ready" }, ...range(100).map((cell) => ({ kind: "fire", cell }))],
};

function views(game: GameModule, engine: unknown, players: number) {
  const infos = range(players).map((i) => ({ username: `p${i}` }));
  return JSON.stringify(range(players).map((seat) => game.toView(engine as never, seat, infos)));
}

// Plays random legal moves until the game finishes. Checks along the way that
// rejected actions change nothing and that only the last action finishes.
async function playThrough(game: GameModule, seed: number, players: number) {
  const random = seeded(seed * 7919);
  const context = contextFor(seed, players, async (prompt) => {
    assert.equal(typeof prompt, "string");
    assert.ok(prompt.length > 0);
    return null;
  });
  const engine = game.createEngine(context);
  const commentary: Promise<string | null>[] = [];
  for (let step = 0; step < 5000; step++) {
    const options = range(players).flatMap((seat) => candidates[game.id](engine, seat).map((payload) => ({ seat, payload })));
    const ordered = shuffler(random)(options);
    let accepted = false;
    for (const { seat, payload } of ordered) {
      const before = views(game, engine, players);
      const result = game.handleAction(engine as never, seat, payload, context);
      assert.ok(result, `${game.id} ignored its own action ${JSON.stringify(payload)}`);
      if (!result.ok) {
        assert.equal(typeof result.error, "string");
        assert.ok(result.error.length > 0);
        assert.equal(views(game, engine, players), before, `${game.id}: a rejected action changed the game`);
        continue;
      }
      accepted = true;
      if (result.commentary) {
        assert.ok(Number.isInteger(result.commentary.round));
        commentary.push(result.commentary.text);
      }
      if (result.finished) {
        const { winner } = result.finished;
        assert.ok(winner === null || (Number.isInteger(winner) && winner >= 0 && winner < players), `bad winner ${winner}`);
        await Promise.all(commentary);
        return { engine, context, winner, steps: step + 1 };
      }
      break;
    }
    assert.ok(accepted, `${game.id} (seed ${seed}) has no legal move but isn't finished`);
  }
  assert.fail(`${game.id} (seed ${seed}) did not finish`);
}

test("every game has unique, well-formed metadata", () => {
  const ids = games.map((game) => game.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const game of games) {
    assert.match(game.id, /^[a-z0-9]+$/);
    assert.ok(game.name.length > 0);
    assert.ok(game.description.length > 0);
    assert.ok(Number.isInteger(game.players.min) && game.players.min >= 2);
    assert.ok(Number.isInteger(game.players.max) && game.players.max >= game.players.min);
    assert.ok(candidates[game.id], `no playthrough candidates for ${game.id}; add them to contract.test.ts`);
  }
});

test("the game list helpers agree with the registered games", () => {
  assert.ok(findGame(DEFAULT_GAME_ID));
  for (const game of games) assert.equal(findGame(game.id), game);
  assert.equal(findGame("chess"), undefined);
  assert.equal(findGame(undefined), undefined);
  assert.equal(findGame(42), undefined);
  assert.deepEqual(
    gameSummaries(),
    games.map(({ id, name, description, players }) => ({ id, name, description, players })),
  );
});

for (const game of games) {
  test(`${game.id}: a fresh game has a view for every seat`, () => {
    for (const players of new Set([game.players.min, game.players.max])) {
      const engine = game.createEngine(contextFor(1, players));
      const infos = range(players).map((i) => ({ username: `p${i}` }));
      for (const seat of range(players)) {
        const view = game.toView(engine as never, seat, infos);
        assert.equal(typeof view, "object");
        assert.ok(view !== null);
        // Views go over the wire as JSON (undefined fields are simply dropped).
        assert.equal(typeof JSON.stringify(view), "string");
      }
    }
  });

  test(`${game.id}: payloads it doesn't handle return null`, () => {
    const context = contextFor(2, game.players.min);
    const engine = game.createEngine(context);
    for (const payload of [{}, { kind: "nonsense" }, { kind: 7 }, { type: "move" }]) {
      assert.equal(game.handleAction(engine as never, 0, payload, context), null, JSON.stringify(payload));
    }
  });

  for (const players of new Set([game.players.min, Math.min(3, game.players.max), game.players.max])) {
    test(`${game.id}: random ${players}-player playthroughs reach a valid end and then refuse moves`, async () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const { engine, context } = await playThrough(game, seed, players);
        for (const seat of range(players)) {
          for (const payload of candidates[game.id](engine, seat)) {
            const result = game.handleAction(engine as never, seat, payload, context);
            assert.equal(result?.ok, false, `${game.id} accepted ${JSON.stringify(payload)} after the end`);
          }
        }
      }
    });
  }
}
