import { connect, createRoom, disconnect, joinRoom, leaveRoom, onEvent, restartGame, sendGame, startGame } from "./connection";
import { clientGames } from "./games";
import baseGameStyles from "./games/base.css?inline";
import type { GuiModuleScreen } from "./games/GuiModule";
import { fetchGames, fetchMe, login, logout, register, resetPassword, type Me } from "./session";
import type { GameSummary, ServerPayload } from "./types";

// The shell: accounts, choosing a game, and rooms. Everything about a specific
// game is in games/<id>/.

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header>
    <h1>WarBrowser</h1>
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
    <h2>Choose a game</h2>
    <ul class="game-list" id="game-list"></ul>
    <p class="lobby-note" id="games-note" hidden></p>
    <div class="join-row">
      <span class="or">Have a room code?</span>
      <form class="join" id="join-form">
        <input id="room-code" maxlength="6" placeholder="Room code" autocomplete="off" spellcheck="false" />
        <button type="submit" id="join-room" disabled>Join</button>
      </form>
    </div>
  </section>

  <main class="room-screen" id="room-screen" hidden>
    <div class="room">
      <span class="game-name" id="room-game"></span>
      · Room <strong id="room-id"></strong>
      <button id="copy-link" class="small">Copy invite link</button>
      <button id="leave-room" class="small ghost">Leave</button>
    </div>
    <p class="invite-link" id="invite-link"></p>
    <p class="status" id="room-status"></p>
    <p class="players" id="room-players"></p>
    <button id="start-game" class="small" hidden>Start game</button>
    <div class="game-root" id="game-root"></div>
    <button id="play-again" class="small" hidden>Play again</button>
  </main>
  <div class="toast" id="toast" hidden></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
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
let connected = false;
let games: GameSummary[] = [];
let resetting = false;
let roomCode: string | null = null;
let roomGameId: string | null = null;
let roomHost: string | null = null;
let roomPlayers: string[] = [];
let roomMin = 0;
let roomMax = 0;
let screen: GuiModuleScreen | null = null;
let statsRefreshed = false;
let gameOver = false;

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
  $("room-screen").hidden = true;
  $("conn").hidden = false;
  $("conn").textContent = "Log in to play.";
  renderUserBar();
  setAuthError("");
  passwordInput.value = "";
}

function updateAuthMode() {
  authSubmit.textContent = resetting ? "Set new password" : registering ? "Register" : "Log in";
  authToggle.hidden = resetting;
  authToggle.textContent = registering ? "Have an account? Log in" : "Need an account? Register";
  passwordInput.autocomplete = registering || resetting ? "new-password" : "current-password";
  usernameInput.hidden = resetting;
}

async function refreshMe() {
  me = await fetchMe();
  renderUserBar();
  return me;
}

// ---- Game list ----
const gameName = (id: string | null) => games.find((g) => g.id === id)?.name ?? "Game";

function renderGameList() {
  const list = $("game-list");
  list.replaceChildren(
    ...games.map((game) => {
      const playable = game.id in clientGames;
      const item = document.createElement("li");
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "game-tile";
      tile.disabled = !connected || !playable;
      tile.innerHTML = `<strong></strong><span class="desc"></span><span class="meta"></span><span class="go"></span>`;
      tile.querySelector("strong")!.textContent = game.name;
      tile.querySelector(".desc")!.textContent = game.description;
      tile.querySelector(".meta")!.textContent =
        game.players.min === game.players.max
          ? `${game.players.min} players`
          : `${game.players.min}–${game.players.max} players`;
      tile.querySelector(".go")!.textContent = playable ? "Create a room →" : "Not available in this version";
      tile.addEventListener("click", () => createRoom(game.id));
      item.append(tile);
      return item;
    })
  );
}

