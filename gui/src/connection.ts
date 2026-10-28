<<<<<<< HEAD
// The only file that talks to the server.

import type { ClientMessage, GamePayload, ServerEvent } from "./types";

type Listener = (event: ServerEvent) => void;
=======
import type { GameState } from "./types";

type Listener = (state: GameState) => void;
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
const listeners: Listener[] = [];
let state: GameState = {
  you: { cardsLeft: 26, faceUp: null },
  them: { cardsLeft: 26, faceUp: null },
  phase: "waiting",
};

const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
const roomId = new URLSearchParams(location.search).get("room")?.trim() || "demo";

socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", roomId })));
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data) as
    | { type: "state"; state: GameState }
    | { type: "commentary"; text: string }
    | { type: "error"; message: string };
  if (message.type === "state") {
    state = { ...state, ...message.state };
  } else if (message.type === "commentary") {
    state = { ...state, commentary: message.text };
  } else {
    state = { ...state, commentary: message.message };
  }
  listeners.forEach((cb) => cb(state));
});

export function onState(cb: Listener) {
  listeners.push(cb);
  cb(state);
}

<<<<<<< HEAD
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
=======
export function flip() {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "flip" }));
}
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
