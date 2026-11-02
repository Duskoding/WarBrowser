import { connect, createRoom, disconnect, joinRoom, leaveRoom, onEvent, sendGame } from "./connection";
import { fetchMe, login, logout, register, type Me } from "./session";
import {
  canFlip,
  type Card,
  type GamePayload,
  type GameView,
  type Phase,
  type StakeCard
} from "./types";

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>Live War</h1>
    <p class="conn" id="conn">Checking whether you are signed in…</p>
    <p class="user-bar" id="user-bar" hidden>
      <span id="user-stats"></span>
      <button type="button" id="logout" class="small ghost">Log out</button>
    </p>
  </header>

  <section class="auth" id="auth" hidden>
    <form id="auth-form">
      <label>Username
        <input id="username" name="username" autocomplete="username" maxlength="20" required />
      </label>
      <label>Password
        <input id="password" name="password" type="password" autocomplete="current-password" required />
      </label>
      <p class="auth-error" id="auth-error" hidden></p>
      <button type="submit" id="auth-submit">Log in</button>
    </form>
    <p class="auth-switch">
      <button type="button" id="auth-toggle" class="small ghost">Need an account? Register</button>
    </p>
  </section>

  <section class="lobby" id="lobby" hidden>
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
    <p class="invite-link" id="invite-link"></p>
    <section class="player them">
      <h2><span id="them-name">Opponent</span> <span class="count" id="them-count"></span></h2>
      <div class="card" id="them-card"><div class="face"></div><div class="back"></div></div>
      <div class="stakes" id="them-stakes" hidden aria-label="Opponent war cards"></div>
    </section>
    <div class="middle">
      <p class="status" id="status"></p>
      <p class="pile" id="pile"></p>
    </div>
    <section class="player you">
      <div class="stakes" id="you-stakes" hidden aria-label="Your war cards"></div>
      <div class="card" id="you-card"><div class="face"></div><div class="back"></div></div>
      <h2><span id="you-name">You</span> <span class="count" id="you-count"></span></h2>
    </section>
    <button id="flip" disabled>Flip</button>
    <aside class="commentary" id="commentary">Commentary will appear here.</aside>
  </main>
  <div class="toast" id="toast" hidden></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flipBtn = $<HTMLButtonElement>("flip");
const codeInput = $<HTMLInputElement>("room-code");
const usernameInput = $<HTMLInputElement>("username");
const passwordInput = $<HTMLInputElement>("password");
const authSubmit = $<HTMLButtonElement>("auth-submit");
const authToggle = $<HTMLButtonElement>("auth-toggle");
const authError = $("auth-error");

// ---- Session state ----
let me: Me | null = null;
let sessionReady = false;
let registering = false;
let roomCode: string | null = null;
let opponentHere = false;
let opponentName = "";
let view: GameView | null = null;
let statsRefreshed = false;
/** After a round resolves, show faces briefly then tuck to backs. */
const REVEAL_MS = 1500;
let cardsTucked = false;
let revealKey = "";
let tuckTimer: number | undefined;

