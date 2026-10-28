import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { ClaudeCommentator } from "./commentator.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { WarEngine } from "./war-engine.js";

type Room = { engine: WarEngine; sockets: [WebSocket | null, WebSocket | null] };
const rooms = new Map<string, Room>();
const commentator = new ClaudeCommentator();
const clientRoot = join(process.cwd(), "gui", "dist");

const send = (socket: WebSocket, message: ServerMessage) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const broadcastState = (room: Room) => {
  room.sockets.forEach((socket, index) => {
    if (socket) send(socket, { type: "state", state: room.engine.state(index) });
  });
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(clientRoot, requested));
  if (!file.startsWith(clientRoot)) {
    response.writeHead(400).end("Bad request");
    return;
  }
  try {
    const body = await readFile(file);
    const contentTypes: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

const wsServer = new WebSocketServer({ server });
wsServer.on("connection", (socket) => {
  let room: Room | undefined;
  let player = -1;

  socket.on("message", async (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(socket, { type: "error", message: "Invalid message." });
      return;
    }

    if (message.type === "join") {
      const roomId = message.roomId.trim().slice(0, 64);
      if (!roomId) return send(socket, { type: "error", message: "A room ID is required." });
      room = rooms.get(roomId) ?? { engine: new WarEngine(), sockets: [null, null] };
      player = room.sockets[0] ? 1 : 0;
      if (room.sockets[player]) return send(socket, { type: "error", message: "Room is full." });
      room.sockets[player] = socket;
      rooms.set(roomId, room);
      room.engine.setPlayersConnected(room.sockets.filter(Boolean).length);
      broadcastState(room);
      return;
    }

    if (message.type === "flip") {
      if (!room || player < 0) return send(socket, { type: "error", message: "Join a room first." });
      try {
        const summary = room.engine.flip(player);
        broadcastState(room);
        if (summary) {
          void commentator.describe(summary).then((text) => {
            if (!text) return;
            room?.sockets.forEach((client) => {
              if (client) send(client, { type: "commentary", text, roundId: summary.roundId });
            });
          });
        }
      } catch (error) {
        send(socket, { type: "error", message: error instanceof Error ? error.message : "Invalid move." });
      }
    }
  });

  socket.on("close", () => {
    if (!room || player < 0) return;
    if (room.sockets[player] === socket) room.sockets[player] = null;
    if (room.sockets.every((client) => client === null)) {
      const roomId = [...rooms.entries()].find(([, value]) => value === room)?.[0];
      if (roomId) rooms.delete(roomId);
    } else {
      broadcastState(room);
    }
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`WarBrowser listening on http://localhost:${port}`));
