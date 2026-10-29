import { connect, createRoom, joinRoom, leaveRoom, onEvent, sendGame } from "./connection";
import { canFlip, type Card, type GamePayload, type GameView, type Phase } from "./types";

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>Live War</h1>
    <p class="conn" id="conn">Connecting to the game server…</p>
  </header>

  <section class="lobby" id="lobby">
    <button id="create-room" disabled>Create room</button>
    <span class="or">or</span>
    <form class="join" id="join-form">
      <input id="room-code" maxlength="6" placeholder="Room code" autocomplete="off" spellcheck="false" />
      <button type="submit" id="join-room" disabled>Join</button>
    </form>
  </section>

  <main class="table" id="table" hidden>
    <div class="room">
      Room <strong id="room-id"></strong>
      <button id="copy-link" class="small">Copy invite link</button>
      <button id="leave-room" class="small ghost">Leave</button>
    </div>
    <section class="player them">
      <h2>Opponent <span class="count" id="them-count"></span></h2>
      <div class="card" id="them-card"><div class="face"></div><div class="back"></div></div>
    </section>
    <div class="middle">
      <p class="status" id="status"></p>
      <p class="pile" id="pile"></p>
    </div>
    <section class="player you">
      <div class="card" id="you-card"><div class="face"></div><div class="back"></div></div>
      <h2>You <span class="count" id="you-count"></span></h2>
    </section>
    <button id="flip" disabled>Flip</button>
    <aside class="commentary" id="commentary">Commentary will appear here.</aside>
  </main>
  <div class="toast" id="toast" hidden></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flipBtn = $<HTMLButtonElement>("flip");
const codeInput = $<HTMLInputElement>("room-code");

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
function renderCard(el: HTMLElement, card: Card | null) {
  const key = card ? `${card.rank}${card.suit}` : "";
  if (shown.get(el) === key) return; // don't replay the flip on unchanged cards
  shown.set(el, key);
  if (!card) {
    el.classList.remove("flipped");
    return;
  }
  const face = el.querySelector<HTMLDivElement>(".face")!;
  face.textContent = `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;
  face.classList.toggle("red", card.suit === "♥" || card.suit === "♦");
  el.classList.remove("flipped");
  void el.offsetWidth; // restart the animation
  el.classList.add("flipped");
}

const STATUS: Record<Phase, string> = {
  waiting: "Flip when ready",
  flipped: "Opponent flipped — your turn!",
  war: "WAR! Flip again",
  roundOver: "Flip for the next round",
  gameOver: "",
};

function render() {
  const inRoom = roomCode !== null;
  $("lobby").hidden = inRoom;
  $("conn").hidden = inRoom;
  $("table").hidden = !inRoom;
  if (!inRoom) return;

  $("room-id").textContent = roomCode;
  const v = view;
  $("you-count").textContent = v ? `(${v.yourCount})` : "";
  $("them-count").textContent = v ? `(${v.opponentCount})` : "";
  renderCard($("you-card"), v?.yourCard ?? null);
  renderCard($("them-card"), v?.opponentCard ?? null);
  $("pile").textContent = v && v.pile > 0 ? `${v.pile} card${v.pile === 1 ? "" : "s"} in the middle` : "";

  let status = "";
  if (!opponentHere) status = "Waiting for opponent — share the invite link";
  else if (!v) status = "Dealing…";
  else if (v.phase === "gameOver") status = v.winner === "you" ? "You win!" : "You lose.";
  else if (v.yourCard && !v.opponentCard) status = "Waiting for opponent to flip…";
  else status = STATUS[v.phase];
  $("status").textContent = status;

  document.body.classList.toggle("war", v?.phase === "war");
  flipBtn.disabled = !opponentHere || !v || !canFlip(v);
}

const COMMENTARY_PLACEHOLDER = "Commentary will appear here.";
let lastCommentaryRound = 0;

function setCommentary(text: string, round: number) {
  if (round <= lastCommentaryRound) return; // a slow reply for an older round
  lastCommentaryRound = round;
  $("commentary").textContent = text;
}

function clearCommentary() {
  lastCommentaryRound = 0;
  $("commentary").textContent = COMMENTARY_PLACEHOLDER;
}

// ---- Game wiring ----
function handleGamePayload(payload: unknown) {
  const p = payload as GamePayload | null;
  if (!p || typeof p !== "object") return;
  if (p.kind === "state") {
    view = p.view;
    render();
  } else if (p.kind === "commentary") setCommentary(p.text, p.round);
}

function resetRoom() {
  roomCode = null;
  opponentHere = false;
  view = null;
  clearCommentary();
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
      clearCommentary();
      break;
    case "opponent_disconnected":
      opponentHere = false;
      view = null;
      clearCommentary();
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
