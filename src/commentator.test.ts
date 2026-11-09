import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ClaudeCommentator,
  CommentaryLimiter,
  commentaryCallsPerMinuteFromEnv,
} from "./commentator.ts";

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

// Silences the expected error logs from failure-path tests.
const quiet = <T>(run: () => Promise<T>) => {
  const log = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  return run().finally(() => {
    console.error = log;
    console.warn = warn;
  });
};

test("returns the model text and sends the key, model, and prompt", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const commentator = new ClaudeCommentator({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: ((url: string, init: RequestInit) => {
      seen = { url, init };
      return reply({ content: [{ type: "text", text: "  Ace   crushes the nine!  " }] });
    }) as typeof fetch,
  });
  assert.equal(await commentator.describe("Say something lively."), "Ace crushes the nine!");
  assert.equal(seen?.url, "https://api.anthropic.com/v1/messages");
  const headers = seen?.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "test-key");
  const body = JSON.parse(seen?.init.body as string);
  assert.equal(body.model, "test-model");
  assert.equal(body.messages[0].content, "Say something lively.");
});

test("does nothing without an API key", async () => {
  let called = false;
  const commentator = new ClaudeCommentator({
    apiKey: "",
    fetchImpl: (() => {
      called = true;
      return reply({});
    }) as typeof fetch,
  });
  assert.equal(await quiet(() => commentator.describe("unused")), null);
  assert.equal(called, false);
});

test("returns null on API errors and empty replies", async () => {
  const failing = new ClaudeCommentator({
    apiKey: "k",
    fetchImpl: (() => reply({ error: "bad" }, 500)) as typeof fetch,
  });
  assert.equal(await quiet(() => failing.describe("x")), null);

  const empty = new ClaudeCommentator({
    apiKey: "k",
    fetchImpl: (() => reply({ content: [] })) as typeof fetch,
  });
  assert.equal(await quiet(() => empty.describe("x")), null);
});

test("gives up after the timeout", async () => {
  const commentator = new ClaudeCommentator({
    apiKey: "k",
    timeoutMs: 20,
    fetchImpl: ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch,
  });
  assert.equal(await quiet(() => commentator.describe("x")), null);
});

test("limits commentary calls per room and logs skipped calls", async () => {
  let calls = 0;
  const logs: string[] = [];
  const log = console.info;
  console.info = (message: string) => logs.push(message);
  try {
    const commentator = new CommentaryLimiter(
      {
        describe: async () => {
          calls += 1;
          return "line";
        },
      },
      { minIntervalMs: 0, maxCallsPerGame: 2, callsPerMinute: 10 },
    );
    const room = commentator.forRoom("ABC123");

    assert.equal(await room.describe("one"), "line");
    assert.equal(await room.describe("two"), "line");
    assert.equal(await room.describe("three"), null);
    assert.equal(calls, 2);
    assert.match(logs[0], /game limit reached/);
    assert.equal(await commentator.forRoom("ABC123").describe("new game"), "line");
    assert.equal(calls, 3);
  } finally {
    console.info = log;
  }
});

test("limits calls across rooms using the configured per-minute value", async () => {
  let calls = 0;
  const commentator = new CommentaryLimiter(
    {
      describe: async () => {
        calls += 1;
        return "line";
      },
    },
    { minIntervalMs: 0, maxCallsPerGame: 10, callsPerMinute: 2 },
  );

  assert.equal(await commentator.forRoom("ONE").describe("one"), "line");
  assert.equal(await commentator.forRoom("TWO").describe("two"), "line");
  assert.equal(await commentator.forRoom("THREE").describe("three"), null);
  assert.equal(calls, 2);
});

test("enforces the room interval", async () => {
  let now = 1000;
  let calls = 0;
  const commentator = new CommentaryLimiter(
    {
      describe: async () => {
        calls += 1;
        return "line";
      },
    },
    { minIntervalMs: 5000, now: () => now },
  );
  const room = commentator.forRoom("ABC123");

  assert.equal(await room.describe("one"), "line");
  assert.equal(await room.describe("two"), null);
  now += 5000;
  assert.equal(await room.describe("three"), "line");
  assert.equal(calls, 2);
});

test("uses a safe server default for invalid environment values", () => {
  assert.equal(
    commentaryCallsPerMinuteFromEnv({ COMMENTARY_CALLS_PER_MINUTE: "not-a-number" }),
    60,
  );
  assert.equal(
    commentaryCallsPerMinuteFromEnv({ COMMENTARY_CALLS_PER_MINUTE: "7" }),
    7,
  );
});
