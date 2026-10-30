import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import { WebSocket } from "ws";
import { createWarServer } from "../server.js";

const servers = [];

// Never calls the real API, whatever ANTHROPIC_API_KEY is set to.
const silentCommentator = { describe: async () => null };

async function startServer(options = {}) {
  const instance = createWarServer({ commentator: silentCommentator, ...options });
  instance.httpServer.listen(0, "127.0.0.1");
  await once(instance.httpServer, "listening");
  servers.push(instance);
  const { port } = instance.httpServer.address();
  return {
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    httpUrl: `http://127.0.0.1:${port}`
  };
}

function cookieFrom(response) {
  return response.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join("; ");
}

async function register(httpUrl, username, password = "password1") {
  const response = await fetch(`${httpUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: cookieFrom(response)
  };
}

async function login(httpUrl, username, password = "password1") {
  const response = await fetch(`${httpUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: cookieFrom(response)
  };
}

async function me(httpUrl, cookie) {
  const response = await fetch(`${httpUrl}/api/me`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
  return { status: response.status, body: await response.json() };
}

// Queues every message from the moment the socket opens, so nothing is lost
// when the server sends several messages back to back.
async function connect(url, cookie) {
  const socket = new WebSocket(url, cookie ? { headers: { Cookie: cookie } } : undefined);
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

async function startRoom(commentator = silentCommentator) {
  const { wsUrl, httpUrl } = await startServer({ commentator });
  const hostAuth = await register(httpUrl, "host");
  const guestAuth = await register(httpUrl, "guest");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  assert.equal((await guest.next()).type, "room_joined");
  assert.equal((await host.next()).type, "opponent_joined");
  const hostState = (await host.next()).payload;
  const guestState = (await guest.next()).payload;
  return { wsUrl, httpUrl, host, guest, roomCode, hostState, guestState, hostAuth, guestAuth };
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

test("registers, logs in, and returns the current user", async () => {
  const { httpUrl } = await startServer();
  const created = await register(httpUrl, "Ada");
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { username: "Ada", wins: 0, losses: 0 });
  assert.match(created.cookie, /^session=/);

  assert.equal((await me(httpUrl, created.cookie)).status, 200);
  assert.deepEqual((await me(httpUrl, created.cookie)).body, {
    username: "Ada",
    wins: 0,
    losses: 0
  });

  const duplicate = await register(httpUrl, "ada");
  assert.equal(duplicate.status, 409);

  const loggedIn = await login(httpUrl, "Ada");
  assert.equal(loggedIn.status, 200);
  assert.equal((await me(httpUrl, loggedIn.cookie)).body.username, "Ada");

  const wrong = await login(httpUrl, "Ada", "password2");
  assert.equal(wrong.status, 401);

  const anonymous = await me(httpUrl);
  assert.equal(anonymous.status, 401);
});

test("rejects creating a room before logging in", async () => {
  const { wsUrl } = await startServer();
  const socket = await connect(wsUrl);
  post(socket, { type: "create_room" });
  assert.deepEqual(await socket.next(), {
    type: "error",
    message: "Log in before creating or joining a room."
  });
  socket.close();
});

test("creates a room and joins a second player", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const hostAuth = await register(httpUrl, "host");
  const guestAuth = await register(httpUrl, "guest");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  post(host, { type: "create_room" });
  const created = await host.next();
  assert.equal(created.type, "room_created");
  assert.match(created.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);

  post(guest, { type: "join_room", roomCode: created.roomCode });
  assert.deepEqual(await guest.next(), {
    type: "room_joined",
    roomCode: created.roomCode,
    username: "guest",
    opponentUsername: "host"
  });
  assert.deepEqual(await host.next(), { type: "opponent_joined", username: "guest" });

  host.close();
  guest.close();
});

test("deals a fresh game to both players when the second one joins", async () => {
  const { host, guest, hostState, guestState } = await startRoom();
  for (const [payload, yourName, opponentName] of [
    [hostState, "host", "guest"],
    [guestState, "guest", "host"]
  ]) {
    assert.equal(payload.kind, "state");
    assert.deepEqual(payload.view, {
      yourCard: null,
      opponentCard: null,
      pile: 0,
      yourCount: 26,
      opponentCount: 26,
      phase: "waiting",
      yourName,
      opponentName
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
  const { wsUrl, httpUrl, host, guest, roomCode } = await startRoom();
  post(host, { type: "game_message", payload: { kind: "flip" } });
  await host.next();
  await guest.next();

  guest.close();
  assert.deepEqual(await host.next(), { type: "opponent_disconnected" });

  const newGuestAuth = await register(httpUrl, "guest2");
  const newGuest = await connect(wsUrl, newGuestAuth.cookie);
  post(newGuest, { type: "join_room", roomCode });
  assert.equal((await newGuest.next()).type, "room_joined");
  assert.deepEqual(await host.next(), { type: "opponent_joined", username: "guest2" });
  const fresh = (await host.next()).payload.view;
  assert.equal(fresh.phase, "waiting");
  assert.equal(fresh.yourCount, 26);
  assert.equal(fresh.opponentName, "guest2");

  host.close();
  newGuest.close();
});

test("serves the browser client and rejects unknown paths", async () => {
  const { httpUrl } = await startServer();

  const page = await fetch(httpUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WarBrowser|Live War/);

  const unknownPath = await fetch(`${httpUrl}/not-found`);
  assert.equal(unknownPath.status, 404);
});

test("rejects a third player and game messages before an opponent joins", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);
  const thirdPlayer = await connect(wsUrl, (await register(httpUrl, "third")).cookie);
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

test("rejects joining a room as the same user twice", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const hostAuth = await register(httpUrl, "host");
  const host = await connect(wsUrl, hostAuth.cookie);
  const secondSeat = await connect(wsUrl, hostAuth.cookie);
  post(host, { type: "create_room" });
  const created = await host.next();
  post(secondSeat, { type: "join_room", roomCode: created.roomCode });
  assert.deepEqual(await secondSeat.next(), {
    type: "error",
    message: "You are already in this room."
  });
  host.close();
  secondSeat.close();
});

test("records a win and a loss when a short game ends", async () => {
  const { wsUrl, httpUrl } = await startServer({ engineOptions: { maxRounds: 1 } });
  const hostAuth = await register(httpUrl, "host");
  const guestAuth = await register(httpUrl, "guest");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  await guest.next();
  await host.next();
  await host.next();
  await guest.next();

  let view;
  for (let i = 0; i < 12; i++) {
    post(host, { type: "game_message", payload: { kind: "flip" } });
    await host.next();
    await guest.next();
    post(guest, { type: "game_message", payload: { kind: "flip" } });
    view = (await host.next()).payload.view;
    await guest.next();
    if (view.phase === "gameOver") break;
  }
  assert.equal(view.phase, "gameOver");

  const hostMe = await me(httpUrl, hostAuth.cookie);
  const guestMe = await me(httpUrl, guestAuth.cookie);
  const wins = hostMe.body.wins + guestMe.body.wins;
  const losses = hostMe.body.losses + guestMe.body.losses;
  if (view.winner === "you") {
    assert.deepEqual(hostMe.body, { username: "host", wins: 1, losses: 0 });
    assert.deepEqual(guestMe.body, { username: "guest", wins: 0, losses: 1 });
  } else if (view.winner === "opponent") {
    assert.deepEqual(hostMe.body, { username: "host", wins: 0, losses: 1 });
    assert.deepEqual(guestMe.body, { username: "guest", wins: 1, losses: 0 });
  } else {
    assert.equal(wins, 0);
    assert.equal(losses, 0);
  }

  host.close();
  guest.close();
});
