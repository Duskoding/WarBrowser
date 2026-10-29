import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import { WebSocket } from "ws";
import { createWarServer } from "../server.js";

const servers = [];

// Never calls the real API, whatever ANTHROPIC_API_KEY is set to.
const silentCommentator = { describe: async () => null };

async function startServer(commentator = silentCommentator) {
  const instance = createWarServer({ commentator });
  instance.httpServer.listen(0, "127.0.0.1");
  await once(instance.httpServer, "listening");
  servers.push(instance);
  const { port } = instance.httpServer.address();
  return `ws://127.0.0.1:${port}/ws`;
}

// Queues every message from the moment the socket opens, so nothing is lost
// when the server sends several messages back to back.
async function connect(url) {
  const socket = new WebSocket(url);
  const queue = [];
  const waiting = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else queue.push(message);
  });
  socket.next = () =>
    new Promise((resolve) => {
      if (queue.length) resolve(queue.shift());
      else waiting.push(resolve);
    });
  await once(socket, "open");
  return socket;
}

const post = (socket, message) => socket.send(JSON.stringify(message));

async function startRoom(commentator) {
  const url = await startServer(commentator);
  const host = await connect(url);
  const guest = await connect(url);
  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  assert.equal((await guest.next()).type, "room_joined");
  assert.equal((await host.next()).type, "opponent_joined");
  const hostState = (await host.next()).payload;
  const guestState = (await guest.next()).payload;
  return { url, host, guest, roomCode, hostState, guestState };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      ({ httpServer, websocketServer }) =>
        new Promise((resolve) => {
          websocketServer.close(() => httpServer.close(resolve));
          for (const socket of websocketServer.clients) {
            socket.terminate();
          }
        })
    )
  );
});

test("creates a room and joins a second player", async () => {
  const url = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  post(host, { type: "create_room" });
  const created = await host.next();
  assert.equal(created.type, "room_created");
  assert.match(created.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);

  post(guest, { type: "join_room", roomCode: created.roomCode });
  assert.deepEqual(await guest.next(), { type: "room_joined", roomCode: created.roomCode });
  assert.deepEqual(await host.next(), { type: "opponent_joined" });

  host.close();
  guest.close();
});

test("deals a fresh game to both players when the second one joins", async () => {
  const { host, guest, hostState, guestState } = await startRoom();
  for (const payload of [hostState, guestState]) {
    assert.equal(payload.kind, "state");
    assert.deepEqual(payload.view, {
      yourCard: null,
      opponentCard: null,
      pile: 0,
      yourCount: 26,
      opponentCount: 26,
      phase: "waiting"
    });
  }
  host.close();
  guest.close();
});

test("flips are resolved by the server and each player gets their own view", async () => {
  const { host, guest } = await startRoom();

  post(host, { type: "game_message", payload: { kind: "flip" } });
  const hostFirst = (await host.next()).payload.view;
  const guestFirst = (await guest.next()).payload.view;
  assert.equal(hostFirst.phase, "flipped");
  assert.ok(hostFirst.yourCard);
  assert.equal(hostFirst.opponentCard, null);
  assert.equal(guestFirst.yourCard, null);
  assert.equal(guestFirst.opponentCard, null);

  post(guest, { type: "game_message", payload: { kind: "flip" } });
  const hostSecond = (await host.next()).payload.view;
  const guestSecond = (await guest.next()).payload.view;
  assert.deepEqual(hostSecond.yourCard, guestSecond.opponentCard);
  assert.deepEqual(hostSecond.opponentCard, guestSecond.yourCard);
  assert.equal(hostSecond.yourCount, guestSecond.opponentCount);
  assert.equal(hostSecond.opponentCount, guestSecond.yourCount);
  assert.match(hostSecond.yourCard.suit, /^[♠♥♦♣]$/);
  assert.ok(["roundOver", "war"].includes(hostSecond.phase));

  host.close();
  guest.close();
});

