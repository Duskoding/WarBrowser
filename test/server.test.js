import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import { WebSocket } from "ws";
import { createWarServer } from "../server.js";

const servers = [];

async function startServer() {
  const instance = createWarServer();
  instance.httpServer.listen(0, "127.0.0.1");
  await once(instance.httpServer, "listening");
  servers.push(instance);
  const { port } = instance.httpServer.address();
  return `ws://127.0.0.1:${port}/ws`;
}

async function connect(url) {
  const socket = new WebSocket(url);
  await once(socket, "open");
  return socket;
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function sendAndReceive(socket, message) {
  const response = nextMessage(socket);
  socket.send(JSON.stringify(message));
  return response;
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

test("creates a room, joins a second player, and relays game messages", async () => {
  const url = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  const created = await sendAndReceive(host, { type: "create_room" });
  assert.equal(created.type, "room_created");
  assert.match(created.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);

  const hostJoined = nextMessage(host);
  guest.send(JSON.stringify({ type: "join_room", roomCode: created.roomCode }));
  const [joined, opponentJoined] = await Promise.all([
    nextMessage(guest),
    hostJoined
  ]);
  assert.deepEqual(joined, { type: "room_joined", roomCode: created.roomCode });
  assert.deepEqual(opponentJoined, { type: "opponent_joined" });

  const receivedGameMessage = nextMessage(guest);
  host.send(JSON.stringify({
    type: "game_message",
    payload: { type: "play", card: "AS" }
  }));
  assert.deepEqual(await receivedGameMessage, {
    type: "game_message",
    payload: { type: "play", card: "AS" }
  });

  host.close();
  guest.close();
});

test("serves the browser client and rejects unknown paths", async () => {
  const websocketUrl = await startServer();
  const httpUrl = websocketUrl.replace("ws://", "http://").replace("/ws", "");

  const page = await fetch(httpUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WarBrowser/);

  const unknownPath = await fetch(`${httpUrl}/not-found`);
  assert.equal(unknownPath.status, 404);
});

test("rejects a third player and game messages before an opponent joins", async () => {
  const url = await startServer();
  const host = await connect(url);
  const guest = await connect(url);
  const thirdPlayer = await connect(url);
  const created = await sendAndReceive(host, { type: "create_room" });

  assert.equal(
    (await sendAndReceive(host, {
      type: "game_message",
      payload: { type: "play" }
    })).type,
    "error"
  );

  guest.send(JSON.stringify({ type: "join_room", roomCode: created.roomCode }));
  await nextMessage(guest);
  await nextMessage(host);
  thirdPlayer.send(JSON.stringify({ type: "join_room", roomCode: created.roomCode }));
  assert.deepEqual(await nextMessage(thirdPlayer), {
    type: "error",
    message: "That room is full."
  });

  host.close();
  guest.close();
  thirdPlayer.close();
});
