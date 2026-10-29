// The only file that talks to the server.

import type { ClientMessage, GamePayload, ServerEvent } from "./types";

type Listener = (event: ServerEvent) => void;
const listeners: Listener[] = [];
const dispatch = (event: ServerEvent) => listeners.forEach((cb) => cb(event));

export function onEvent(cb: Listener) {
  listeners.push(cb);
}

let socket: WebSocket | null = null;

export function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  socket.addEventListener("open", () => dispatch({ type: "connected" }));
  socket.addEventListener("message", (e) => {
    try {
      dispatch(JSON.parse(e.data) as ServerEvent);
    } catch {
      dispatch({ type: "error", message: "Received an invalid server message." });
    }
  });
  socket.addEventListener("close", () => dispatch({ type: "disconnected" }));
  socket.addEventListener("error", () =>
    dispatch({ type: "error", message: "Could not connect to the game server." }),
  );
}

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else dispatch({ type: "error", message: "Not connected to the game server." });
}

export const createRoom = () => send({ type: "create_room" });
export const joinRoom = (roomCode: string) => send({ type: "join_room", roomCode });
export const leaveRoom = () => send({ type: "leave_room" });
export const sendGame = (payload: GamePayload) => send({ type: "game_message", payload });
