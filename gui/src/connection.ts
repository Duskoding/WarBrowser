// The only file that talks to the server.

import type { ClientMessage, GamePayload, ServerEvent } from "./types";

type Listener = (event: ServerEvent) => void;
const listeners: Listener[] = [];
const dispatch = (event: ServerEvent) => listeners.forEach((cb) => cb(event));

export function onEvent(cb: Listener) {
  listeners.push(cb);
}

let socket: WebSocket | null = null;
let generation = 0;

export function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const id = ++generation;
  if (socket) socket.close();
  const next = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = next;
  next.addEventListener("open", () => {
    if (id === generation) dispatch({ type: "connected" });
  });
  next.addEventListener("message", (e) => {
    if (id !== generation) return;
    try {
      dispatch(JSON.parse(e.data) as ServerEvent);
    } catch {
      dispatch({ type: "error", message: "Received an invalid server message." });
    }
  });
  next.addEventListener("close", () => {
    if (id === generation) dispatch({ type: "disconnected" });
  });
  next.addEventListener("error", () => {
    if (id === generation) dispatch({ type: "error", message: "Could not connect to the game server." });
  });
}

export function disconnect() {
  generation += 1;
  socket?.close();
  socket = null;
}

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else dispatch({ type: "error", message: "Not connected to the game server." });
}

export const createRoom = () => send({ type: "create_room" });
export const joinRoom = (roomCode: string) => send({ type: "join_room", roomCode });
export const leaveRoom = () => send({ type: "leave_room" });
export const sendGame = (payload: GamePayload) => send({ type: "game_message", payload });
