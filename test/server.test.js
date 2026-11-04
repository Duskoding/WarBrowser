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

async function startRoom(commentator = silentCommentator, engineOptions = {}, gameId) {
  const { wsUrl, httpUrl } = await startServer({ commentator, engineOptions });
  const hostAuth = await register(httpUrl, "host");
  const guestAuth = await register(httpUrl, "guest");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  post(host, gameId ? { type: "create_room", gameId } : { type: "create_room" });
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
    opponentUsername: "host",
    gameId: "war"
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
      inWar: false,
      warCards: [],
      yourStakes: [],
      opponentStakes: [],
      lastRound: null,
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
  assert.deepEqual(guestFirst.opponentCard, hostFirst.yourCard);

  post(guest, { type: "game_message", payload: { kind: "flip" } });
  const hostSecond = (await host.next()).payload.view;
  const guestSecond = (await guest.next()).payload.view;
  assert.equal(hostSecond.yourCount, guestSecond.opponentCount);
  assert.equal(hostSecond.opponentCount, guestSecond.yourCount);
  assert.ok(["roundOver", "war"].includes(hostSecond.phase));
  if (hostSecond.phase === "war") {
    // Tied battle cards move into warCards; main slots wait for the war flip.
    assert.equal(hostSecond.yourCard, null);
    assert.equal(hostSecond.opponentCard, null);
    assert.equal(hostSecond.inWar, true);
    assert.ok(hostSecond.warCards.length >= 1);
    assert.match(hostSecond.warCards[0].yours.suit, /^[♠♥♦♣]$/);
    assert.deepEqual(hostSecond.warCards[0].yours, guestSecond.warCards[0].opponent);
  } else {
    assert.ok(hostSecond.yourCard);
    assert.ok(hostSecond.opponentCard);
    assert.deepEqual(hostSecond.yourCard, guestSecond.opponentCard);
    assert.deepEqual(hostSecond.opponentCard, guestSecond.yourCard);
    assert.match(hostSecond.yourCard.suit, /^[♠♥♦♣]$/);
  }

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

test("a war stays visible to both players until it resolves", async () => {
  const card = (rank, suit) => ({ rank, suit });
  // Host (seat A) flips 7S, guest 7D: a tie. Then the war flips are KS vs 5D.
  const deck = [
    card(7, "S"), card(2, "S"), card(3, "S"), card(4, "S"), card(13, "S"),
    ...Array.from({ length: 21 }, () => card(2, "C")),
    card(7, "D"), card(2, "D"), card(3, "D"), card(4, "D"), card(5, "D"),
    ...Array.from({ length: 21 }, () => card(3, "C"))
  ];
  const { host, guest } = await startRoom(undefined, {
    shuffle: (items) => (items.length === 52 ? deck : items.slice())
  });
  const flip = async (player) => {
    post(player, { type: "game_message", payload: { kind: "flip" } });
    return [(await host.next()).payload.view, (await guest.next()).payload.view];
  };

  await flip(host);
  const [hostTie, guestTie] = await flip(guest);
  assert.equal(hostTie.phase, "war");
  assert.equal(hostTie.inWar, true);
  assert.equal(hostTie.pile, 8);
  assert.equal(hostTie.yourCard, null);
  assert.deepEqual(hostTie.warCards, [
    { yours: { rank: 7, suit: "♠" }, opponent: { rank: 7, suit: "♦" } }
  ]);
  assert.deepEqual(guestTie.warCards, [
    { yours: { rank: 7, suit: "♦" }, opponent: { rank: 7, suit: "♠" } }
  ]);
  assert.deepEqual(hostTie.yourStakes[0], { faceUp: true, card: { rank: 7, suit: "♠" } });
  assert.equal(hostTie.yourStakes.filter((s) => !s.faceUp).length, 3);

  const [hostFlipped, guestWaiting] = await flip(host);
  assert.equal(hostFlipped.inWar, true);
  assert.equal(guestWaiting.inWar, true);
  assert.equal(guestWaiting.phase, "flipped");
  assert.equal(guestWaiting.warCards.length, 1);
  assert.deepEqual(hostFlipped.yourCard, { rank: 13, suit: "♠" });
  assert.equal(hostFlipped.opponentCard, null);
  assert.deepEqual(guestWaiting.opponentCard, { rank: 13, suit: "♠" });

  const [hostDone, guestDone] = await flip(guest);
  assert.equal(hostDone.phase, "roundOver");
  assert.equal(hostDone.inWar, false);
  assert.deepEqual(hostDone.warCards, []);
  assert.deepEqual(hostDone.lastRound, { wasWar: true, winner: "you", cardsWon: 10 });
  assert.deepEqual(guestDone.lastRound, { wasWar: true, winner: "opponent", cardsWon: 10 });
  assert.equal(hostDone.yourCount, 31);
  assert.equal(guestDone.opponentCount, 31);
  assert.equal(hostDone.yourStakes.length, 5);
  assert.ok(hostDone.yourStakes.every((s) => s.faceUp));
  assert.deepEqual(hostDone.yourStakes[0], { faceUp: true, card: { rank: 7, suit: "♠" } });
  assert.deepEqual(hostDone.yourStakes[4], { faceUp: true, card: { rank: 13, suit: "♠" } });

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

test("lists the available games", async () => {
  const { httpUrl } = await startServer();
  const response = await fetch(`${httpUrl}/api/games`);
  assert.equal(response.status, 200);
  const { games } = await response.json();
  assert.deepEqual(
    games.map((game) => game.id),
    ["uno", "war", "tictactoe"]
  );
  for (const game of games) {
    assert.equal(typeof game.name, "string");
    assert.equal(typeof game.description, "string");
  }
  assert.deepEqual(
    games.map(({ minPlayers, players }) => [minPlayers, players]),
    [[2, 4], [2, 2], [2, 2]]
  );
});

test("rejects a room for a game that doesn't exist", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  post(host, { type: "create_room", gameId: "chess" });
  assert.deepEqual(await host.next(), { type: "error", message: "That game doesn't exist." });
  host.close();
});

test("plays a chosen game: Tic-Tac-Toe to a win, recorded on both accounts", async () => {
  const { httpUrl, host, guest, hostState, guestState, hostAuth, guestAuth } = await startRoom(
    silentCommentator,
    {},
    "tictactoe"
  );
  assert.equal(hostState.view.yourMark, "X");
  assert.equal(hostState.view.yourTurn, true);
  assert.equal(guestState.view.yourMark, "O");
  assert.equal(guestState.view.yourTurn, false);

  post(guest, { type: "game_message", payload: { kind: "move", cell: 0 } });
  assert.deepEqual(await guest.next(), { type: "error", message: "It's not your turn." });

  const moves = [[host, 0], [guest, 3], [host, 1], [guest, 4], [host, 2]];
  let last;
  for (const [player, cell] of moves) {
    post(player, { type: "game_message", payload: { kind: "move", cell } });
    last = [(await host.next()).payload.view, (await guest.next()).payload.view];
  }
  assert.equal(last[0].result, "you");
  assert.equal(last[1].result, "opponent");
  assert.deepEqual(last[0].line, [0, 1, 2]);

  assert.deepEqual((await me(httpUrl, hostAuth.cookie)).body, { username: "host", wins: 1, losses: 0 });
  assert.deepEqual((await me(httpUrl, guestAuth.cookie)).body, { username: "guest", wins: 0, losses: 1 });
  host.close();
  guest.close();
});

test("tells the guest which game the room is for", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);
  post(host, { type: "create_room", gameId: "tictactoe" });
  const created = await host.next();
  assert.equal(created.gameId, "tictactoe");
  post(guest, { type: "join_room", roomCode: created.roomCode });
  assert.equal((await guest.next()).gameId, "tictactoe");
  host.close();
  guest.close();
});

