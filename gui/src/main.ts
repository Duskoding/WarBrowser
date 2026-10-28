import "./style.css";
import { flip, onState } from "./connection";
import type { Card, GameState } from "./types";

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

onState(render);
