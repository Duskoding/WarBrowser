# WarBrowser

WarBrowser is a site for live two-player browser games, starting with the card game War. Players create an account, choose a game, share a room link, and play from separate browsers, with game updates appearing in real time.

Games available now: **War**, **Tic-Tac-Toe**, and **Rock-Paper-Scissors**. Uno's server rules are also present, but its browser screen is not yet available.

## How it works

The server owns each game. It deals a 52-card deck for War, waits for simultaneous actions where needed, resolves rounds, and sends each player their own view. Browsers only send game actions and render what they receive, so neither player can cheat.

An AI commentator can add a short description after game events (War rounds and Tic-Tac-Toe moves) without blocking gameplay. Each game builds its own prompt; commentary is skipped when no API key is set.

## Features

- A lobby to choose which game to play
- Username and password accounts (register / log in)
- Shared game rooms for logged-in players (how many depends on the game), joined by room code or invite link; the host starts the game once enough players are in
- Player names on the table and a win–loss record on the lobby
- Live updates through WebSockets
- Server-controlled game state
- Standard War gameplay, including chained wars and the all-in case
- AI-generated commentary for War and Tic-Tac-Toe (optional, needs an Anthropic API key)

## War rules

- A standard 52-card deck is split 26/26 between two players.
- Both players flip their top card. The higher card wins both. Aces are high.
- A tie starts a war: each player puts up to 3 cards face-down, then flips again. The winner takes the whole pot, and a tie on that flip starts another war. A player with fewer than 4 cards flips whatever they have left.
- The winner's cards go to the bottom of their pile in random order.
- The game ends when one player holds all 52 cards.

## Project layout

| Path | What it is |
| --- | --- |
| `src/games/` | One module per game (`war/`, `tictactoe/`, `uno/`, `rps/`), the shared `GameModule` contract, and the list of games (`index.ts`) |
| `src/engine/GameEngine.ts` | Shared pure-engine interface; each game's engine lives in its game module |
| `src/auth.ts` | Local SQLite authentication used by tests and local fallback |
| `src/postgres-auth.ts` | PostgreSQL authentication, password resets, stats, and match records |
| `src/db.ts` | PostgreSQL pool and schema initialization |
| `src/commentator.ts` | Shared `ClaudeCommentator`: sends each game's prompt string to the Claude API |
| `server.js` | HTTP + WebSocket server: accounts, rooms and seats; runs whichever game a room was created for |
| `gui/` | The browser client (Vite + TypeScript), built into `gui/dist` and served by the server |
| `gui/src/games/` | One folder per game with that game's screen and styles, plus the list of games (`index.ts`) |
| `test/` | Server tests |
| `SPEC_v2.md` | The current specification, kept in line with the code |

## Run locally

