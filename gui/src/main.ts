import { connect, createRoom, disconnect, joinRoom, leaveRoom, onEvent, restartGame, sendGame, startGame } from "./connection";
import { clientGames } from "./games";
import baseGameStyles from "./games/base.css?inline";
import type { GuiModuleScreen } from "./games/GuiModule";
import { flairFor, hueFor } from "./flair";
import { confetti, nativeShare, shake } from "./fx";
import { fetchGames, fetchMe, login, logout, register, resetPassword, type Me } from "./session";
import type { GameSummary, ServerPayload } from "./types";

// The shell: accounts, choosing a game, and rooms. Everything about a specific
// game is in games/<id>/.

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar" id="site-header">
    <a class="wordmark" href="/" aria-label="WarBrowser home"><span class="mark" aria-hidden="true">♠</span>WarBrowser</a>
    <div class="topbar-right">
      <p class="conn" id="conn">Checking whether you are signed in…</p>
      <p class="user-bar" id="user-bar" hidden>
        <span class="me-chip" id="user-stats"></span>
        <button type="button" id="logout" class="small ghost">Log out</button>
      </p>
    </div>
  </header>

  <section class="auth" id="auth" hidden>
    <div class="hero">
      <p class="eyebrow">10 games · live · free</p>
      <h1>Play anyone.<br /><span>One link.</span></h1>
      <p class="hero-sub">Pick a game, send the link, and you're playing before they finish reading the text.</p>
      <div class="fan" aria-hidden="true">
        <span class="pc" style="--r:-18deg;--x:-70px">A<small>♠</small></span>
        <span class="pc red" style="--r:-6deg;--x:-24px">K<small>♥</small></span>
        <span class="pc" style="--r:6deg;--x:24px">Q<small>♣</small></span>
        <span class="pc red" style="--r:18deg;--x:70px">J<small>♦</small></span>
      </div>
    </div>
    <div class="auth-card">
      <h2 class="auth-title" id="auth-title">Jump in</h2>
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
    </div>
  </section>

  <section class="lobby" id="lobby" hidden>
    <div class="lobby-head">
      <div>
        <h2>Pick your battle</h2>
        <p>Create a room and send the link — or join a friend's.</p>
      </div>
      <form class="join" id="join-form">
        <input id="room-code" maxlength="6" placeholder="Room code" aria-label="Room code" autocomplete="off" spellcheck="false" />
        <button type="submit" id="join-room" class="ghost" disabled>Join</button>
      </form>
    </div>
    <ul class="game-list" id="game-list"></ul>
    <p class="lobby-note" id="games-note" hidden></p>
  </section>

  <main class="room-screen" id="room-screen" hidden>
    <div class="room">
      <span class="game-name" id="room-game"></span>
      <span class="code-label">Room</span> <strong id="room-id"></strong>
      <button id="share-room" class="small" type="button">Share invite</button>
      <button id="leave-room" class="small ghost" type="button">Leave</button>
    </div>
    <section class="lobby-card" id="waiting-card">
      <p class="big-code" id="big-code" aria-hidden="true"></p>
      <p class="status" id="room-status"></p>
      <ul class="players" id="room-players" aria-label="Players"></ul>
      <p class="player-count" id="player-count"></p>
      <button id="start-game" type="button" hidden>Start game</button>
      <div class="share-row">
        <button id="copy-link" class="small ghost" type="button">Copy invite link</button>
      </div>
      <p class="invite-link" id="invite-link"></p>
    </section>
    <div class="game-root" id="game-root"></div>
    <button id="play-again" class="small" hidden>Play again</button>
  </main>
  <div class="splash" id="splash" role="dialog" aria-modal="true" aria-labelledby="splash-title" hidden>
    <div class="splash-card">
      <div class="splash-emoji" id="splash-emoji" aria-hidden="true"></div>
      <h2 id="splash-title"></h2>
      <p id="splash-text"></p>
      <p class="record" id="splash-record"></p>
      <div class="share-row">
        <button id="splash-share" type="button">Brag about it</button>
        <button id="splash-rematch" class="ghost small" type="button">Rematch</button>
        <button id="splash-close" class="ghost small" type="button">See the board</button>
        <button id="splash-lobby" class="ghost small" type="button">Back to lobby</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast" role="status" hidden></div>
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
// Wins in a row this visit; shown in the header and the result splash.
let streak = 0;
let gameOver = false;

