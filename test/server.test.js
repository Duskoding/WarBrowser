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
  assert.equal((await host.next()).type, "players_update");
  post(host, { type: "start_game" });
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
  assert.deepEqual(created.body, { username: "Ada", wins: 0, losses: 0, games: {} });
  assert.match(created.cookie, /^session=/);

  assert.equal((await me(httpUrl, created.cookie)).status, 200);
  assert.deepEqual((await me(httpUrl, created.cookie)).body, {
    username: "Ada",
    wins: 0,
    losses: 0,
    games: {}
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
    gameId: "war",
    host: "host",
    players: ["host", "guest"],
    min: 2,
    max: 2
  });
  assert.deepEqual(await host.next(), { type: "players_update", players: ["host", "guest"] });

  host.close();
  guest.close();
});

test("closes an idle room and returns connected players to the lobby", { timeout: 2000 }, async () => {
  const { wsUrl, httpUrl } = await startServer({ roomIdleTimeoutMs: 25 });
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);

  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  assert.equal((await guest.next()).type, "room_joined");
  assert.equal((await host.next()).type, "players_update");

  const [hostClosed, guestClosed] = await Promise.all([host.next(), guest.next()]);
  assert.deepEqual(hostClosed, { type: "room_closed", reason: "idle" });
  assert.deepEqual(guestClosed, { type: "room_closed", reason: "idle" });

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
  // A fixed deal (3♠ vs 2♦) so the first flip can't tie and start a war, which
  // would leave the round unresolved and this test waiting for commentary.
  const noTieFirst = (items) => [items[1], items[0], ...items.slice(2)];
  const { host, guest } = await startRoom(
    {
      describe: async (summary) => {
        summaries.push(summary);
        return "What a flip!";
      }
    },
    { shuffle: noTieFirst }
  );

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
  assert.deepEqual(await host.next(), { type: "player_left", username: "guest" });

  const newGuestAuth = await register(httpUrl, "guest2");
  const newGuest = await connect(wsUrl, newGuestAuth.cookie);
  post(newGuest, { type: "join_room", roomCode });
  assert.equal((await newGuest.next()).type, "room_joined");
  assert.deepEqual(await host.next(), { type: "players_update", players: ["host", "guest2"] });
  post(host, { type: "start_game" });
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
  post(host, { type: "start_game" });
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
    assert.deepEqual(hostMe.body, { username: "host", wins: 1, losses: 0, games: { war: { wins: 1, losses: 0 } } });
    assert.deepEqual(guestMe.body, { username: "guest", wins: 0, losses: 1, games: { war: { wins: 0, losses: 1 } } });
  } else if (view.winner === "opponent") {
    assert.deepEqual(hostMe.body, { username: "host", wins: 0, losses: 1, games: { war: { wins: 0, losses: 1 } } });
    assert.deepEqual(guestMe.body, { username: "guest", wins: 1, losses: 0, games: { war: { wins: 1, losses: 0 } } });
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
    ["war", "tictactoe", "uno", "crazy8", "gofish", "rps", "goofspiel", "connect4", "dots", "battleship", "nim"]
  );
  for (const game of games) {
    assert.equal(typeof game.name, "string");
    assert.equal(typeof game.description, "string");
    assert.equal(typeof game.players.min, "number");
    assert.equal(typeof game.players.max, "number");
  }
  assert.deepEqual(games.find((g) => g.id === "uno").players, { min: 2, max: 8 });
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

  assert.deepEqual((await me(httpUrl, hostAuth.cookie)).body, { username: "host", wins: 1, losses: 0, games: { tictactoe: { wins: 1, losses: 0 } } });
  assert.deepEqual((await me(httpUrl, guestAuth.cookie)).body, { username: "guest", wins: 0, losses: 1, games: { tictactoe: { wins: 0, losses: 1 } } });
  host.close();
  guest.close();
});

test("plays a chosen game: Uno to a win, recorded on both accounts", async () => {
  const identity = (items) => items.slice();
  const { httpUrl, host, guest, hostAuth, guestAuth } = await startRoom(
    silentCommentator,
    { shuffle: identity },
    "uno"
  );

  // With an unshuffled deck and 2 players, the host's dealt hand is seven
  // same-color number cards; always playing index 0 is legal every turn, and
  // the host (seat 0, 7 cards) empties first after 13 total plays.
  let seat = 0;
  let view;
  for (let i = 0; i < 13; i++) {
    const actor = seat === 0 ? host : guest;
    const other = seat === 0 ? guest : host;
    post(actor, { type: "game_message", payload: { kind: "play", cardIndex: 0 } });
    const a = (await actor.next()).payload.view;
    const b = (await other.next()).payload.view;
    view = seat === 0 ? a : b;
    seat = 1 - seat;
  }
  assert.equal(view.over, true);
  assert.equal(view.winnerSeat, 0);

  assert.deepEqual((await me(httpUrl, hostAuth.cookie)).body, { username: "host", wins: 1, losses: 0, games: { uno: { wins: 1, losses: 0 } } });
  assert.deepEqual((await me(httpUrl, guestAuth.cookie)).body, { username: "guest", wins: 0, losses: 1, games: { uno: { wins: 0, losses: 1 } } });
  host.close();
  guest.close();
});

