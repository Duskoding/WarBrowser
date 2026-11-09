import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeCommentator } from "./commentator.ts";

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