// Logs in `names` and connects each one.
async function connectPlayers(names) {
  const { wsUrl, httpUrl } = await startServer();
  const players = [];
  for (const name of names) {
    const auth = await register(httpUrl, name);
    players.push(Object.assign(await connect(wsUrl, auth.cookie), { auth }));
  }
  return { httpUrl, players };
}

test("Uno rooms take 2–4 players and the host starts the game", async () => {
  const { players } = await connectPlayers(["host", "second", "third", "fourth"]);
  const [host, p2, p3, p4] = players;
  const roomPlayers = (names) => ({ type: "room_players", players: names, minPlayers: 2, maxPlayers: 4 });

  post(host, { type: "create_room", gameId: "uno" });
  const created = await host.next();
  assert.equal(created.gameId, "uno");
  assert.deepEqual(await host.next(), roomPlayers(["host"]));

  post(host, { type: "start_game" });
  assert.deepEqual(await host.next(), { type: "error", message: "Wait for at least 2 players." });

  for (const player of [p2, p3]) {
    post(player, { type: "join_room", roomCode: created.roomCode });
    assert.equal((await player.next()).type, "room_joined");
  }
  // host: p2 joined, list, p3 joined, list
  assert.equal((await host.next()).type, "opponent_joined");
  assert.deepEqual(await host.next(), roomPlayers(["host", "second"]));
  assert.equal((await host.next()).type, "opponent_joined");
  assert.deepEqual(await host.next(), roomPlayers(["host", "second", "third"]));
  assert.deepEqual(await p2.next(), roomPlayers(["host", "second"]));
  assert.equal((await p2.next()).type, "opponent_joined");
  assert.deepEqual(await p2.next(), roomPlayers(["host", "second", "third"]));
  assert.deepEqual(await p3.next(), roomPlayers(["host", "second", "third"]));

  post(p2, { type: "game_message", payload: { kind: "draw" } });
  assert.deepEqual(await p2.next(), { type: "error", message: "Wait for another player to join before playing." });
  post(p2, { type: "start_game" });
  assert.deepEqual(await p2.next(), { type: "error", message: "Only the host can start the game." });

  post(host, { type: "start_game" });
  const views = [];
  for (const player of [host, p2, p3]) views.push((await player.next()).payload.view);
  assert.deepEqual(views.map((view) => view.you), [0, 1, 2]);
  assert.deepEqual(views.map((view) => view.hand.length), [7, 7, 7]);
  assert.deepEqual(views[0].players.map((p) => p.name), ["host", "second", "third"]);
  assert.equal(views[0].yourTurn, true);
  assert.equal(views[1].yourTurn, false);

  post(p4, { type: "join_room", roomCode: created.roomCode });
  assert.deepEqual(await p4.next(), { type: "error", message: "That game has already started." });

  // Someone leaving ends the game; the rest go back to waiting.
  post(p3, { type: "leave_room" });
  assert.equal((await p3.next()).type, "room_left");
  assert.equal((await host.next()).type, "opponent_disconnected");
  assert.deepEqual(await host.next(), roomPlayers(["host", "second"]));
  for (const player of players) player.close();
});

