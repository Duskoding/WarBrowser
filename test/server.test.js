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

async function startRoom(commentator = silentCommentator, engineOptions = {}) {
  const { wsUrl, httpUrl } = await startServer({ commentator, engineOptions });
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
    opponentUsername: "host",
    game: "war"
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

// ---- Poker ----

const pokerRanks = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
const pokerCard = (text) => ({ rank: pokerRanks[text[0]] ?? Number(text[0]), suit: text[1] });

// A shuffle that deals the engine's deal order: A's two, B's two, burn, flop, burn, turn, burn, river.
function riggedPokerShuffle({ a, b, board }) {
  return (items) => {
    const picks = [...a.split(" "), ...b.split(" "), ...board.split(" ")].map(pokerCard);
    const key = (card) => `${card.rank}${card.suit}`;
    const used = new Set(picks.map(key));
    const spare = items.filter((card) => !used.has(key(card)));
    const [a1, a2, b1, b2, f1, f2, f3, turn, river] = picks;
    return [a1, a2, b1, b2, spare.shift(), f1, f2, f3, spare.shift(), turn, spare.shift(), river, ...spare];
  };
}

async function startPokerRoom(engineOptions = {}) {
  const { wsUrl, httpUrl } = await startServer({ engineOptions });
  const hostAuth = await register(httpUrl, "host");
  const guestAuth = await register(httpUrl, "guest");
  const host = await connect(wsUrl, hostAuth.cookie);
  const guest = await connect(wsUrl, guestAuth.cookie);
  post(host, { type: "create_room", game: "poker" });
  const created = await host.next();
  post(guest, { type: "join_room", roomCode: created.roomCode });
  const joined = await guest.next();
  assert.equal((await host.next()).type, "opponent_joined");
  const hostView = (await host.next()).payload.view;
  const guestView = (await guest.next()).payload.view;
  return { httpUrl, host, guest, created, joined, hostView, guestView, hostAuth, guestAuth };
}

const pokerAct = (socket, action) =>
  post(socket, { type: "game_message", payload: { kind: "action", action } });

test("creates a poker room and deals each player only their own cards", async () => {
  const { host, guest, created, joined, hostView, guestView } = await startPokerRoom();
  assert.equal(created.game, "poker");
  assert.equal(joined.game, "poker");
  for (const view of [hostView, guestView]) {
    assert.equal(view.phase, "preflop");
    assert.equal(view.handNumber, 1);
    assert.equal(view.yourCards.length, 2);
    assert.equal(view.opponentCards, null);
    assert.deepEqual(view.board, []);
    assert.equal(view.pot, 0);
    assert.equal(view.lastAction.type, "bigBlind");
  }
  assert.notDeepEqual(hostView.yourCards, guestView.yourCards);
  assert.match(hostView.yourCards[0].suit, /^[♠♥♦♣]$/);
  // Seat A (host) is the button on hand 1: small blind 10, acts first.
  assert.equal(hostView.youAreButton, true);
  assert.equal(hostView.yourTurn, true);
  assert.equal(guestView.yourTurn, false);
  assert.equal(hostView.yourCommitted, 10);
  assert.equal(hostView.opponentCommitted, 20);
  assert.equal(hostView.lastAction.who, "opponent");
  assert.ok(hostView.legal);
  assert.equal(guestView.legal, null);
  host.close();
  guest.close();
});

test("rejects unknown games and leaves War rooms working with no game field", async () => {
  const { wsUrl, httpUrl } = await startServer();
  const host = await connect(wsUrl, (await register(httpUrl, "host")).cookie);
  post(host, { type: "create_room", game: "chess" });
  assert.deepEqual(await host.next(), { type: "error", message: "Unknown game." });
  post(host, { type: "create_room" });
  const created = await host.next();
  assert.equal(created.game, "war");

  const guest = await connect(wsUrl, (await register(httpUrl, "guest")).cookie);
  post(guest, { type: "join_room", roomCode: created.roomCode });
  assert.equal((await guest.next()).game, "war");
  await host.next();
  assert.equal((await host.next()).payload.kind, "state");
  assert.equal((await guest.next()).payload.kind, "state");

  pokerAct(host, { type: "fold" });
  assert.deepEqual(await host.next(), {
    type: "error",
    message: "That move isn't part of this game."
  });
  host.close();
  guest.close();
});

test("poker rejects out-of-turn actions, flip, and client-sent poker_state", async () => {
  const { host, guest } = await startPokerRoom();
  pokerAct(guest, { type: "call" });
  const outOfTurn = await guest.next();
  assert.equal(outOfTurn.type, "error");
  assert.equal(outOfTurn.message, "It's not your turn.");

  post(host, { type: "game_message", payload: { kind: "flip" } });
  assert.deepEqual(await host.next(), {
    type: "error",
    message: "That move isn't part of this game."
  });

  post(host, { type: "game_message", payload: { kind: "poker_state", view: {} } });
  assert.equal((await host.next()).type, "error");
  host.close();
  guest.close();
});

test("a poker fold ends the hand and next_hand from both deals hand 2", async () => {
  const { host, guest } = await startPokerRoom();
  pokerAct(host, { type: "fold" });
  const hostView = (await host.next()).payload.view;
  const guestView = (await guest.next()).payload.view;
  assert.equal(hostView.phase, "handOver");
  assert.equal(hostView.result.reason, "fold");
  assert.deepEqual(hostView.result.winners, ["opponent"]);
  assert.equal(hostView.result.youWon, 0);
  assert.equal(hostView.result.opponentWon, 30);
  assert.deepEqual(guestView.result.winners, ["you"]);
  assert.equal(guestView.yourStack, 1010);
  assert.equal(hostView.yourStack, 990);

  post(host, { type: "game_message", payload: { kind: "next_hand" } });
  const waiting = (await host.next()).payload.view;
  await guest.next();
  assert.equal(waiting.phase, "handOver");
  assert.equal(waiting.youReady, true);
  assert.equal(waiting.opponentReady, false);

  post(guest, { type: "game_message", payload: { kind: "next_hand" } });
  const next = (await host.next()).payload.view;
  const nextGuest = (await guest.next()).payload.view;
  assert.equal(next.phase, "preflop");
  assert.equal(next.handNumber, 2);
  assert.equal(next.youAreButton, false);
  assert.equal(nextGuest.youAreButton, true);
  assert.equal(nextGuest.yourTurn, true);
  host.close();
  guest.close();
});

test("a poker hand can be played by calling down to a showdown", async () => {
  const shuffle = riggedPokerShuffle({
    a: "AS AH",
    b: "2C 7D",
    board: "KD 9C 4H 5S JD"
  });
  const { host, guest } = await startPokerRoom({ poker: { shuffle } });
  pokerAct(host, { type: "call" }); // button completes the small blind
  await host.next();
  await guest.next();
  pokerAct(guest, { type: "check" });
  let view = (await guest.next()).payload.view;
  await host.next();
  assert.equal(view.phase, "flop");
  assert.equal(view.board.length, 3);
  for (const phase of ["turn", "river"]) {
    pokerAct(guest, { type: "check" });
    await guest.next();
    await host.next();
    pokerAct(host, { type: "check" });
    view = (await guest.next()).payload.view;
    await host.next();
    assert.equal(view.phase, phase);
  }
  pokerAct(guest, { type: "check" });
  await guest.next();
  await host.next();
  pokerAct(host, { type: "check" });
  view = (await guest.next()).payload.view;
  const hostView = (await host.next()).payload.view;
  assert.equal(view.phase, "handOver");
  assert.equal(view.result.reason, "showdown");
  assert.equal(view.board.length, 5);
  assert.deepEqual(view.opponentCards, hostView.yourCards);
  assert.deepEqual(hostView.result.winners, ["you"]);
  assert.equal(hostView.result.youWon, 40);
  assert.equal(hostView.result.yourHand, "Pair of Aces");
  assert.equal(hostView.yourStack, 1020);
  host.close();
  guest.close();
});

test("an all-in poker game records a win and a loss exactly once", async () => {
  const shuffle = riggedPokerShuffle({
    a: "AS AH",
    b: "2C 7D",
    board: "KD 9C 4H 5S JD"
  });
  const { host, guest, httpUrl, hostAuth, guestAuth } = await startPokerRoom({
    poker: { shuffle }
  });
  pokerAct(host, { type: "raise", to: 1000 });
  await host.next();
  await guest.next();
  pokerAct(guest, { type: "call" });
  const hostView = (await host.next()).payload.view;
  const guestView = (await guest.next()).payload.view;
  assert.equal(hostView.phase, "gameOver");
  assert.equal(hostView.winner, "you");
  assert.equal(guestView.winner, "opponent");
  assert.equal(hostView.yourStack, 2000);
  assert.equal(guestView.yourStack, 0);

  assert.deepEqual((await me(httpUrl, hostAuth.cookie)).body, {
    username: "host",
    wins: 1,
    losses: 0
  });
  assert.deepEqual((await me(httpUrl, guestAuth.cookie)).body, {
    username: "guest",
    wins: 0,
    losses: 1
  });

  post(host, { type: "game_message", payload: { kind: "next_hand" } });
  assert.equal((await host.next()).type, "error");
  assert.equal((await me(httpUrl, hostAuth.cookie)).body.wins, 1);
  host.close();
  guest.close();
});