async function loadGames() {
  const note = $("games-note");
  try {
    games = await fetchGames();
    note.hidden = games.length > 0;
    note.textContent = "No games are installed on this server.";
  } catch {
    games = [];
    note.hidden = false;
    note.textContent = "Could not load the list of games. Refresh to try again.";
  }
  renderGameList();
  render();
}

// ---- Game screen ----
// Each game draws into its own shadow root, so its styles stay inside it.
const baseSheet = new CSSStyleSheet();
baseSheet.replaceSync(baseGameStyles);
const gameSheets = new Map<string, CSSStyleSheet>();
function gameSheet(id: string, css: string) {
  let sheet = gameSheets.get(id);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    gameSheets.set(id, sheet);
  }
  return sheet;
}

function setBackground(background: string | null) {
  document.body.style.background = background ?? "";
}

// A bug in one game's screen shouldn't break the lobby or the room controls.
function guarded(action: () => void) {
  try {
    action();
  } catch (error) {
    console.error(`The ${gameName(roomGameId)} screen failed:`, error);
    showToast(`Something went wrong in ${gameName(roomGameId)}. Leave the room and try again.`);
  }
}

function mountGame() {
  const client = roomGameId ? clientGames[roomGameId] : undefined;
  if (!client || screen) return;
  const host = document.createElement("div");
  host.className = "game-host";
  host.dataset.game = client.id;
  const root = host.attachShadow({ mode: "open" });
  // Adopted stylesheets survive the game replacing root.innerHTML.
  root.adoptedStyleSheets = [baseSheet, gameSheet(client.id, client.styles)];
  $("game-root").replaceChildren(host);
  guarded(() => {
    screen = client.mount(root, { send: sendGame, setBackground });
  });
}

function unmountGame() {
  const current = screen;
  screen = null;
  if (current?.destroy) guarded(() => current.destroy!());
  $("game-root").replaceChildren();
  setBackground(null);
  statsRefreshed = false;
}

function handleGamePayload(payload: unknown) {
  const p = payload as ServerPayload | null;
  if (!p || typeof p !== "object") return;
  if (p.kind === "state") {
    const client = roomGameId ? clientGames[roomGameId] : undefined;
    let finished = false;
    guarded(() => {
      finished = client?.isFinished(p.view) ?? false;
    });
    if (gameOver && !finished) {
      unmountGame();
      gameOver = false;
    }
    mountGame();
    guarded(() => {
      screen?.applyState(p.view);
      screen?.render();
    });
    gameOver = finished;
    $<HTMLButtonElement>("play-again").disabled = false;
    if (!finished) statsRefreshed = false;
    if (finished && !statsRefreshed) {
      statsRefreshed = true;
      void refreshMe();
    }
  } else if (p.kind === "commentary") {
    guarded(() => screen?.commentary?.(p.text, p.round));
  }
}

// ---- Rendering ----
function render() {
  const loggedIn = me !== null;
  const inRoom = roomCode !== null;
  $("auth").hidden = !sessionReady || loggedIn;
  $("lobby").hidden = !loggedIn || inRoom;
  $("conn").hidden = inRoom;
  $("room-screen").hidden = !inRoom;
  renderUserBar();
  if (!me || !inRoom) return;

  $("room-game").textContent = gameName(roomGameId);
  $("room-id").textContent = roomCode;
  $("invite-link").textContent = location.href;
  // Invite URL and player count are only useful before the game starts.
  $("invite-link").hidden = screen !== null;
  $("room-players").hidden = screen !== null;
  $("room-players").textContent = `${roomPlayers.join(", ")} (${roomPlayers.length}/${roomMin}–${roomMax})`;

  const isHost = me !== null && roomHost === me.username;
  const canStart = isHost && !screen && roomPlayers.length >= roomMin;
  $<HTMLButtonElement>("start-game").hidden = !canStart;
  $<HTMLButtonElement>("play-again").hidden = !gameOver;

  let status = "";
  if (roomGameId && !(roomGameId in clientGames)) status = "This game isn't available in this version of the site.";
  else if (!screen && roomPlayers.length < roomMin) status = "Waiting for players — share the invite link";
  else if (!screen && !isHost) status = "Waiting for the host to start the game";
  else if (!screen && isHost) status = "Ready — start when you like, or wait for more players";
  $("room-status").textContent = status;
  $("room-status").hidden = !status;
}

