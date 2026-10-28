import type { GameState } from "./types";
// The only file that talks to the server.
// Add ?fake to the page URL to play against a fake server + bot instead.

import { canFlip, type ClientMessage, type GamePayload, type ServerEvent } from "./types";

type Listener = (event: ServerEvent) => void;
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

export function flip() {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "flip" }));
const dispatch = (event: ServerEvent) => listeners.forEach((cb) => cb(event));

export function onEvent(cb: Listener) {
  listeners.push(cb);
}

const useFake = new URLSearchParams(location.search).has("fake");
let socket: WebSocket | null = null;

export function connect() {
  if (useFake) {
    setTimeout(() => dispatch({ type: "connected" }), 100);
    return;
  }
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
  if (useFake) return fakeServer(msg);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else dispatch({ type: "error", message: "Not connected to the game server." });
}

export const createRoom = () => send({ type: "create_room" });
export const joinRoom = (roomCode: string) => send({ type: "join_room", roomCode });
export const leaveRoom = () => send({ type: "leave_room" });
export const sendGame = (payload: GamePayload) => send({ type: "game_message", payload });

// ---------------------------------------------------------------------------
// PLACEHOLDER fake server (?fake). You always create the room; a bot joins as
// the guest and flips whenever it's allowed to.

let botTimer: number | undefined;

function fakeServer(msg: ClientMessage) {
  const reply = (e: ServerEvent, ms = 50) => setTimeout(() => dispatch(e), ms);
  switch (msg.type) {
    case "create_room":
    case "join_room":
      reply({ type: "room_created", roomCode: "FAKE01" });
      reply({ type: "opponent_joined" }, 1200);
      break;
    case "leave_room":
      clearTimeout(botTimer);
      reply({ type: "room_left" });
      break;
    case "game_message":
      if (msg.payload.kind === "state" && canFlip(msg.payload.view) && botTimer === undefined) {
        botTimer = window.setTimeout(() => {
          botTimer = undefined;
          dispatch({ type: "game_message", payload: { kind: "flip" } });
        }, 900);
      }
      break;
  }
}
