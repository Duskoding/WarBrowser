import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const publicDirectory = new URL("./public/", import.meta.url);
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxMessageBytes = 16 * 1024;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/client.js", ["client.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

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

export function createWarServer() {
  const rooms = new Map();
  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = staticFiles.get(pathname);

    if (!file || request.method !== "GET") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const contents = await readFile(new URL(file[0], publicDirectory));
      response.writeHead(200, {
        "Content-Type": file[1],
        "X-Content-Type-Options": "nosniff"
      });
      response.end(contents);
    } catch (error) {
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
