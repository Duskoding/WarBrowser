// PLACEHOLDER connection. The rest of the GUI only calls flip() and onState(),
// so swapping in the real server means rewriting this file only.
//
// TODO: replace the fake game below with socket.io-client, e.g.
//   const socket = io(SERVER_URL);
//   export function flip() { socket.emit("flip"); }
//   export function onState(cb) { socket.on("state", cb); }

import type { Card, GameState, Suit } from "./types";

type Listener = (state: GameState) => void;
const listeners: Listener[] = [];

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const randomCard = (): Card => ({
  rank: 2 + Math.floor(Math.random() * 13),
  suit: SUITS[Math.floor(Math.random() * 4)],
});

let state: GameState = {
  you: { cardsLeft: 26, faceUp: null },
  them: { cardsLeft: 26, faceUp: null },
  phase: "waiting",
  commentary: "Waiting for the other player…",
};

function emit() {
  listeners.forEach((cb) => cb(state));
}

export function onState(cb: Listener) {
  listeners.push(cb);
  cb(state);
  // Fake opponent joining shortly after load.
  setTimeout(() => {
    state = { ...state, phase: "playing", commentary: "Opponent joined. Flip!" };
    emit();
  }, 1000);
}

export function flip() {
  if (state.phase === "over" || state.phase === "waiting") return;
  // Fake rules: not real War logic, just enough to drive the screen.
  const mine = randomCard();
  const theirs = randomCard();
  const you = { ...state.you, faceUp: mine };
  const them = { ...state.them, faceUp: theirs };
  let phase: GameState["phase"] = "playing";
  let commentary = "PLACEHOLDER commentary";
  if (mine.rank > theirs.rank) {
    you.cardsLeft++; them.cardsLeft--;
    commentary = "PLACEHOLDER: you take the round.";
  } else if (mine.rank < theirs.rank) {
    you.cardsLeft--; them.cardsLeft++;
    commentary = "PLACEHOLDER: they take the round.";
  } else {
    phase = "war";
    commentary = "PLACEHOLDER: WAR!";
  }
  let winner: GameState["winner"];
  if (you.cardsLeft <= 0 || them.cardsLeft <= 0) {
    phase = "over";
    winner = you.cardsLeft > 0 ? "you" : "them";
  }
  state = { you, them, phase, winner, commentary };
  emit();
}
