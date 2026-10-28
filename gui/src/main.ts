import "./style.css";
import { connect, flip, onMessage } from "./connection";
import type { Card, Phase, StatePayload } from "./types";

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

// Room comes from the shared link (?room=XXXX). No room in the URL → make one.
const params = new URLSearchParams(location.search);
let roomId = params.get("room");
if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  params.set("room", roomId);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>Live War</h1>
    <div class="room">
      Room <strong id="room-id"></strong>
      <button id="copy-link" class="small">Copy invite link</button>
    </div>
  </header>
  <main class="table">
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
    <button id="flip">Flip</button>
    <aside class="commentary" id="commentary">Commentary will appear here.</aside>
  </main>
  <div class="toast" id="toast" hidden></div>
`;

const $ = (id: string) => document.getElementById(id)!;
const flipBtn = $("flip") as HTMLButtonElement;
flipBtn.addEventListener("click", () => {
  flipBtn.disabled = true; // re-enabled by the next state that allows a flip
  flip();
});

$("room-id").textContent = roomId;
$("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast("Invite link copied");
  } catch {
    showToast(location.href);
  }
});

let toastTimer: number | undefined;
function showToast(text: string) {
  const toast = $("toast");
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3000);
}

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
  flipped: "",
  war: "WAR!",
  roundOver: "",
  gameOver: "Game over",
};

function render(s: StatePayload) {
  $("you-count").textContent = `(${s.scoreA})`;
  $("them-count").textContent = `(${s.scoreB})`;
  renderCard($("you-card"), s.yourCard);
  renderCard($("them-card"), s.opponentCard);
  $("pile").textContent = s.pile > 0 ? `${s.pile} card${s.pile === 1 ? "" : "s"} in the middle` : "";

  let status = STATUS[s.phase];
  if (s.phase === "flipped") status = s.opponentCard ? "" : "Waiting for opponent to flip…";
  if (s.phase === "gameOver") status = s.scoreA > s.scoreB ? "You win!" : "You lose.";
  $("status").textContent = status;

  document.body.classList.toggle("war", s.phase === "war");
  // Can flip unless the game is over or you've already flipped this round.
  flipBtn.disabled = s.phase === "gameOver" || (s.yourCard !== null && s.opponentCard === null);
}

onMessage((msg) => {
  if (msg.type === "state") render(msg);
  else if (msg.type === "commentary") $("commentary").textContent = msg.text;
  else if (msg.type === "error") showToast(msg.message);
});

$("status").textContent = "Connecting…";
connect(roomId);