Requires Node.js 24 or later.

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in two browser windows (use a private window for the second, so the two accounts don't share a login). Register (or log in) in each window, choose a game in one to create a room, then join it from the other with the room code or the invite link.

With no `DATABASE_URL`, local development and tests use the SQLite file at
`data/warbrowser.sqlite` (override the path with `DATABASE_PATH`). Render uses
PostgreSQL when `DATABASE_URL` is set. Passwords are hashed; database files are
gitignored.

### PostgreSQL deployment and migration

Link a Render PostgreSQL database to the web service so Render provides
`DATABASE_URL`, and set `NODE_ENV=production`. The server creates its schema on
startup. To transfer an existing local SQLite database, run:

```powershell
$env:DATABASE_URL = "your-postgres-url"
$env:SQLITE_PATH = ".\data\warbrowser.sqlite"
npm run migrate:users
```

Do not commit either connection string. Migrated users can log in once with
their existing password and are then required to choose a new password. Old
sessions are invalidated. PostgreSQL stores aggregate stats and a durable
`matches` record plus per-player `match_players` rows for every completed game,
including draws. Existing SQLite
databases contain aggregate totals but no detailed historical match records, so
those older matches cannot be reconstructed.

### Commentary (optional)

The game works without an API key; commentary is simply skipped. To turn it on, set the key in the same terminal before `npm start`:

```bash
export ANTHROPIC_API_KEY=your-key   # PowerShell: $env:ANTHROPIC_API_KEY = "your-key"
```

`ANTHROPIC_MODEL` overrides the default model (`claude-haiku-5-5`). Never commit your key; `.env` is gitignored, and tests never call the API.

Commentary is capped at one call per room every three seconds and 20 calls per game. The server-wide calls-per-minute cap defaults to 60; override it with `COMMENTARY_CALLS_PER_MINUTE`. Calls skipped by any limit are logged and do not affect gameplay.

### Client development

For client development, run `npm start` in one terminal and `npm run dev` in another. The dev server proxies the WebSocket to the game server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Runs the server (serves `gui/dist`) |
| `npm run build` | Type-checks and builds the client |
| `npm run dev` | Client dev server with hot reload |
| `npm run typecheck` | Type-checks the engine and the client |
| `npm test` | Builds the client, then runs engine and server tests |

## Adding a game

A game is two pieces with the same id: the rules on the server and the screen in the browser. The server takes care of accounts, rooms, invite links, seats and win/loss records. Tic-Tac-Toe is the smallest complete example to copy.

1. **Rules:** create `src/games/<id>/` with an engine that implements `GameEngine` (`src/engine/GameEngine.ts`) and a `GameModule` export (see `src/games/GameModule.ts`):
   - `id`, `name`, `description`, `players: { min, max }` (the room accepts joiners up to `max`; the host can start once `min` have joined).
   - `createEngine(context)` builds the pure rules engine. `handleAction(engine, seat, payload, context)` applies a player's action and returns `{ ok: false, error }`, or `{ ok: true }` with `finished: { winner }` on the action that ends the game (`winner` is a seat index, or `null` for a draw). Return `null` for a payload the game doesn't handle. `toView(engine, seat, players)` returns what that seat may see. For commentary, build a prompt string and call `context.commentator.describe(prompt)`.
2. **List it** in `games` in `src/games/index.ts`. It then appears in `GET /api/games` and the lobby.
3. **Screen:** create `gui/src/games/<id>/<id>.ts` exporting a `GuiModule` (see `gui/src/games/GuiModule.ts`): `mount(root, { send, setBackground })` draws the game into `root` and returns `applyState(view)` + `render()` (and optionally `commentary()` and `destroy()`); `isFinished(view)` tells the lobby to refresh win/loss stats. Send actions with `send({ kind: "...", ... })`. Put styles in `<id>.css` next to it and pass them as `styles` (`import styles from "./<id>.css?inline"`).

   Each game is drawn inside its own shadow root, so its HTML ids and CSS (even broad rules like `button { … }`) only apply inside that game, and the lobby's CSS doesn't change it. Shared defaults come from `gui/src/games/base.css`. To change the page background, call `setBackground(...)`; the lobby resets it when the game closes. Don't style `body` or other elements outside `root`.
4. **List the screen** in `clientGames` in `gui/src/games/index.ts`.
5. **Test:** add rules tests next to the game (like `src/games/tictactoe/tictactoe.test.ts`) and run `npm test`.

Win/loss records are shared across all games for now.

## Protocol

Messages are JSON over a WebSocket at `/ws`.

HTTP JSON endpoints (cookie session after register/login):

- `POST /api/register` and `POST /api/login` with `{ "username", "password" }`
- `POST /api/logout`
- `GET /api/me` → `{ "username", "wins", "losses" }`

WebSocket messages are JSON at `/ws`. The browser sends the session cookie on connect. Creating or joining a room requires a valid login.

- `GET /api/games` → `{ "games": [{ "id", "name", "description", "players": { "min", "max" } }] }`

- **Client → server:** `create_room` (`gameId`, default `"war"`), `join_room` (`roomCode`), `start_game` (host only, once `min` players have joined), `leave_room`, and `game_message` with a payload holding one of the game's actions: `{ "kind": "flip" }` in War, `{ "kind": "move", "cell": 0–8 }` in Tic-Tac-Toe.
- **Server → client:** `room_created` and `room_joined` (both include `gameId`, `host`, `players` — the current roster of usernames in join order — and `min`/`max`), `players_update` (`players`, sent when the roster changes before the game starts), `player_left` (`username`, sent on any disconnect or leave; a running game is discarded), `room_left`, `error`, and `game_message` with a payload of `{ "kind": "state", "view": ... }` (plus `{ "kind": "commentary", "text", "round" }` when a game supplies commentary). The game itself only starts, and `state` messages only begin, once the host sends `start_game`.

The state view is specific to each player and its shape belongs to the game. In War: your card, the opponent's card (shown as soon as they flip), the middle pile size, both card counts, both usernames, the phase (`waiting`, `flipped`, `war`, `roundOver`, `gameOver`), whether a war is on with the tied cards so far, how the last round ended, and the winner. In Tic-Tac-Toe: the board, your mark, whether it's your turn, the result and the winning line. In Uno (server rules and protocol only for now — no browser screen yet, see "Adding a game"): your hand, every seat's hand size, the discard pile's top card and active color, play direction, whose turn it is, the draw/discard pile sizes, and the winning seat.

## Deploy to Render

The repository includes a `render.yaml` Blueprint for the Node.js Web Service.

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and select the branch to deploy. Render will detect `render.yaml` and configure the service.
3. When prompted, enter your `ANTHROPIC_API_KEY` to enable commentary. Commentary is skipped if no key is set.
4. Deploy the service and copy its `https://` URL when it is ready.

The Blueprint sets:

- **Build command:** `npm ci --include=dev && npm run build`
- **Start command:** `npm start`
- **Node version:** 24 (matches `engines` in `package.json`)
- **Port:** Render supplies `PORT`, which the server reads.

The server serves the browser client and the `/ws` WebSocket endpoint. When the page is opened over HTTPS, the client uses secure WebSockets (`wss`) automatically.

On the free plan the service sleeps when idle, games are kept in memory, and the SQLite file lives on ephemeral disk, so a restart ends any game in progress and may reset accounts.

## Test with two computers

1. Open the Render URL in a browser on both computers. Do not use `localhost`, since that points to each computer itself.
2. On the first computer, register or log in, choose a game to create a room, and copy the displayed six-character room code or the invite link.
3. On the second computer, register or log in with a different account, then enter the code (or open the link) and join the room.
4. In War, both players click **Flip**. Confirm that each screen shows both cards after the second flip, the card counts update, and, if a key is set, a line of commentary appears after a resolved round. In Tic-Tac-Toe, take turns and confirm each move appears on both screens, and, if a key is set, commentary appears after moves.