// ---- Toast ----
let toastTimer: number | undefined;
function showToast(text: string) {
  const toast = $("toast");
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function setAuthError(text: string) {
  authError.textContent = text;
  authError.hidden = !text;
}

function renderUserBar() {
  const loggedIn = me !== null;
  $("user-bar").hidden = !loggedIn;
  if (me) {
    $("user-stats").textContent = `${me.username}  ${me.wins}–${me.losses}`;
  }
}

function showAuth() {
  sessionReady = true;
  $("auth").hidden = false;
  $("lobby").hidden = true;
  $("table").hidden = true;
  $("conn").hidden = false;
  $("conn").textContent = "Log in to play.";
  renderUserBar();
  setAuthError("");
  passwordInput.value = "";
}

function updateAuthMode() {
  authSubmit.textContent = registering ? "Register" : "Log in";
  authToggle.textContent = registering ? "Have an account? Log in" : "Need an account? Register";
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
}

async function refreshMe() {
  me = await fetchMe();
  renderUserBar();
  return me;
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
  gameOver: ""
};

const cardLabel = (card: Card) => `${RANK_LABELS[card.rank] ?? card.rank}${card.suit}`;

function renderStakes(el: HTMLElement, stakes: StakeCard[]) {
  el.hidden = stakes.length === 0;
  el.replaceChildren(
    ...stakes.map((stake) => {
      const chip = document.createElement("div");
      if (!stake.faceUp) {
        chip.className = "stake-card back";
        chip.title = "Face-down";
        return chip;
      }
      chip.className = "stake-card face";
      chip.textContent = cardLabel(stake.card);
      if (stake.card.suit === "♥" || stake.card.suit === "♦") chip.classList.add("red");
      return chip;
    })
  );
}

function warResult(v: GameView, opponent: string): string {
  const round = v.lastRound;
  if (!round || round.winner === null) return "The war ended in a draw.";
  const cards = `${round.cardsWon} cards`;
  return round.winner === "you"
    ? `You won the war and took ${cards}!`
    : `${opponent} won the war and took ${cards}.`;
}

function roundTakeResult(v: GameView): string {
  const round = v.lastRound;
  if (!round) return STATUS.roundOver;
  if (round.winner === "you") return "You take the cards!";
  if (round.winner === "opponent") return "Opponent takes the cards.";
  return "Draw — cards go back.";
}

function syncReveal(v: GameView) {
  const resolved = v.phase === "roundOver" || v.phase === "gameOver";
  const hasFaces =
    !!v.yourCard ||
    !!v.opponentCard ||
    (v.yourStakes?.length ?? 0) > 0 ||
    (v.opponentStakes?.length ?? 0) > 0;
  if (!resolved || !hasFaces) {
    cardsTucked = false;
    revealKey = "";
    clearTimeout(tuckTimer);
    return;
  }
  const key = [
    v.phase,
    v.yourCount,
    v.opponentCount,
    v.lastRound?.winner ?? "",
    v.lastRound?.cardsWon ?? 0,
    v.yourCard ? cardLabel(v.yourCard) : "",
    v.opponentCard ? cardLabel(v.opponentCard) : "",
    v.yourStakes?.length ?? 0,
    v.opponentStakes?.length ?? 0
  ].join(":");
  if (key === revealKey) return;
  revealKey = key;
  cardsTucked = false;
  clearTimeout(tuckTimer);
  tuckTimer = window.setTimeout(() => {
    cardsTucked = true;
    render();
  }, REVEAL_MS);
}

function render() {
  const loggedIn = me !== null;
  const inRoom = roomCode !== null;
  $("auth").hidden = !sessionReady || loggedIn;
  $("lobby").hidden = !loggedIn || inRoom;
  $("conn").hidden = inRoom;
  $("table").hidden = !inRoom;
  renderUserBar();
  if (!me || !inRoom) return;

  $("room-id").textContent = roomCode;
  $("invite-link").textContent = location.href;
  // Invite URL is only useful while waiting for someone to join.
  $("invite-link").hidden = opponentHere;
  const v = view;
  if (v) syncReveal(v);
  const tuck =
    cardsTucked && v && (v.phase === "roundOver" || v.phase === "gameOver");
  const yourCard = tuck ? null : (v?.yourCard ?? null);
  const themCard = tuck ? null : (v?.opponentCard ?? null);
  const yourStakes = tuck ? [] : (v?.yourStakes ?? []);
  const themStakes = tuck ? [] : (v?.opponentStakes ?? []);
  const warLayout = yourStakes.length > 0 || themStakes.length > 0;
  $("you-name").textContent = v?.yourName || me.username;
  $("them-name").textContent = opponentHere ? v?.opponentName || opponentName || "Opponent" : "Opponent";
  $("you-count").textContent = v ? `(${v.yourCount})` : "";
  $("them-count").textContent = v ? `(${v.opponentCount})` : "";
  // During war the lineup carries the story — hide empty main backs so the table stays short.
  $("you-card").hidden = warLayout && !yourCard;
  $("them-card").hidden = warLayout && !themCard;
  renderCard($("you-card"), yourCard);
  renderCard($("them-card"), themCard);
  renderStakes($("you-stakes"), yourStakes);
  renderStakes($("them-stakes"), themStakes);
  document.body.classList.toggle("war-layout", warLayout);
  $("pile").textContent = v && v.pile > 0 ? `${v.pile} card${v.pile === 1 ? "" : "s"} in the middle` : "";

  let status = "";
  if (!opponentHere) status = "Waiting for opponent — share the invite link";
  else if (!v) status = "Dealing…";
  else if (v.phase === "gameOver" && tuck) status = v.winner === "you" ? "You win!" : "You lose.";
  else if (v.phase === "gameOver" && !tuck) status = roundTakeResult(v);
  else if (v.yourCard && !v.opponentCard) {
    status = `${v.inWar ? "WAR! " : ""}Waiting for opponent to flip…`;
  } else if (v.inWar) {
    status = v.phase === "flipped" ? "WAR! Opponent flipped — your turn!" : "WAR! Flip again";
  } else if (v.phase === "roundOver" && !tuck && v.lastRound?.wasWar) {
    status = warResult(v, v.opponentName || opponentName || "Your opponent");
  } else if (v.phase === "roundOver" && !tuck) {
    status = roundTakeResult(v);
  } else status = STATUS[v.phase];
  $("status").textContent = status;

  document.body.classList.toggle("war", v?.inWar === true || (!!v?.lastRound?.wasWar && !tuck));
  flipBtn.disabled =
    !opponentHere || !v || !canFlip(v) || (v.phase === "roundOver" && !tuck);

  if (v?.phase === "gameOver" && !statsRefreshed) {
    statsRefreshed = true;
    void refreshMe();
  }
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
  opponentName = "";
  view = null;
  statsRefreshed = false;
  cardsTucked = false;
  revealKey = "";
  clearTimeout(tuckTimer);
  document.body.classList.remove("war-layout");
  $("you-card").hidden = false;
  $("them-card").hidden = false;
  $("invite-link").hidden = false;
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

function setLobbyConnected() {
  $("conn").textContent = "Connected. Create a room or join one.";
  $<HTMLButtonElement>("create-room").disabled = false;
  $<HTMLButtonElement>("join-room").disabled = false;
}

function setLobbyDisconnected() {
  $("conn").textContent = "Disconnected from the server. Refresh to reconnect.";
  $<HTMLButtonElement>("create-room").disabled = true;
  $<HTMLButtonElement>("join-room").disabled = true;
}

function afterLogin() {
  sessionReady = true;
  $("auth").hidden = true;
  $("lobby").hidden = false;
  $("conn").textContent = "Connecting to the game server…";
  renderUserBar();
  connect();
}

async function signOut() {
  await logout();
  me = null;
  resetRoom();
  disconnect();
  showAuth();
}

// ---- Server events ----
onEvent((e) => {
  switch (e.type) {
    case "connected": {
      setLobbyConnected();
      // Opened from an invite link → join straight away.
      const linked = new URLSearchParams(location.search).get("room");
      if (linked) joinRoom(linked);
      break;
    }
    case "disconnected":
      resetRoom();
      if (me) setLobbyDisconnected();
      break;
    case "room_created":
      enterRoom(e.roomCode);
      break;
    case "room_joined":
      enterRoom(e.roomCode);
      opponentHere = true;
      opponentName = e.opponentUsername ?? "";
      break;
    case "opponent_joined":
      opponentHere = true;
      opponentName = e.username ?? opponentName;
      clearCommentary();
      break;
    case "opponent_disconnected":
      opponentHere = false;
      opponentName = "";
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
function selectInviteLink() {
  const el = $("invite-link");
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Copy without highlighting the on-screen invite URL. */
function copyInviteLink(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    window.getSelection()?.removeAllRanges();
  }
}

$("copy-link").addEventListener("click", () => {
  const text = location.href;
  $("invite-link").textContent = text;
  // Copy during the click, before any await, or the browser drops the user gesture.
  if (copyInviteLink(text)) {
    showToast("Invite link copied");
    return;
  }
  if (!navigator.clipboard?.writeText) {
    selectInviteLink();
    showToast("Press Ctrl+C to copy");
    return;
  }
  void navigator.clipboard.writeText(text).then(
    () => showToast("Invite link copied"),
    () => {
      selectInviteLink();
      showToast("Press Ctrl+C to copy");
    }
  );
});
flipBtn.addEventListener("click", () => {
  flipBtn.disabled = true; // re-enabled by the next state
  sendGame({ kind: "flip" });
});
authToggle.addEventListener("click", () => {
  registering = !registering;
  updateAuthMode();
  setAuthError("");
});
$("auth-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  setAuthError("");
  authSubmit.disabled = true;
  try {
    const result = registering
      ? await register(usernameInput.value, passwordInput.value)
      : await login(usernameInput.value, passwordInput.value);
    if (!result.ok) {
      setAuthError(result.body.error ?? "Could not sign in.");
      return;
    }
    me = {
      username: String(result.body.username ?? usernameInput.value.trim()),
      wins: Number(result.body.wins ?? 0),
      losses: Number(result.body.losses ?? 0)
    };
    afterLogin();
  } catch {
    setAuthError("Could not reach the server.");
  } finally {
    authSubmit.disabled = false;
  }
});
$("logout").addEventListener("click", () => {
  void signOut();
});

updateAuthMode();
render();
void (async () => {
  try {
    me = await fetchMe();
  } catch {
    me = null;
  }
  if (!me) {
    showAuth();
    return;
  }
  afterLogin();
})();
