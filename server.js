import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { ClaudeCommentator } from "./src/commentator.ts";
import { DEFAULT_GAME_ID, findGame, gameSummaries } from "./src/games/index.ts";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  authenticateUser,
  createSession,
  deleteSession,
  findUserById,
  openAuthDatabase,
  recordMatch,
  registerUser,
  userFromSession
} from "./src/auth.ts";

const guiDirectory = new URL("./gui/dist/", import.meta.url);
const publicDirectory = new URL("./public/", import.meta.url);
const defaultDatabasePath = fileURLToPath(new URL("./data/warbrowser.sqlite", import.meta.url));
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxMessageBytes = 16 * 1024;
const maxJsonBytes = 8 * 1024;
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

function publicFields(user) {
  return { username: user.username, wins: user.wins, losses: user.losses };
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

function userFromRequest(db, request) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  return { token, user: userFromSession(db, token) };
}

// Each player gets their own view of the game after every change.
function sendStates(game) {
  const players = game.players.map((user) => ({ username: user.username }));
  for (const [socket, seat] of game.seats) {
    send(socket, {
      type: "game_message",
      payload: { kind: "state", view: game.session.view(seat, players) }
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
  engineOptions = {}
} = {}) {
  const db = typeof database === "string" ? openDatabase(database) : database;
  // roomCode -> { game: GameDefinition, sockets: Set<WebSocket> }
  const rooms = new Map();
  // roomCode -> the game being played once the room is full
  const games = new Map();

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
      const created = await registerUser(db, body.username, body.password);
      if ("error" in created) {
        sendJson(response, created.status, { error: created.error });
        return;
      }
      const token = createSession(db, created.id);
      sendJson(response, 201, publicFields(created), {
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
      const user = await authenticateUser(db, body.username, body.password);
      if ("error" in user) {
        sendJson(response, user.status, { error: user.error });
        return;
      }
      const token = createSession(db, user.id);
      sendJson(response, 200, publicFields(user), {
        "Set-Cookie": cookieHeader(token, request)
      });
      return;
    }

    if (pathname === "/api/logout" && request.method === "POST") {
      const { token } = userFromRequest(db, request);
      deleteSession(db, token);
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
      const { user } = userFromRequest(db, request);
      if (!user) {
        sendJson(response, 401, { error: "Log in first." });
        return;
      }
      const fresh = findUserById(db, user.id) ?? user;
      sendJson(response, 200, publicFields(fresh));
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

  function leaveRoom(socket) {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    socket.roomCode = undefined;
    if (!room) return;

    room.sockets.delete(socket);
    games.delete(roomCode);
    for (const player of room.sockets) {
      send(player, { type: "opponent_disconnected" });
    }
    if (room.sockets.size === 0) {
      rooms.delete(roomCode);
    }
  }

  function requireUser(socket) {
    if (socket.user) return true;
    send(socket, { type: "error", message: "Log in before creating or joining a room." });
    return false;
  }

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocket.user = userFromRequest(db, request).user;
      websocketServer.emit("connection", websocket, request);
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
        if (!requireUser(socket)) return;
        if (socket.roomCode) {
          send(socket, { type: "error", message: "Leave your current room first." });
          return;
        }

        const definition = findGame(message.gameId ?? DEFAULT_GAME_ID);
        if (!definition) {
          send(socket, { type: "error", message: "That game doesn't exist." });
          return;
        }

        const roomCode = createRoomCode(rooms);
        rooms.set(roomCode, { game: definition, sockets: new Set([socket]) });
        socket.roomCode = roomCode;
        send(socket, {
          type: "room_created",
          roomCode,
          username: socket.user.username,
          gameId: definition.id
        });
        return;
      }

      if (message.type === "join_room") {
        if (!requireUser(socket)) return;
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
        if (room.sockets.size >= room.game.players) {
          send(socket, { type: "error", message: "That room is full." });
          return;
        }
        for (const player of room.sockets) {
          if (player.user?.id === socket.user.id) {
            send(socket, { type: "error", message: "You are already in this room." });
            return;
          }
        }

        room.sockets.add(socket);
        socket.roomCode = roomCode;
        const [host] = room.sockets;
        send(socket, {
          type: "room_joined",
          roomCode,
          username: socket.user.username,
          opponentUsername: host.user.username,
          gameId: room.game.id
        });
        for (const player of room.sockets) {
          if (player !== socket) {
            send(player, { type: "opponent_joined", username: socket.user.username });
          }
        }

        if (room.sockets.size < room.game.players) return;
        // Room is full: seats follow join order (the host is seat 0).
        const seated = [...room.sockets];
        const game = {
          session: room.game.create({ commentator, options: engineOptions }),
          seats: new Map(seated.map((player, seat) => [player, seat])),
          players: seated.map((player) => player.user),
          recorded: false
        };
        games.set(roomCode, game);
        sendStates(game);
        return;
      }

      if (message.type === "game_message") {
        const room = rooms.get(socket.roomCode);
        const game = games.get(socket.roomCode);
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

        const payload = message.payload;
        const kind = payload?.kind;
        if (kind === "state" || kind === "commentary") {
          send(socket, { type: "error", message: "Only the server can send that." });
          return;
        }

        // The game handles its own actions; anything it doesn't recognise
        // (result null) is relayed to the other players below.
        const isObject = payload !== null && typeof payload === "object" && !Array.isArray(payload);
        const result = isObject ? game.session.act(game.seats.get(socket), payload) : null;
        if (result) {
          if (!result.ok) {
            send(socket, { type: "error", message: result.error });
            return;
          }
          sendStates(game);
          if (result.finished && !game.recorded) {
            game.recorded = true;
            const { winner } = result.finished;
            if (winner !== null) {
              for (const [seat, user] of game.players.entries()) {
                if (seat !== winner) recordMatch(db, game.players[winner].id, user.id);
              }
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
        leaveRoom(socket);
        send(socket, { type: "room_left" });
        return;
      }

      send(socket, { type: "error", message: "Unknown message type." });
    });

    socket.on("close", () => leaveRoom(socket));
  });

  httpServer.on("close", () => {
    try {
      db.close();
    } catch {
      // Already closed by tests that shut the process down quickly.
    }
  });

  return { httpServer, websocketServer };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const database = process.env.DATABASE_PATH ?? defaultDatabasePath;
  const { httpServer } = createWarServer({ database });
  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`WarBrowser is listening on port ${port}`);
  });
}
