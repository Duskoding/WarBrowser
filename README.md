# WarBrowser

WarBrowser is a live, two-player version of the card game War. Players join a room through a shared link and play from separate browsers, with game updates appearing in real time. No accounts are needed.

## How it works

The server owns the game. It deals a 52-card deck, waits for both players to flip, resolves the round, and sends each player their own view of the table. Browsers only send "flip" and render what they receive, so neither player can cheat.

An AI commentator adds a short description after each completed round without blocking gameplay.

## Features

- Shared game rooms for two players, joined by room code or invite link
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
| `src/commentator.ts` | `ClaudeCommentator`: one-sentence round commentary from the Claude API |
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

- **Client → server:** `create_room`, `join_room` (`roomCode`), `leave_room`, and `game_message` with a payload of `{ "kind": "flip" }`.
- **Server → client:** `room_created`, `room_joined`, `opponent_joined`, `opponent_disconnected`, `room_left`, `error`, and `game_message` with a payload of `{ "kind": "state", "view": ... }`.

The state view is specific to each player: your card, the opponent's card (hidden until both have flipped), the middle pile size, both card counts, the phase (`waiting`, `flipped`, `war`, `roundOver`, `gameOver`) and the winner.

## Deploy

Run the Node.js server on a host that supports WebSockets, such as Render.

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Node version:** 24 or later (set by `engines` in `package.json`)
- **Port:** the server reads `PORT` from the environment.
- **Commentary:** add `ANTHROPIC_API_KEY` as a secret environment variable (optional).

The browser automatically uses `wss` when the page is served over HTTPS.