// ---- Toast ----
let toastTimer: number | undefined;
function showToast(text: string) {
  const toast = $("toast");
  toast.textContent = text;
  toast.hidden = true;
  void toast.offsetWidth;
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
    const chip = $("user-stats");
    chip.replaceChildren(
      avatar(me.username),
      text("span", me.username),
      recordEl(me.wins, me.losses)
    );
    if (streak >= 2) chip.append(text("span", `🔥 ${streak} streak`, "streak"));
  }
}

function text(tag: string, content: string, className?: string) {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

function avatar(name: string) {
  const el = text("span", name.slice(0, 1) || "?", "avatar");
  el.style.setProperty("--h", String(hueFor(name)));
  el.setAttribute("aria-hidden", "true");
  return el;
}

function recordEl(wins: number, losses: number) {
  const el = document.createElement("span");
  el.className = "rec";
  el.setAttribute("aria-label", `${wins} wins, ${losses} losses`);
  el.append(text("b", `${wins}W`), " · ", text("i", `${losses}L`));
  return el;
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
  authSubmit.textContent = resetting ? "Set new password" : registering ? "Create account" : "Log in & play";
  $("auth-title").textContent = resetting ? "New password" : registering ? "Claim your name" : "Jump in";
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
    ...games.map((game, i) => {
      const playable = game.id in clientGames;
      const flair = flairFor(game.id);
      const item = document.createElement("li");
      item.style.setProperty("--i", String(i));
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "game-tile";
      tile.disabled = !connected || !playable;
      tile.style.setProperty("--a", flair.a);
      tile.style.setProperty("--b", flair.b);
      const icon = text("span", flair.icon, "icon");
      icon.setAttribute("aria-hidden", "true");
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.append(
        text(
          "span",
          game.players.min === game.players.max
            ? `${game.players.min} players`
            : `${game.players.min}–${game.players.max} players`
        )
      );
      const record = me?.games[game.id];
      if (record && record.wins + record.losses > 0) {
        meta.append(text("span", `${record.wins}W ${record.losses}L`, "rec"));
      }
      const top = document.createElement("span");
      top.className = "tile-top";
      top.append(icon);
      if (flair.badge && playable) top.append(text("span", flair.badge, "badge"));
      tile.append(
        top,
        text("strong", game.name),
        text("span", game.description, "desc"),
        meta,
        text("span", playable ? "Create a room →" : "Not available in this version", "go")
      );
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
    // A rematch started by anyone in the room clears the result screen.
    if (!finished) hideSplash();
    $<HTMLButtonElement>("play-again").disabled = false;
    if (!finished) statsRefreshed = false;
    if (finished && !statsRefreshed) {
      statsRefreshed = true;
      void celebrate();
    }
  } else if (p.kind === "commentary") {
    guarded(() => screen?.commentary?.(p.text, p.round));
  }
}

// ---- Result splash ----
// The game view's shape belongs to each game, so the outcome is read from the
// player's record before and after the server stores the match.
async function celebrate() {
  const before = me ? { wins: me.wins, losses: me.losses } : null;
  const gameId = roomGameId;
  const after = await refreshMe();
  if (!before || !after || roomGameId !== gameId) return;
  if (after.wins > before.wins) {
    streak += 1;
    showSplash("win", gameId);
    confetti();
  } else if (after.losses > before.losses) {
    streak = 0;
    showSplash("lose", gameId);
    shake();
  }
  renderUserBar();
  renderGameList();
}

function showSplash(outcome: "win" | "lose", gameId: string | null) {
  const splash = $("splash");
  const win = outcome === "win";
  splash.classList.toggle("lose", !win);
  const wins = ["VICTORY", "FLAWLESS", "GG EZ", "LEGENDARY"];
  $("splash-emoji").textContent = win ? (streak >= 3 ? "🔥" : "🏆") : "💀";
  $("splash-title").textContent = win ? wins[Math.floor(Math.random() * wins.length)] : "DEFEAT";
  $("splash-text").textContent = win
    ? streak >= 2
      ? `${streak} wins in a row at ${gameName(gameId)}. Unstoppable.`
      : `You won at ${gameName(gameId)}. Let everyone know.`
    : `${gameName(gameId)} got you this time. Run it back?`;
  $("splash-record").textContent = me ? `Your record: ${me.wins}W · ${me.losses}L` : "";
  $("splash-share").textContent = win ? "Brag about it 📣" : "Challenge someone new";
  // After a loss, the rematch is the main ask; after a win, bragging is.
  $("splash-share").className = win ? "" : "ghost small";
  $("splash-rematch").className = win ? "ghost small" : "";
  $("splash-rematch").textContent = win ? "Rematch" : "Run it back 🔁";
  splash.hidden = false;
  (win ? $("splash-share") : $("splash-rematch")).focus();
}

function hideSplash() {
  $("splash").hidden = true;
}

function shareData(kind: "invite" | "brag") {
  const name = gameName(roomGameId);
  const site = `${location.origin}${location.pathname}`;
  if (kind === "invite") {
    return {
      title: `Play ${name} on WarBrowser`,
      text: `⚡ I challenge you to ${name}! Room ${roomCode} — tap to join:`,
      url: location.href
    };
  }
  const won = !$("splash").classList.contains("lose");
  return {
    title: "WarBrowser",
    text: won
      ? `🏆 Just won at ${name} on WarBrowser${streak >= 2 ? ` — ${streak} in a row 🔥` : ""}. Think you can beat me?`
      : `⚔️ Who wants to play ${name} on WarBrowser? Loser picks the next game.`,
    url: site
  };
}

/** Share sheet on phones, clipboard elsewhere. */
function share(kind: "invite" | "brag") {
  const data = shareData(kind);
  if (nativeShare(data)) return;
  const message = kind === "invite" ? data.url : `${data.text} ${data.url}`;
  if (copyInviteLink(message)) {
    showToast(kind === "invite" ? "Invite link copied — send it to a friend!" : "Copied! Paste it anywhere 🚀");
    return;
  }
  if (kind === "invite") selectInviteLink();
  showToast("Press Ctrl+C to copy");
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

  $("room-game").textContent = `${flairFor(roomGameId).icon} ${gameName(roomGameId)}`;
  $("room-id").textContent = roomCode;
  $("invite-link").textContent = location.href;
  // The waiting card (code, invite, players) is only useful before the game starts.
  $("waiting-card").hidden = screen !== null;
  renderBigCode(roomCode ?? "");
  renderPlayers();

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
  $("room-status").classList.toggle("waiting", !screen && !canStart && status.startsWith("Waiting"));
}

function renderBigCode(code: string) {
  const el = $("big-code");
  if (el.dataset.code === code) return;
  el.dataset.code = code;
  el.replaceChildren(
    ...[...code].map((ch, i) => {
      const span = text("span", ch);
      span.style.setProperty("--i", String(i));
      return span;
    })
  );
}

function renderPlayers() {
  const list = $("room-players");
  const items: HTMLElement[] = roomPlayers.map((name) => {
    const li = document.createElement("li");
    if (name === roomHost) li.className = "host";
    li.append(avatar(name), text("span", name === me?.username ? `${name} (you)` : name));
    return li;
  });
  const open = Math.max(0, roomMin - roomPlayers.length);
  for (let i = 0; i < open; i++) items.push(text("li", "Waiting for a challenger…", "empty"));
  list.replaceChildren(...items);
  $("player-count").textContent =
    roomMin === roomMax
      ? `${roomPlayers.length}/${roomMax} players`
      : `${roomPlayers.length} players · ${roomMin}–${roomMax} can play`;
}

function resetRoom() {
  hideSplash();
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
    ? "Live — pick a game or join a room"
    : "Disconnected from the server. Refresh to reconnect.";
  $("conn").classList.toggle("live", value);
  $("conn").classList.toggle("down", !value);
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
      hideSplash();
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
$("share-room").addEventListener("click", () => share("invite"));
$("splash-share").addEventListener("click", () => share("brag"));
$("splash-close").addEventListener("click", hideSplash);
$("splash-rematch").addEventListener("click", () => {
  hideSplash();
  $<HTMLButtonElement>("play-again").disabled = true;
  restartGame();
});
$("splash-lobby").addEventListener("click", () => {
  hideSplash();
  leaveRoom();
});
$("splash").addEventListener("click", (ev) => {
  if (ev.target === ev.currentTarget) hideSplash();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !$("splash").hidden) hideSplash();
});
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
    showToast("Invite link copied — send it to a friend!");
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
