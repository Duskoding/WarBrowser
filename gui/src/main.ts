<<<<<<< HEAD
import { connect, createRoom, joinRoom, leaveRoom, onEvent, sendGame } from "./connection";
import { canFlip, type Card, type GamePayload, type GameView, type Phase } from "./types";
=======
import "./style.css";
import { flip, onState } from "./connection";
import type { Card, GameState } from "./types";
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header><h1>Live War</h1></header>
  <main class="table">
    <section class="player them">
      <h2>Opponent <span class="count" id="them-count"></span></h2>
      <div class="card" id="them-card"><div class="face"></div><div class="back"></div></div>
    </section>
    <p class="status" id="status"></p>
    <section class="player you">
      <div class="card" id="you-card"><div class="face"></div><div class="back"></div></div>
      <h2>You <span class="count" id="you-count"></span></h2>
    </section>
    <button id="flip">Flip</button>
    <aside class="commentary" id="commentary"></aside>
  </main>
`;

const $ = (id: string) => document.getElementById(id)!;
const flipBtn = $("flip") as HTMLButtonElement;
flipBtn.addEventListener("click", flip);

<<<<<<< HEAD
// ---- Session state ----
let roomCode: string | null = null;
let opponentHere = false;
let view: GameView | null = null;

// ---- Toast ----
let toastTimer: number | undefined;
function showToast(text: string) {
  const toast = $("toast");
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3000);
}

// ---- Rendering ----
const shown = new WeakMap<HTMLElement, string>();
=======
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
function renderCard(el: HTMLElement, card: Card | null) {
  const face = el.querySelector<HTMLDivElement>(".face")!;
  if (!card) {
    el.classList.remove("flipped");
    return;
  }
  face.textContent = `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;
  face.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
  // Restart the flip animation on every new card.
  el.classList.remove("flipped");
  void el.offsetWidth;
  el.classList.add("flipped");
}

const STATUS: Record<GameState["phase"], string> = {
  waiting: "Waiting for opponent…",
  playing: "",
  war: "WAR!",
  over: "Game over",
};

function render(state: GameState) {
  $("you-count").textContent = `(${state.you.cardsLeft})`;
  $("them-count").textContent = `(${state.them.cardsLeft})`;
  renderCard($("you-card"), state.you.faceUp);
  renderCard($("them-card"), state.them.faceUp);
  $("status").textContent =
    state.phase === "over" ? `Game over: ${state.winner === "you" ? "you win!" : "they win."}` : STATUS[state.phase];
  document.body.classList.toggle("war", state.phase === "war");
  flipBtn.disabled = state.phase === "waiting" || state.phase === "over";
  $("commentary").textContent = state.commentary ?? "";
}

<<<<<<< HEAD
function setCommentary(text?: string) {
  if (text) $("commentary").textContent = text;
}

// ---- Game wiring ----
function handleGamePayload(payload: unknown) {
  const p = payload as GamePayload | null;
  if (!p || typeof p !== "object") return;
  if (p.kind === "state") {
    view = p.view;
    render();
  } else if (p.kind === "commentary") setCommentary(p.text);
}

function resetRoom() {
  roomCode = null;
  opponentHere = false;
  view = null;
  const params = new URLSearchParams(location.search);
  params.delete("room");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function enterRoom(code: string) {
  roomCode = code;
  const params = new URLSearchParams(location.search);
  params.set("room", code);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

// ---- Server events ----
onEvent((e) => {
  switch (e.type) {
    case "connected": {
      $("conn").textContent = "Connected. Create a room or join one.";
      $<HTMLButtonElement>("create-room").disabled = false;
      $<HTMLButtonElement>("join-room").disabled = false;
      // Opened from an invite link → join straight away.
      const linked = new URLSearchParams(location.search).get("room");
      if (linked) joinRoom(linked);
      break;
    }
    case "disconnected":
      resetRoom();
      $("conn").textContent = "Disconnected from the server. Refresh to reconnect.";
      $<HTMLButtonElement>("create-room").disabled = true;
      $<HTMLButtonElement>("join-room").disabled = true;
      break;
    case "room_created":
      enterRoom(e.roomCode);
      break;
    case "room_joined":
      enterRoom(e.roomCode);
      opponentHere = true;
      break;
    case "opponent_joined":
      opponentHere = true;
      break;
    case "opponent_disconnected":
      opponentHere = false;
      view = null;
      showToast("Your opponent disconnected.");
      break;
    case "room_left":
      resetRoom();
      break;
    case "game_message":
      handleGamePayload(e.payload);
      break;
    case "error":
      showToast(e.message);
      // A bad invite link shouldn't keep retrying.
      if (!roomCode) resetRoom();
      break;
  }
  render();
});

// ---- Controls ----
$("create-room").addEventListener("click", createRoom);
$("join-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (code) joinRoom(code);
});
$("leave-room").addEventListener("click", leaveRoom);
$("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast("Invite link copied");
  } catch {
    showToast(location.href);
  }
});
flipBtn.addEventListener("click", () => {
  flipBtn.disabled = true; // re-enabled by the next state
  sendGame({ kind: "flip" });
});

render();
connect();
=======
onState(render);
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
