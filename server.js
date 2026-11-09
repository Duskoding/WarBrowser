import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { ClaudeCommentator, CommentaryLimiter, commentaryCallsPerMinuteFromEnv } from "./src/commentator.ts";
import { DEFAULT_GAME_ID, findGame, gameSummaries } from "./src/games/index.ts";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authenticateUser,
  createSession,
  deleteSession,
  findUserById,
  openAuthDatabase,
  recordWins,
  registerUser,
  userFromSession
} from "./src/auth.ts";
import { pool, initializePostgres } from "./src/db.ts";
import {
  createPostgresSession,
  deletePostgresSession,
  findPostgresUser,
  loginPostgres,
  recordPostgresMatch,
  registerPostgres,
  resetPostgresPassword,
  userFromPostgresSession
} from "./src/postgres-auth.ts";

const guiDirectory = new URL("./gui/dist/", import.meta.url);
const publicDirectory = new URL("./public/", import.meta.url);
const defaultDatabasePath = fileURLToPath(new URL("./data/warbrowser.sqlite", import.meta.url));
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxMessageBytes = 16 * 1024;
const maxJsonBytes = 8 * 1024;
const defaultRoomIdleTimeoutMs = 30 * 60 * 1000;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8"
};

// Serves the built GUI (gui/dist); falls back to the plain test page in public/.
function clientDirectory() {
  return existsSync(new URL("index.html", guiDirectory)) ? guiDirectory : publicDirectory;
}

