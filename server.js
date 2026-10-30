import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { WarEngine } from "./src/engine/WarEngine.ts";
import { ClaudeCommentator } from "./src/commentator.ts";
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

const suitSymbols = { S: "♠", H: "♥", D: "♦", C: "♣" };

function toViewCard(card) {
  return card && { rank: card.rank, suit: suitSymbols[card.suit] };
}

function toView(state, seat, names) {
  const mine = seat === "A";
  const winner = state.winner === null ? undefined : state.winner === seat ? "you" : "opponent";
  const opponentSeat = seat === "A" ? "B" : "A";
  return {
    yourCard: toViewCard(state.yourCard),
    opponentCard: toViewCard(state.opponentCard),
    pile: state.pile,
    yourCount: mine ? state.scoreA : state.scoreB,
    opponentCount: mine ? state.scoreB : state.scoreA,
    phase: state.phase,
    winner,
    yourName: names[seat],
    opponentName: names[opponentSeat]
  };
}

function sendStates(game) {
  const names = {
    A: game.players.A.username,
    B: game.players.B.username
  };
  for (const [socket, seat] of game.seats) {
    send(socket, {
      type: "game_message",
      payload: { kind: "state", view: toView(game.engine.getState(seat), seat, names) }
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
  const rooms = new Map();
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

    room.delete(socket);
    games.delete(roomCode);
    for (const player of room) {
      send(player, { type: "opponent_disconnected" });
    }
    if (room.size === 0) {
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

        const roomCode = createRoomCode(rooms);
        rooms.set(roomCode, new Set([socket]));
        socket.roomCode = roomCode;
        send(socket, { type: "room_created", roomCode, username: socket.user.username });
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
        if (room.size >= 2) {
          send(socket, { type: "error", message: "That room is full." });
          return;
        }
        for (const player of room) {
          if (player.user?.id === socket.user.id) {
            send(socket, { type: "error", message: "You are already in this room." });
            return;
          }
        }

        room.add(socket);
        socket.roomCode = roomCode;
        const [host, guest] = room;
        send(socket, {
          type: "room_joined",
          roomCode,
          username: guest.user.username,
          opponentUsername: host.user.username
        });
        for (const player of room) {
          if (player !== socket) {
            send(player, { type: "opponent_joined", username: socket.user.username });
          }
        }

        const game = {
          engine: new WarEngine(engineOptions),
          seats: new Map([[host, "A"], [guest, "B"]]),
          players: {
            A: host.user,
            B: guest.user
          },
          recorded: false
        };
        games.set(roomCode, game);
        sendStates(game);
        return;
      }

      if (message.type === "game_message") {
        const room = rooms.get(socket.roomCode);
        if (!room || room.size !== 2) {
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

        const kind = message.payload?.kind;
        if (kind === "flip") {
          const game = games.get(socket.roomCode);
          const result = game.engine.flip(game.seats.get(socket));
          if (!result.ok) {
            send(socket, { type: "error", message: result.error });
            return;
          }
          sendStates(game);
          if (result.resolved && result.summary.gameOver && !game.recorded) {
            game.recorded = true;
            const winnerSeat = result.summary.winner;
            if (winnerSeat) {
              const loserSeat = winnerSeat === "A" ? "B" : "A";
              recordMatch(db, game.players[winnerSeat].id, game.players[loserSeat].id);
            }
          }
          if (result.resolved) {
            const { summary } = result;
            const roomCode = socket.roomCode;
            void commentator.describe(summary).then((text) => {
              if (!text || games.get(roomCode) !== game) return;
              for (const player of game.seats.keys()) {
                send(player, {
                  type: "game_message",
                  payload: { kind: "commentary", text, round: summary.round }
                });
              }
            });
          }
          return;
        }
        if (kind === "state" || kind === "commentary") {
          send(socket, { type: "error", message: "Only the server can send that." });
          return;
        }

        for (const player of room) {
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