test("records wins and losses for every player in a 3-player Uno game", async () => {
  const identity = (items) => items.slice();
  const { wsUrl, httpUrl } = await startServer({ engineOptions: { shuffle: identity } });
  const hostAuth = await register(httpUrl, "host3");
  const guestAuth = await register(httpUrl, "guest3a");
  const guest2Auth = await register(httpUrl, "guest3b");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  const guest2 = await connect(wsUrl, guest2Auth.cookie);

  post(host, { type: "create_room", gameId: "uno" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  await guest.next();
  await host.next();
  post(guest2, { type: "join_room", roomCode });
  await guest2.next();
  await guest.next();
  await host.next();
  post(host, { type: "start_game" });
  await host.next();
  await guest.next();
  await guest2.next();

  // With an unshuffled 3-player deal, always playing index 0 cycles through
  // every seat's plain number cards; the host (seat 0) empties first, 19
  // plays in.
  const players = [host, guest, guest2];
  let view;
  for (let i = 0; i < 19; i++) {
    const seat = i % 3;
    post(players[seat], { type: "game_message", payload: { kind: "play", cardIndex: 0 } });
    const views = [];
    for (const p of players) views.push((await p.next()).payload.view);
    view = views[0];
  }
  assert.equal(view.over, true);
  assert.equal(view.winnerSeat, 0);

  const hostMe = await me(httpUrl, hostAuth.cookie);
  const guestMe = await me(httpUrl, guestAuth.cookie);
  const guest2Me = await me(httpUrl, guest2Auth.cookie);
  assert.deepEqual(hostMe.body, { username: "host3", wins: 1, losses: 0, games: { uno: { wins: 1, losses: 0 } } });
  assert.deepEqual(guestMe.body, { username: "guest3a", wins: 0, losses: 1, games: { uno: { wins: 0, losses: 1 } } });
  assert.deepEqual(guest2Me.body, { username: "guest3b", wins: 0, losses: 1, games: { uno: { wins: 0, losses: 1 } } });

  host.close();
  guest.close();
  guest2.close();
});

test("a room does not start until the host sends start_game", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);
  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  assert.equal((await guest.next()).type, "room_joined");
  assert.equal((await host.next()).type, "players_update");

  post(guest, { type: "game_message", payload: { kind: "flip" } });
  assert.deepEqual(await guest.next(), {
    type: "error",
    message: "Wait for another player to join before playing."
  });

  host.close();
  guest.close();
});

test("rejects start_game from anyone but the host", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);
  post(host, { type: "create_room" });
  const { roomCode } = await host.next();
  post(guest, { type: "join_room", roomCode });
  await guest.next();
  await host.next();

  post(guest, { type: "start_game" });
  assert.deepEqual(await guest.next(), {
    type: "error",
    message: "Only the host can start the game."
  });

  host.close();
  guest.close();
});

test("rejects start_game below the game's minimum player count", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  post(host, { type: "create_room" });
  await host.next();

  post(host, { type: "start_game" });
  assert.deepEqual(await host.next(), {
    type: "error",
    message: "This game needs at least 2 players."
  });

  host.close();
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

test("plays Connect Four over the network to a win, recorded on both accounts", async () => {
  const { httpUrl, host, guest, hostState, hostAuth, guestAuth } = await startRoom(silentCommentator, {}, "connect4");
  assert.equal(hostState.view.yourTurn, true);
  const moves = [[host, 0], [guest, 1], [host, 0], [guest, 1], [host, 0], [guest, 1], [host, 0]];
  let last;
  for (const [player, column] of moves) {
    post(player, { type: "game_message", payload: { kind: "drop", column } });
    last = [(await host.next()).payload.view, (await guest.next()).payload.view];
  }
  assert.equal(last[0].result, "you");
  assert.equal(last[1].result, "opponent");
  assert.deepEqual((await me(httpUrl, hostAuth.cookie)).body, {
    username: "host",
    wins: 1,
    losses: 0,
    games: { connect4: { wins: 1, losses: 0 } },
  });
  assert.deepEqual((await me(httpUrl, guestAuth.cookie)).body, {
    username: "guest",
    wins: 0,
    losses: 1,
    games: { connect4: { wins: 0, losses: 1 } },
  });
  host.close();
  guest.close();
});

test("Rock-Paper-Scissors never sends a pick to the other player before both have picked", async () => {
  const { host, guest } = await startRoom(silentCommentator, {}, "rps");
  post(host, { type: "game_message", payload: { kind: "pick", choice: "scissors" } });
  const hostView = (await host.next()).payload.view;
  const guestMessage = await guest.next();
  assert.equal(hostView.yourChoice, "scissors");
  assert.equal(guestMessage.payload.view.opponentChoice, null);
  assert.ok(!JSON.stringify(guestMessage).includes("scissors"));

  post(guest, { type: "game_message", payload: { kind: "pick", choice: "rock" } });
  const revealed = (await guest.next()).payload.view;
  await host.next();
  assert.equal(revealed.yourChoice, "rock");
  assert.equal(revealed.opponentChoice, "scissors");
  host.close();
  guest.close();
});

test("Battleship never sends a player the opponent's fleet", async () => {
  const { host, guest, hostState, guestState } = await startRoom(silentCommentator, {}, "battleship");
  const hostCells = hostState.view.yourShips.flatMap((ship) => ship.cells);
  assert.equal(guestState.view.phase, "setup");
  assert.deepEqual(guestState.view.sunkEnemyShips, []);
  // The guest's message holds the guest's own ships and nothing else that lists cells.
  const guestShips = new Set(guestState.view.yourShips.flatMap((ship) => ship.cells));
  assert.ok(hostCells.some((cell) => !guestShips.has(cell)));
  assert.deepEqual(Object.keys(guestState.view.outgoing), []);
  host.close();
  guest.close();
});
