import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { WarEngine } from "./src/engine/WarEngine.ts";
import { ClaudeCommentator } from "./src/commentator.ts";

const guiDirectory = new URL("./gui/dist/", import.meta.url);
const publicDirectory = new URL("./public/", import.meta.url);
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxMessageBytes = 16 * 1024;
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

const suitSymbols = { S: "♠", H: "♥", D: "♦", C: "♣" };

function toViewCard(card) {
  return card && { rank: card.rank, suit: suitSymbols[card.suit] };
}

function toView(state, seat) {
  const mine = seat === "A";
  const winner = state.winner === null ? undefined : state.winner === seat ? "you" : "opponent";
  return {
    yourCard: toViewCard(state.yourCard),
    opponentCard: toViewCard(state.opponentCard),
    pile: state.pile,
    yourCount: mine ? state.scoreA : state.scoreB,
    opponentCount: mine ? state.scoreB : state.scoreA,
    phase: state.phase,
    winner
  };
}

function sendStates(game) {
  for (const [socket, seat] of game.seats) {
    send(socket, {
      type: "game_message",
      payload: { kind: "state", view: toView(game.engine.getState(seat), seat) }
    });
  }
}

export function createWarServer({ commentator = new ClaudeCommentator() } = {}) {
  const rooms = new Map();
  const games = new Map();
  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
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

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
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
        if (socket.roomCode) {
          send(socket, { type: "error", message: "Leave your current room first." });
          return;
        }

        const roomCode = createRoomCode(rooms);
        rooms.set(roomCode, new Set([socket]));
        socket.roomCode = roomCode;
        send(socket, { type: "room_created", roomCode });
        return;
      }

      if (message.type === "join_room") {
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

        room.add(socket);
        socket.roomCode = roomCode;
        send(socket, { type: "room_joined", roomCode });
        for (const player of room) {
          if (player !== socket) {
            send(player, { type: "opponent_joined" });
          }
        }

        const [host, guest] = room;
        const game = {
          engine: new WarEngine(),
          seats: new Map([[host, "A"], [guest, "B"]])
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

  return { httpServer, websocketServer };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { httpServer } = createWarServer();
  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`WarBrowser is listening on port ${port}`);
  });
}
