# WarBrowser

WarBrowser is a live, two-player version of the card game War. Players join a room through a shared link and play from separate browsers, with game updates appearing in real time. No accounts are needed.

## How it works

The server owns the game. It deals a 52-card deck, waits for both players to flip, resolves the round, and sends each player their own view of the table. Browsers only send "flip" and render what they receive, so neither player can cheat.

An AI commentator will add short descriptions of completed rounds without blocking gameplay.

## Run the game in your browser (Windows)

### First-time setup

1. Install **Node.js LTS** from [nodejs.org](https://nodejs.org/). After installing, close and reopen Command Prompt.
2. Open **Command Prompt**. Do not close this window while the game is running.
3. Change to the project folder:

   ```cmd
   cd /d C:\Users\efrat\IdeaProjects\WarBrowser
   ```

4. Install the server dependencies:

   ```cmd
   npm install
   ```

5. Install the browser-client dependencies:

   ```cmd
   npm --prefix gui install
   ```

### Build and start the server

Run this every time after changing the code:

```cmd
npm run build
npm start
```

Wait for this message before opening the browser:

```text
WarBrowser listening on http://localhost:3000
```

Keep this Command Prompt window open. The running server provides the web page and the live WebSocket connection.

### Open two players

1. Open a browser and visit:

   ```text
   http://localhost:3000/?room=demo
   ```

2. Open a second browser window or an incognito/private window and visit the **same URL**.
3. Click **Flip** in both browsers. The server waits until both players flip, then updates both screens.
4. To create another game room, use a different room name in both browsers, such as:

   ```text
   http://localhost:3000/?room=classroom
   ```

The game currently supports two players per room. A third browser using the same room receives a room-full error.

### Enable Claude commentary

The game works without an API key, but commentary is skipped. To enable the Claude commentator, set your key in the same Command Prompt window **before** starting the server:

```cmd
set ANTHROPIC_API_KEY=your-real-anthropic-api-key
npm start
```

Do not commit or share your API key. The `set` command only applies to the current Command Prompt window. If you open a new window, set it again.

### Stop the server

Return to the Command Prompt window running the server and press:

```text
Ctrl+C
```

If the Command Prompt window is closed or the server is stopped, `localhost:3000` shows a connection-refused error until you run `npm start` again.

## Features

- Shared game rooms for two players, joined by room code or invite link
- Live updates through WebSockets
- Server-controlled game state
- Standard War gameplay, including chained wars and the all-in case
- AI-generated round commentary (in progress)

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
| `server.js` | HTTP + WebSocket server: rooms, seats, and wiring the engine to sockets |
| `gui/` | The browser client (Vite + TypeScript), built into `gui/dist` and served by the server |
| `test/` | Server tests |
| `SPEC.md` | The original project specification |

## Run locally

Requires Node.js 24 or later.

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in two browser windows. Create a room in one, then join it from the other with the room code or the invite link.

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

- **Client → server:** `create_room`, `join_room` (`roomCode`), `leave_room`, and `game_message` with a payload of `{ "kind": "flip" }`.
- **Server → client:** `room_created`, `room_joined`, `opponent_joined`, `opponent_disconnected`, `room_left`, `error`, and `game_message` with a payload of `{ "kind": "state", "view": ... }`.

The state view is specific to each player: your card, the opponent's card (hidden until both have flipped), the middle pile size, both card counts, the phase (`waiting`, `flipped`, `war`, `roundOver`, `gameOver`) and the winner.

## Deploy

Run the Node.js server on a host that supports WebSockets, such as Render.

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Node version:** 24 or later (set by `engines` in `package.json`)
- **Port:** the server reads `PORT` from the environment.

<<<<<<< HEAD
The browser automatically uses `wss` when the page is served over HTTPS.
=======
## Game Rules

- A standard 52-card deck is split evenly between two players.
- The higher card wins the round. Aces are high.
- Matching cards trigger a war, with additional cards played to determine the winner.
- The winner collects the cards played.
- The game ends when one player holds all 52 cards.

## Specification

See [docs/SPEC.md](docs/SPEC.md) for the full project specification.
>>>>>>> 6f99b8f94a76ecd356dc8a120372270be9562072
