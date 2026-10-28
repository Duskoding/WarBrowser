import type { GameState } from "./types";

type Listener = (state: GameState) => void;
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
}