test("sends commentary to both players after a round resolves, not before", async () => {
  const summaries = [];
  const { host, guest } = await startRoom({
    describe: async (summary) => {
      summaries.push(summary);
      return "What a flip!";
    }
  });

  post(host, { type: "game_message", payload: { kind: "flip" } });
  await host.next();
  await guest.next();
  assert.equal(summaries.length, 0);

  post(guest, { type: "game_message", payload: { kind: "flip" } });
  assert.equal((await host.next()).payload.kind, "state");
  assert.equal((await guest.next()).payload.kind, "state");

  const expected = {
    type: "game_message",
    payload: { kind: "commentary", text: "What a flip!", round: 1 }
  };
  assert.deepEqual(await host.next(), expected);
  assert.deepEqual(await guest.next(), expected);
  assert.equal(summaries.length, 1);

  host.close();
  guest.close();
});

test("a failing commentator never blocks play", async () => {
  const { host, guest } = await startRoom({ describe: async () => null });
  post(host, { type: "game_message", payload: { kind: "flip" } });
  await host.next();
  await guest.next();
  post(guest, { type: "game_message", payload: { kind: "flip" } });
  assert.equal((await host.next()).payload.view.phase === "waiting", false);
  host.close();
  guest.close();
});

test("rejects a double flip and forged state messages", async () => {
  const { host, guest } = await startRoom();

  post(host, { type: "game_message", payload: { kind: "flip" } });
  await host.next();
  await guest.next();
  post(host, { type: "game_message", payload: { kind: "flip" } });
  assert.equal((await host.next()).type, "error");

  post(host, { type: "game_message", payload: { kind: "state", view: {} } });
  assert.equal((await host.next()).type, "error");
  post(host, { type: "game_message", payload: { kind: "commentary", text: "hi" } });
  assert.equal((await host.next()).type, "error");

  host.close();
  guest.close();
});

test("still relays other game messages to the opponent", async () => {
  const { host, guest } = await startRoom();
  post(host, { type: "game_message", payload: { type: "play", card: "AS" } });
  assert.deepEqual(await guest.next(), {
    type: "game_message",
    payload: { type: "play", card: "AS" }
  });
  host.close();
  guest.close();
});

test("a new game is dealt when a player rejoins", async () => {
  const { url, host, guest, roomCode } = await startRoom();
  post(host, { type: "game_message", payload: { kind: "flip" } });
  await host.next();
  await guest.next();

  guest.close();
  assert.deepEqual(await host.next(), { type: "opponent_disconnected" });

  const newGuest = await connect(url);
  post(newGuest, { type: "join_room", roomCode });
  assert.equal((await newGuest.next()).type, "room_joined");
  assert.equal((await host.next()).type, "opponent_joined");
  const fresh = (await host.next()).payload.view;
  assert.equal(fresh.phase, "waiting");
  assert.equal(fresh.yourCount, 26);

  host.close();
  newGuest.close();
});

test("serves the browser client and rejects unknown paths", async () => {
  const websocketUrl = await startServer();
  const httpUrl = websocketUrl.replace("ws://", "http://").replace("/ws", "");

  const page = await fetch(httpUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WarBrowser|Live War/);

  const unknownPath = await fetch(`${httpUrl}/not-found`);
  assert.equal(unknownPath.status, 404);
});

test("rejects a third player and game messages before an opponent joins", async () => {
  const url = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  const thirdPlayer = await connect(url);
  post(host, { type: "create_room" });
  const created = await host.next();

  post(host, { type: "game_message", payload: { kind: "flip" } });
  assert.equal((await host.next()).type, "error");

  post(guest, { type: "join_room", roomCode: created.roomCode });
  await guest.next();
  await host.next();
  post(thirdPlayer, { type: "join_room", roomCode: created.roomCode });
  assert.deepEqual(await thirdPlayer.next(), {
    type: "error",
    message: "That room is full."
  });

  host.close();
  guest.close();
  thirdPlayer.close();
});
