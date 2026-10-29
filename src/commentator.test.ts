import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeCommentator, buildPrompt, cardName } from './commentator.ts';
import type { RoundSummary } from './engine/types.ts';

const summary: RoundSummary = {
  round: 7,
  cardA: { rank: 14, suit: 'S' },
  cardB: { rank: 9, suit: 'D' },
  winner: 'A',
  wasWar: false,
  scoreA: 30,
  scoreB: 22,
  gameOver: false,
};

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

test('card names are readable', () => {
  assert.equal(cardName({ rank: 14, suit: 'S' }), 'Ace of Spades');
  assert.equal(cardName({ rank: 7, suit: 'H' }), '7 of Hearts');
});

test('prompt includes cards, winner and score', () => {
  const prompt = buildPrompt(summary);
  assert.match(prompt, /Ace of Spades/);
  assert.match(prompt, /9 of Diamonds/);
  assert.match(prompt, /Player A won\./);
  assert.match(prompt, /Player A 30, Player B 22/);
  assert.doesNotMatch(prompt, /after a war/);
});

test('prompt mentions war, draws and game end', () => {
  assert.match(buildPrompt({ ...summary, wasWar: true }), /after a war/);
  assert.match(buildPrompt({ ...summary, winner: null }), /draw/);
  assert.match(buildPrompt({ ...summary, gameOver: true }), /ended the game/);
});

test('returns the model text and sends the key and model', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const commentator = new ClaudeCommentator({
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: ((url: string, init: RequestInit) => {
      seen = { url, init };
      return reply({ content: [{ type: 'text', text: '  Ace   crushes the nine!  ' }] });
    }) as typeof fetch,
  });
  assert.equal(await commentator.describe(summary), 'Ace crushes the nine!');
  assert.equal(seen?.url, 'https://api.anthropic.com/v1/messages');
  const headers = seen?.init.headers as Record<string, string>;
  assert.equal(headers['x-api-key'], 'test-key');
  assert.equal(JSON.parse(seen?.init.body as string).model, 'test-model');
});

test('does nothing without an API key', async () => {
  let called = false;
  const commentator = new ClaudeCommentator({
    apiKey: '',
    fetchImpl: (() => {
      called = true;
      return reply({});
    }) as typeof fetch,
  });
  assert.equal(await quiet(() => commentator.describe(summary)), null);
  assert.equal(called, false);
});

test('returns null on API errors and empty replies', async () => {
  const failing = new ClaudeCommentator({
    apiKey: 'k',
    fetchImpl: (() => reply({ error: 'bad' }, 500)) as typeof fetch,
  });
  assert.equal(await quiet(() => failing.describe(summary)), null);

  const empty = new ClaudeCommentator({
    apiKey: 'k',
    fetchImpl: (() => reply({ content: [] })) as typeof fetch,
  });
  assert.equal(await quiet(() => empty.describe(summary)), null);
});

test('gives up after the timeout', async () => {
  const commentator = new ClaudeCommentator({
    apiKey: 'k',
    timeoutMs: 20,
    fetchImpl: ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as typeof fetch,
  });
  assert.equal(await quiet(() => commentator.describe(summary)), null);
});
