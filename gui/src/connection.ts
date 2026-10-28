// The only file that talks to the server. The rest of the GUI calls
// connect(), flip() and onMessage().
//
// - Production build (served by the Node server): real WebSocket on the same host.
// - `npm run dev` with VITE_WS_URL set (e.g. VITE_WS_URL=ws://localhost:3000):
//   real WebSocket to that address.
// - `npm run dev` without VITE_WS_URL: a fake server in the browser, so the UI
//   can be worked on before the real one exists.

import type { Card, ClientMessage, ServerMessage, StatePayload, Suit } from "./types";

type Listener = (msg: ServerMessage) => void;
const listeners: Listener[] = [];
const dispatch = (msg: ServerMessage) => listeners.forEach((cb) => cb(msg));

export function onMessage(cb: Listener) {
  listeners.push(cb);
}

const useFake = import.meta.env.DEV && !import.meta.env.VITE_WS_URL;

let socket: WebSocket | null = null;
let send: (msg: ClientMessage) => void = () => {};

export function connect(roomId: string) {
  if (useFake) {
    send = fakeServer;
    send({ type: "join", roomId });
  } else {
    const url =
      import.meta.env.VITE_WS_URL ??
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    socket = new WebSocket(url);
    socket.addEventListener("open", () => socket!.send(JSON.stringify({ type: "join", roomId })));
    socket.addEventListener("message", (e) => {
      try {
        dispatch(JSON.parse(e.data) as ServerMessage);
      } catch {
        console.error("Bad message from server:", e.data);
      }
    });
    socket.addEventListener("close", () =>
      dispatch({ type: "error", message: "Disconnected from server." }),
    );
    send = (msg) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    };
  }
}

export function flip() {
  send({ type: "flip" });
}

// ---------------------------------------------------------------------------
// PLACEHOLDER fake server. Not real War rules — just enough to exercise every
// phase of the UI. Delete once the real server is up.

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const randomCard = (): Card => ({
  rank: 2 + Math.floor(Math.random() * 13),
  suit: SUITS[Math.floor(Math.random() * 4)],
});

let fake: StatePayload = {
  yourCard: null,
  opponentCard: null,
  pile: 0,
  scoreA: 26,
  scoreB: 26,
  phase: "waiting",
};

function fakeEmit(patch: Partial<StatePayload>) {
  fake = { ...fake, ...patch };
  dispatch({ type: "state", ...fake });
}

function fakeServer(msg: ClientMessage) {
  if (msg.type === "join") {
    setTimeout(() => fakeEmit({}), 100);
    return;
  }
  if (fake.phase === "gameOver" || fake.yourCard) return;

  // You flip; opponent's card stays face-down until they "flip" a moment later.
  const mine = randomCard();
  fakeEmit({ yourCard: mine, opponentCard: null, phase: "flipped", pile: fake.pile + 1 });

  setTimeout(() => {
    const theirs = randomCard();
    const pile = fake.pile + 1;
    if (mine.rank === theirs.rank) {
      fakeEmit({ opponentCard: theirs, phase: "war", pile: pile + 6 });
      dispatch({ type: "commentary", text: "PLACEHOLDER: it's a WAR!" });
    } else {
      const youWin = mine.rank > theirs.rank;
      const scoreA = fake.scoreA + (youWin ? pile / 2 : -pile / 2);
      const scoreB = 52 - scoreA;
      const over = scoreA <= 0 || scoreB <= 0;
      fakeEmit({ opponentCard: theirs, phase: over ? "gameOver" : "roundOver", pile: 0, scoreA, scoreB });
      dispatch({
        type: "commentary",
        text: `PLACEHOLDER: ${youWin ? "you take" : "they take"} the round.`,
      });
    }
    // Next round: clear the table after a pause.
    setTimeout(() => {
      if (fake.phase !== "gameOver") fakeEmit({ yourCard: null, opponentCard: null, phase: "waiting" });
    }, 1500);
  }, 700);
}
