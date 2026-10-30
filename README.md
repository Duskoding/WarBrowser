# WarBrowser

WarBrowser is a live, two-player version of the card game War. Players create an account, join a room through a shared link, and play from separate browsers, with game updates appearing in real time.

## How it works

The server owns the game. It deals a 52-card deck, waits for both players to flip, resolves the round, and sends each player their own view of the table. Browsers only send "flip" and render what they receive, so neither player can cheat.

An AI commentator adds a short description after each completed round without blocking gameplay.

## Features

- Username and password accounts (register / log in)
- Shared game rooms for two logged-in players, joined by room code or invite link
- Player names on the table and a win–loss record on the lobby
- Live updates through WebSockets
- Server-controlled game state
- Standard War gameplay, including chained wars and the all-in case
- AI-generated round commentary (optional, needs an Anthropic API key)

## Game rules

- A standard 52-card deck is split 26/26 between two players.
- Both players flip their top card. The higher card wins both. Aces are high.
- A tie starts a war: each player puts up to 3 cards face-down, then flips again. The winner takes the whole pot, and a tie on that flip starts another war. A player with fewer than 4 cards flips whatever they have left.
- The winner's cards go to the bottom of their pile in random order.
- The game ends when one player holds all 52 cards.

## Project layout

| Path | What it is |
| --- | --- |
| `src/engine/` | `WarEngine`: the rules and state, with no networking, plus its tests |
| `src/auth.ts` | Users, hashed passwords, sessions, and win/loss counts (SQLite) |
| `src/commentator.ts` | `ClaudeCommentator`: one-sentence round commentary from the Claude API |
| `server.js` | HTTP + WebSocket server: rooms, seats, and wiring the engine to sockets |
| `gui/` | The browser client (Vite + TypeScript), built into `gui/dist` and served by the server |
| `test/` | Server tests |
| `SPEC_v2.md` | The current specification, kept in line with the code |
| `SPEC_v1.md` | The original sprint specification |

## Run locally

Requires Node.js 24 or later.

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in two browser windows. Register (or log in) in each window, create a room in one, then join it from the other with the room code or the invite link.

Accounts are stored in a local SQLite file at `data/warbrowser.sqlite` (override the path with `DATABASE_PATH`). Passwords are hashed; the database is gitignored.

### Commentary (optional)

The game works without an API key; commentary is simply skipped. To turn it on, set the key in the same terminal before `npm start`:

```bash
export ANTHROPIC_API_KEY=your-key   # PowerShell: $env:ANTHROPIC_API_KEY = "your-key"
```

`ANTHROPIC_MODEL` overrides the default model (`claude-haiku-5-5`). Never commit your key; `.env` is gitignored, and tests never call the API.

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

## Protocol

Messages are JSON over a WebSocket at `/ws`.

HTTP JSON endpoints (cookie session after register/login):

- `POST /api/register` and `POST /api/login` with `{ "username", "password" }`
- `POST /api/logout`
- `GET /api/me` → `{ "username", "wins", "losses" }`

WebSocket messages are JSON at `/ws`. The browser sends the session cookie on connect. Creating or joining a room requires a valid login.

- **Client → server:** `create_room`, `join_room` (`roomCode`), `leave_room`, and `game_message` with a payload of `{ "kind": "flip" }`.
- **Server → client:** `room_created`, `room_joined`, `opponent_joined` (includes `username`), `opponent_disconnected`, `room_left`, `error`, and `game_message` with a payload of `{ "kind": "state", "view": ... }`.

The state view is specific to each player: your card, the opponent's card (hidden until both have flipped), the middle pile size, both card counts, both usernames, the phase (`waiting`, `flipped`, `war`, `roundOver`, `gameOver`) and the winner.

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
2. On the first computer, register or log in, create a room, and copy the displayed six-character room code or the invite link.
3. On the second computer, register or log in with a different account, then enter the code (or open the link) and join the room.
4. Both players click **Flip**. Confirm that each screen shows both cards after the second flip, the card counts update, and, if a key is set, a line of commentary appears.