function createRoomCode(rooms) {
  let roomCode;
  do {
    const bytes = randomBytes(6);
    roomCode = Array.from(
      bytes,
      (byte) => roomCodeAlphabet[byte % roomCodeAlphabet.length]
    ).join("");
  } while (rooms.has(roomCode));
  return roomCode;
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function cookieHeader(token, request, clear = false) {
  const forwarded = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const secure = proto === "https";
  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${clear ? 0 : SESSION_MAX_AGE_SECONDS}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function publicFields(user, includeReset = false) {
  const fields = {
    username: user.username,
    wins: user.wins,
    losses: user.losses,
    games: user.games
  };
  if (includeReset) fields.mustResetPassword = Boolean(user.mustResetPassword);
  return fields;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJsonBytes) {
      const error = new Error("too large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function userFromRequest(db, request, postgres = false) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  return { token, user: postgres ? await userFromPostgresSession(db, token) : userFromSession(db, token) };
}

// Each player gets their own view of the game after every change.
function sendStates(game) {
  const players = game.players.map((user) => ({ username: user.username }));
  for (const [socket, seat] of game.seats) {
    send(socket, {
      type: "game_message",
      payload: { kind: "state", view: game.module.toView(game.engine, seat, players) }
    });
  }
}

function openDatabase(databasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  return openAuthDatabase(databasePath);
}

export function createWarServer({
  commentator = new ClaudeCommentator(),
  database = ":memory:",
  engineOptions = {},
  roomIdleTimeoutMs = Number(process.env.ROOM_IDLE_TIMEOUT_MS ?? defaultRoomIdleTimeoutMs),
  commentaryLimits = {},
  reconnectGraceMs = 60 * 1000
} = {}) {
  const postgres = database === "postgres" || database === process.env.DATABASE_URL;
  const db = postgres ? pool : typeof database === "string" ? openDatabase(database) : database;
  const commentaryLimiter = new CommentaryLimiter(commentator, {
    callsPerMinute: commentaryLimits.callsPerMinute ?? commentaryCallsPerMinuteFromEnv(),
    ...commentaryLimits
  });
  // roomCode -> { game: GameModule, sockets: Set<WebSocket> }
  const rooms = new Map();
  // roomCode -> the running match once the room is full
  const games = new Map();
  const idleTimeout = Number.isFinite(roomIdleTimeoutMs) && roomIdleTimeoutMs > 0
    ? roomIdleTimeoutMs
    : defaultRoomIdleTimeoutMs;

  async function handleApi(request, response, pathname) {
    if (pathname === "/api/register" && request.method === "POST") {
      let body;
      try {
        body = await readJson(request);
      } catch (error) {
        const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
        sendJson(response, status, { error: "Send JSON with a username and password." });
        return;
      }
      const created = postgres
        ? await registerPostgres(db, body.username, body.password)
        : await registerUser(db, body.username, body.password);
      if ("error" in created) {
        sendJson(response, created.status, { error: created.error });
        return;
      }
      const token = postgres ? await createPostgresSession(db, created.id) : createSession(db, created.id);
      sendJson(response, 201, publicFields(created, postgres), {
        "Set-Cookie": cookieHeader(token, request)
      });
      return;
    }

    if (pathname === "/api/login" && request.method === "POST") {
      let body;
      try {
        body = await readJson(request);
      } catch (error) {
        const status = error.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
        sendJson(response, status, { error: "Send JSON with a username and password." });
        return;
      }
      const user = postgres
        ? await loginPostgres(db, body.username, body.password)
        : await authenticateUser(db, body.username, body.password);
      if ("error" in user) {
        sendJson(response, user.status, { error: user.error });
        return;
      }
      const token = postgres ? await createPostgresSession(db, user.id) : createSession(db, user.id);
      sendJson(response, 200, publicFields(user, postgres), {
        "Set-Cookie": cookieHeader(token, request)
      });
      return;
    }

    if (pathname === "/api/logout" && request.method === "POST") {
      const { token } = await userFromRequest(db, request, postgres);
      if (postgres) await deletePostgresSession(db, token); else deleteSession(db, token);
      sendJson(response, 200, { ok: true }, {
        "Set-Cookie": cookieHeader("", request, true)
      });
      return;
    }

    if (pathname === "/api/games" && request.method === "GET") {
      sendJson(response, 200, { games: gameSummaries() });
      return;
    }

    if (pathname === "/api/me" && request.method === "GET") {
      const { user } = await userFromRequest(db, request, postgres);
      if (!user) {
        sendJson(response, 401, { error: "Log in first." });
        return;
      }
      const fresh = postgres ? await findPostgresUser(db, user.id) : findUserById(db, user.id) ?? user;
      sendJson(response, 200, publicFields(fresh, postgres));
      return;
    }

    if (pathname === "/api/reset-password" && request.method === "POST") {
      const { user } = await userFromRequest(db, request, postgres);
      if (!user) {
        sendJson(response, 401, { error: "Log in first." });
        return;
      }
      let body;
      try { body = await readJson(request); } catch {
        sendJson(response, 400, { error: "Send JSON with a new password." });
        return;
      }
      if (!postgres) {
        sendJson(response, 501, { error: "Password reset is available after PostgreSQL migration." });
        return;
      }
      const failure = await resetPostgresPassword(db, user.id, body.password);
      if (failure) { sendJson(response, failure.status, { error: failure.error }); return; }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname.startsWith("/api/")) {
      const status = ["GET", "POST"].includes(request.method) ? 404 : 405;
      sendJson(response, status, { error: status === 405 ? "Method not allowed." : "Not found" });
      return;
    }
  }

  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      try {
        await handleApi(request, response, pathname);
      } catch (error) {
        if (!response.headersSent) {
          sendJson(response, 500, { error: "Unable to handle that request." });
        }
        console.error("Auth request failed:", error);
      }
      return;
    }

    const root = clientDirectory();
    const target = new URL(`.${pathname === "/" ? "/index.html" : pathname}`, root);
    const contentType = contentTypes[extname(target.pathname)];

    if (!contentType || request.method !== "GET" || !target.href.startsWith(root.href)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const contents = await readFile(target);
      response.writeHead(200, {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff"
      });
      response.end(contents);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load the game client");
      console.error("Failed to load a static file:", error);
    }
  });
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: maxMessageBytes
  });

  function clearRoomIdleTimer(room) {
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
      room.idleTimer = undefined;
    }
  }

  function scheduleRoomIdleTimeout(roomCode, room) {
    clearRoomIdleTimer(room);
    room.idleTimer = setTimeout(() => {
      const current = rooms.get(roomCode);
      if (current !== room) return;

      const now = Date.now();
      if (room.reconnectGraceUntil > now) {
        scheduleRoomIdleTimeout(roomCode, room);
        return;
      }
      if (now - room.lastMessageAt < idleTimeout) {
        scheduleRoomIdleTimeout(roomCode, room);
        return;
      }

      for (const player of room.sockets) {
        player.roomCode = undefined;
        send(player, { type: "room_closed", reason: "idle" });
      }
      games.delete(roomCode);
      rooms.delete(roomCode);
      clearRoomIdleTimer(room);
    }, Math.max(1, room.lastMessageAt + idleTimeout - Date.now()));
  }

  function markRoomActive(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.lastMessageAt = Date.now();
    scheduleRoomIdleTimeout(roomCode, room);
  }

  function createGame(roomCode, room) {
    const byId = new Map([...room.sockets].map((player) => [player.user.id, player]));
    const seated = room.order.map((id) => byId.get(id)).filter((player) => player);
    const context = {
      commentator: commentaryLimiter.forRoom(roomCode),
      options: engineOptions,
      players: seated.length
    };
    const game = {
      module: room.game,
      engine: room.game.createEngine(context),
      context,
      seats: new Map(seated.map((player, seat) => [player, seat])),
      players: seated.map((player) => player.user),
      recorded: false
    };
    games.set(roomCode, game);
    return game;
  }

  function rosterNames(room) {
    const names = new Map();
    for (const player of room.sockets) names.set(player.user.id, player.user.username);
    for (const entry of room.reserved.values()) names.set(entry.user.id, entry.user.username);
    return room.order.map((id) => names.get(id)).filter((name) => name);
  }

  function hostSocket(room) {
    const names = new Map([...room.sockets].map((player) => [player.user.id, player]));
    for (const id of room.order) {
      const player = names.get(id);
      if (player) return player;
    }
    return undefined;
  }

  function refreshGrace(room) {
    let until = 0;
    for (const entry of room.reserved.values()) until = Math.max(until, entry.expiresAt);
    room.reconnectGraceUntil = until;
  }

  function clearReservations(room) {
    for (const entry of room.reserved.values()) clearTimeout(entry.timer);
    room.reserved.clear();
    room.reconnectGraceUntil = 0;
  }

  // A leave, or a grace period that ran out, discards the match and keeps the room if someone is still connected.
  function depart(room, roomCode, username) {
    games.delete(roomCode);
    room.started = false;
    clearReservations(room);
    const connected = new Set([...room.sockets].map((player) => player.user.id));
    room.order = room.order.filter((id) => connected.has(id));
    for (const player of room.sockets) {
      if (username) send(player, { type: "player_left", username });
    }
    if (room.sockets.size === 0) {
      clearRoomIdleTimer(room);
      rooms.delete(roomCode);
    } else {
      room.lastMessageAt = Date.now();
      scheduleRoomIdleTimeout(roomCode, room);
    }
  }

  function leaveRoom(socket) {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    socket.roomCode = undefined;
    if (!room) return;

    const game = games.get(roomCode);
    if (game) game.seats.delete(socket);
    room.sockets.delete(socket);
    if (socket.user) {
      const held = room.reserved.get(socket.user.id);
      if (held) clearTimeout(held.timer);
      room.reserved.delete(socket.user.id);
      room.order = room.order.filter((id) => id !== socket.user.id);
    }
    depart(room, roomCode, socket.user?.username);
  }

  function expireReservation(roomCode, userId) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const held = room.reserved.get(userId);
    if (!held) return;
    clearTimeout(held.timer);
    room.reserved.delete(userId);
    depart(room, roomCode, held.user.username);
  }

  // A dropped socket keeps its place for reconnectGraceMs. An explicit leave does not come through here.
  function holdSeat(socket) {
    const roomCode = socket.roomCode;
    if (!roomCode || !socket.user) return;
    const room = rooms.get(roomCode);
    socket.roomCode = undefined;
    if (!room || !room.sockets.has(socket)) return;

    const game = games.get(roomCode);
    const seat = game && game.seats.has(socket) ? game.seats.get(socket) : null;
    if (game) game.seats.delete(socket);
    room.sockets.delete(socket);

    const previous = room.reserved.get(socket.user.id);
    if (previous) clearTimeout(previous.timer);
    const expiresAt = Date.now() + reconnectGraceMs;
    const timer = setTimeout(() => expireReservation(roomCode, socket.user.id), reconnectGraceMs);
    timer.unref();
    room.reserved.set(socket.user.id, { user: socket.user, seat, timer, expiresAt });
    refreshGrace(room);
    for (const player of room.sockets) {
      send(player, { type: "player_reconnecting", username: socket.user.username });
    }
  }

  function abandonOtherRooms(userId, exceptRoomCode) {
    for (const [code, room] of [...rooms]) {
      if (code === exceptRoomCode) continue;
      for (const player of [...room.sockets]) {
        if (player.user?.id === userId) leaveRoom(player);
      }
      const current = rooms.get(code);
      if (!current) continue;
      const held = current.reserved.get(userId);
      if (!held) continue;
      clearTimeout(held.timer);
      current.reserved.delete(userId);
      depart(current, code, held.user.username);
    }
  }

  function roomSummary(room, roomCode) {
    const players = rosterNames(room);
    return {
      roomCode,
      gameId: room.game.id,
      host: players[0],
      players,
      min: room.game.players.min,
      max: room.game.players.max
    };
  }

  function tellReconnecting(socket, room) {
    for (const entry of room.reserved.values()) {
      send(socket, { type: "player_reconnecting", username: entry.user.username });
    }
  }

  function restoreSeat(socket, room, roomCode, held) {
    clearTimeout(held.timer);
    room.reserved.delete(socket.user.id);
    room.sockets.add(socket);
    socket.roomCode = roomCode;
    refreshGrace(room);
    const game = games.get(roomCode);
    if (game && held.seat !== null && held.seat !== undefined) {
      game.seats.set(socket, held.seat);
    }
    markRoomActive(roomCode);
    send(socket, { type: "room_joined", ...roomSummary(room, roomCode) });
    for (const player of room.sockets) {
      if (player !== socket) send(player, { type: "player_reconnected", username: socket.user.username });
    }
    tellReconnecting(socket, room);
    if (game) sendStates(game);
  }

  function requireUser(socket) {
    if (socket.user) return true;
    send(socket, { type: "error", message: "Log in before creating or joining a room." });
    return false;
  }

  function requireCurrentPassword(socket) {
    if (requireUser(socket) && !socket.user.mustResetPassword) return true;
    if (socket.user?.mustResetPassword) {
      send(socket, { type: "error", message: "Reset your password before playing." });
    }
    return false;
  }

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      userFromRequest(db, request, postgres).then(({ user }) => {
        websocket.user = user;
        websocketServer.emit("connection", websocket, request);
      }).catch(() => websocket.destroy());
    });
  });

  websocketServer.on("connection", (socket) => {
    socket.on("message", (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        send(socket, { type: "error", message: "Message must be valid JSON." });
        return;
      }

      if (!message || typeof message !== "object" || Array.isArray(message)) {
        send(socket, { type: "error", message: "Message must be a JSON object." });
        return;
      }

      if (message.type === "create_room") {
        if (!requireCurrentPassword(socket)) return;
        if (socket.roomCode) {
          send(socket, { type: "error", message: "Leave your current room first." });
          return;
        }

        const definition = findGame(message.gameId ?? DEFAULT_GAME_ID);
        if (!definition) {
          send(socket, { type: "error", message: "That game doesn't exist." });
          return;
        }

        abandonOtherRooms(socket.user.id);
        const roomCode = createRoomCode(rooms);
        const room = {
          game: definition,
          sockets: new Set([socket]),
          reserved: new Map(),
          order: [socket.user.id],
          started: false,
          lastMessageAt: Date.now(),
          reconnectGraceUntil: 0,
          idleTimer: undefined
        };
        rooms.set(roomCode, room);
        scheduleRoomIdleTimeout(roomCode, room);
        socket.roomCode = roomCode;
        send(socket, {
          type: "room_created",
          roomCode,
          gameId: definition.id,
          host: socket.user.username,
          players: [socket.user.username],
          min: definition.players.min,
          max: definition.players.max
        });
        return;
      }

      if (message.type === "join_room") {
        if (!requireCurrentPassword(socket)) return;
        if (socket.roomCode) {
          send(socket, { type: "error", message: "Leave your current room first." });
          return;
        }
        if (typeof message.roomCode !== "string") {
          send(socket, { type: "error", message: "Enter a valid room code." });
          return;
        }

        const roomCode = message.roomCode.trim().toUpperCase();
        const room = rooms.get(roomCode);
        if (!room) {
          send(socket, { type: "error", message: "Room not found." });
          return;
        }
        abandonOtherRooms(socket.user.id, roomCode);

        for (const player of room.sockets) {
          if (player.user?.id === socket.user.id) {
            send(socket, { type: "error", message: "You are already in this room." });
            return;
          }
        }

        const held = room.reserved.get(socket.user.id);
        if (held) {
          restoreSeat(socket, room, roomCode, held);
          return;
        }
        if (room.sockets.size + room.reserved.size >= room.game.players.max) {
          send(socket, { type: "error", message: "That room is full." });
          return;
        }
        if (room.started) {
          send(socket, { type: "error", message: "That game has already started." });
          return;
        }

        room.sockets.add(socket);
        socket.roomCode = roomCode;
        if (!room.order.includes(socket.user.id)) room.order.push(socket.user.id);
        markRoomActive(roomCode);
        send(socket, { type: "room_joined", ...roomSummary(room, roomCode) });
        for (const player of room.sockets) {
          if (player !== socket) {
            send(player, { type: "players_update", players: rosterNames(room) });
          }
        }
        tellReconnecting(socket, room);
        return;
      }

      if (message.type === "start_game") {
        const room = rooms.get(socket.roomCode);
        if (!room) {
          send(socket, { type: "error", message: "Join a room first." });
          return;
        }
        if (room.reserved.size > 0) {
          send(socket, { type: "error", message: "A player is reconnecting." });
          return;
        }
        const host = hostSocket(room);
        if (host !== socket) {
          send(socket, { type: "error", message: "Only the host can start the game." });
          return;
        }
        if (room.started) {
          send(socket, { type: "error", message: "That game has already started." });
          return;
        }
        if (room.sockets.size < room.game.players.min) {
          send(socket, {
            type: "error",
            message: `This game needs at least ${room.game.players.min} players.`
          });
          return;
        }

        markRoomActive(socket.roomCode);
        room.started = true;
        // Room is starting: seats follow join order (the host is seat 0).
        const game = createGame(socket.roomCode, room);
        sendStates(game);
        return;
      }

      if (message.type === "restart_game") {
        const room = rooms.get(socket.roomCode);
        const game = games.get(socket.roomCode);
        if (!room || !game) {
          send(socket, { type: "error", message: "There is no finished game to replay." });
          return;
        }
        if (room.reserved.size > 0) {
          send(socket, { type: "error", message: "A player is reconnecting." });
          return;
        }
        if (!game.recorded) {
          send(socket, { type: "error", message: "Finish the current game before playing again." });
          return;
        }
        markRoomActive(socket.roomCode);
        sendStates(createGame(socket.roomCode, room));
        return;
      }

      if (message.type === "game_message") {
        const room = rooms.get(socket.roomCode);
        const game = games.get(socket.roomCode);
        if (room?.reserved.size > 0) {
          send(socket, { type: "error", message: "A player is reconnecting." });
          return;
        }
        if (!room || !game) {
          send(socket, {
            type: "error",
            message: "Wait for another player to join before playing."
          });
          return;
        }
        if (!Object.hasOwn(message, "payload")) {
          send(socket, { type: "error", message: "Game message needs a payload." });
          return;
        }

        markRoomActive(socket.roomCode);
        const payload = message.payload;
        const kind = payload?.kind;
        if (kind === "state" || kind === "commentary") {
          send(socket, { type: "error", message: "Only the server can send that." });
          return;
        }

        // The game module handles its own actions; anything it doesn't recognise
        // (result null) is relayed to the other players below.
        const isObject = payload !== null && typeof payload === "object" && !Array.isArray(payload);
        const result = isObject
          ? game.module.handleAction(game.engine, game.seats.get(socket), payload, game.context)
          : null;
        if (result) {
          if (!result.ok) {
            send(socket, { type: "error", message: result.error });
            return;
          }
          sendStates(game);
          if (result.finished && !game.recorded) {
            game.recorded = true;
            const { winner } = result.finished;
            if (postgres) {
              const playerIds = game.players.map((player) => player.id);
              void recordPostgresMatch(
                db,
                socket.roomCode,
                playerIds,
                winner === null ? null : playerIds[winner],
                game.module.id
              ).catch((error) => console.error("Failed to record match:", error));
            } else if (winner !== null) {
              const winnerId = game.players[winner].id;
              const loserIds = game.players
                .filter((_, seat) => seat !== winner)
                .map((player) => player.id);
              recordWins(db, winnerId, loserIds, game.module.id);
            }
          }
          if (result.commentary) {
            const { round } = result.commentary;
            const roomCode = socket.roomCode;
            void Promise.resolve(result.commentary.text)
              .catch(() => null)
              .then((text) => {
                if (!text || games.get(roomCode) !== game) return;
                for (const player of game.seats.keys()) {
                  send(player, { type: "game_message", payload: { kind: "commentary", text, round } });
                }
              });
          }
          return;
        }

        for (const player of room.sockets) {
          if (player !== socket) {
            send(player, { type: "game_message", payload: message.payload });
          }
        }
        return;
      }

      if (message.type === "leave_room") {
        if (!socket.roomCode && typeof message.roomCode === "string" && socket.user) {
          const code = message.roomCode.trim().toUpperCase();
          const room = rooms.get(code);
          const held = room?.reserved.get(socket.user.id);
          if (room && held) {
            clearTimeout(held.timer);
            room.reserved.delete(socket.user.id);
            depart(room, code, held.user.username);
          }
        } else {
          leaveRoom(socket);
        }
        send(socket, { type: "room_left" });
        return;
      }

      send(socket, { type: "error", message: "Unknown message type." });
    });

    socket.on("close", () => holdSeat(socket));
  });

  httpServer.on("close", () => {
    for (const room of rooms.values()) {
      clearRoomIdleTimer(room);
      clearReservations(room);
    }
    try {
      if (postgres) void db.end(); else db.close();
    } catch {
      // Already closed by tests that shut the process down quickly.
    }
  });

  return { httpServer, websocketServer };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const database = process.env.DATABASE_URL ? "postgres" : process.env.DATABASE_PATH ?? defaultDatabasePath;
  if (database === "postgres") await initializePostgres(pool);
  const { httpServer } = createWarServer({ database });
  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`WarBrowser is listening on port ${port}`);
  });
}