function resetRoom() {
  unmountGame();
  gameOver = false;
  $("invite-link").hidden = false;
  roomCode = null;
  roomGameId = null;
  roomHost = null;
  roomPlayers = [];
  roomMin = 0;
  roomMax = 0;
  const params = new URLSearchParams(location.search);
  params.delete("room");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function enterRoom(
  code: string,
  gameId: string,
  host: string,
  players: string[],
  min: number,
  max: number
) {
  roomCode = code;
  roomGameId = gameId;
  roomHost = host;
  roomPlayers = players;
  roomMin = min;
  roomMax = max;
  const params = new URLSearchParams(location.search);
  params.set("room", code);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

function setConnected(value: boolean) {
  connected = value;
  $("conn").textContent = value
    ? "Connected. Choose a game or join a room."
    : "Disconnected from the server. Refresh to reconnect.";
  $<HTMLButtonElement>("join-room").disabled = !value;
  renderGameList();
}

function afterLogin() {
  sessionReady = true;
  $("auth").hidden = true;
  $("lobby").hidden = false;
  $("conn").textContent = "Connecting to the game server…";
  renderUserBar();
  void loadGames();
  connect();
}

async function signOut() {
  await logout();
  me = null;
  resetRoom();
  disconnect();
  connected = false;
  showAuth();
}

// ---- Server events ----
onEvent((e) => {
  switch (e.type) {
    case "connected": {
      setConnected(true);
      // Opened from an invite link → join straight away.
      const linked = new URLSearchParams(location.search).get("room");
      if (linked) joinRoom(linked);
      break;
    }
    case "disconnected":
      resetRoom();
      if (me) setConnected(false);
      break;
    case "room_created":
      enterRoom(e.roomCode, e.gameId, e.host, e.players, e.min, e.max);
      break;
    case "room_joined":
      enterRoom(e.roomCode, e.gameId, e.host, e.players, e.min, e.max);
      break;
    case "players_update":
      roomPlayers = e.players;
      break;
    case "player_left":
      roomPlayers = roomPlayers.filter((username) => username !== e.username);
      unmountGame();
      gameOver = false;
      showToast(`${e.username} left the room.`);
      break;
    case "room_left":
      resetRoom();
      break;
    case "room_closed":
      resetRoom();
      showToast("This room was closed after being idle too long.");
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
$("join-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (code) joinRoom(code);
});
$("leave-room").addEventListener("click", leaveRoom);
$("start-game").addEventListener("click", startGame);
$("play-again").addEventListener("click", () => {
  $<HTMLButtonElement>("play-again").disabled = true;
  restartGame();
});
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
    const result = resetting
      ? await resetPassword(passwordInput.value)
      : registering
        ? await register(usernameInput.value, passwordInput.value)
        : await login(usernameInput.value, passwordInput.value);
    if (!result.ok) {
      setAuthError(result.body.error ?? "Could not sign in.");
      return;
    }
    if (resetting) {
      me = { ...me!, mustResetPassword: false };
      resetting = false;
      passwordInput.value = "";
      updateAuthMode();
      afterLogin();
      return;
    }
    me = {
      username: String(result.body.username ?? usernameInput.value.trim()),
      wins: Number(result.body.wins ?? 0),
      losses: Number(result.body.losses ?? 0),
      mustResetPassword: Boolean(result.body.mustResetPassword),
      games: result.body.games ?? {}
    };
    if (me?.mustResetPassword) {
      resetting = true;
      setAuthError("You must set a new password before playing.");
      updateAuthMode();
      return;
    }
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
