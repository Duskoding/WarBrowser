// Preview-only stand-in for src/connection.ts: talks to the pretend server in
// preview/page.html over postMessage instead of a WebSocket.
import type { ClientMessage, GamePayload, ServerEvent } from "../src/types";

type Listener = (event: ServerEvent) => void;
const listeners: Listener[] = [];
const dispatch = (event: ServerEvent) => listeners.forEach((cb) => cb(event));

export function onEvent(cb: Listener) {
  listeners.push(cb);
}

function send(msg: ClientMessage | { type: "__hello" }) {
  parent.postMessage({ __sim: "msg", msg }, "*");
}

export function connect() {
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d?.__sim === "evt") dispatch(d.event);
    // Demo shortcuts from the parent page's buttons.
    if (d?.__sim === "do" && d.action === "create") createRoom();
    if (d?.__sim === "do" && d.action === "join") joinRoom(d.code);
  });
  send({ type: "__hello" });
}

export const createRoom = () => send({ type: "create_room" });
export const joinRoom = (roomCode: string) => send({ type: "join_room", roomCode });
export const leaveRoom = () => send({ type: "leave_room" });
export const sendGame = (payload: GamePayload) => send({ type: "game_message", payload });