test("plays a two-player Uno game to a win, recorded on both accounts", async () => {
  const { httpUrl, players } = await connectPlayers(["host", "guest"]);
  const [host, guest] = players;
  post(host, { type: "create_room", gameId: "uno" });
  const { roomCode } = await host.next();
  await host.next(); // room_players
  post(guest, { type: "join_room", roomCode });
  await guest.next(); // room_joined
  await guest.next(); // room_players
  await host.next(); // opponent_joined
  await host.next(); // room_players
  post(host, { type: "start_game" });
  let views = [(await host.next()).payload.view, (await guest.next()).payload.view];

  // Each turn: play the first playable card (wilds go red), otherwise draw.
  for (let moves = 0; views[0].winner === null; moves++) {
    assert.ok(moves < 5000, "the game should finish");
    const seat = views[0].turn;
    const view = views[seat];
    const cardId = view.playable[0];
    let payload;
    if (view.canCallUno) payload = { kind: "uno" };
    else if (cardId !== undefined) payload = { kind: "play", cardId, color: "red" };
    else if (view.drawn !== null) payload = { kind: "pass" };
    else payload = { kind: "draw" };
    post(players[seat], { type: "game_message", payload });
    views = [(await host.next()).payload.view, (await guest.next()).payload.view];
  }

  const winner = views[0].winner;
  assert.equal(views[winner].hand.length, 0);
  assert.equal(views[1 - winner].winnerName, ["host", "guest"][winner]);
  const stats = [await me(httpUrl, host.auth.cookie), await me(httpUrl, guest.auth.cookie)];
  assert.deepEqual(stats.map((s) => [s.body.wins, s.body.losses]), winner === 0 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]]);

  // The host can start a rematch once the game is over.
  post(host, { type: "start_game" });
  assert.equal((await host.next()).payload.view.hand.length, 7);
  host.close();
  guest.close();
});
