# WarBrowser — Live Browser Games

This is the current implementation specification for WarBrowser. The site hosts live, server-authoritative browser games in shared rooms. Players authenticate, choose a game in the lobby, share a room code or invite link, and receive real-time state over WebSockets.

The current server registry contains **War**, **Tic-Tac-Toe**, **Uno**, **Crazy Eights**, **Go Fish**, **Rock-Paper-Scissors**, **Goofspiel**, **Connect Four**, **Dots and Boxes**, **Battleship**, **Nim**, and **heads-up Hold'em**. Tic-Tac-Toe is the smallest complete example for adding another game.

## Stack

- **Language:** Node.js 24 or later, TypeScript for the game engines and browser client, and a JavaScript server entry point.
- **Realtime:** WebSockets through the `ws` library.
- **Hosting:** Render runs one Node.js web service that serves the built client and the WebSocket endpoint.
- **Persistence:** SQLite is the local fallback; PostgreSQL is used when `DATABASE_URL` is configured. Authentication, sessions, aggregate statistics, and completed match records are shared across games.
- **Commentary:** optional Claude API integration. Each game supplies a public-information prompt; commentary is non-blocking and skipped when no API key is configured.

## Architecture

```text
Browser A ── WebSocket ──┐                 ┌── WebSocket ── Browser B
                          ▼                 ▼
                    ┌────────────── Node server ──────────────┐
                    │ accounts, rooms, seats, protocol        │
                    │ selected GameModule + GameEngine        │
                    │ database records and optional commentary │
                    └─────────────────────────────────────────┘
```

The server owns room membership, lifecycle, authentication checks, game state, action validation, and match recording. A room is created for one game and uses that game's module for the match. The browser sends only game actions and renders the per-seat views returned by the server.

### Game extension contracts

Each game has a server module and a browser module with the same string id. The server remains game-agnostic.

- **`GameEngine`** (`src/engine/GameEngine.ts`) is the pure rules contract. An engine implements `apply(seat, action)` and `getState(seat)`. It has no sockets, HTTP, database, or commentary dependencies. `apply` returns `{ ok: false, error }` for invalid actions or `{ ok: true, finished?: { winner } }` when an action succeeds; `winner` is a seat index or `null` for a draw.
- **`GameModule`** (`src/games/GameModule.ts`) is the server plugin contract. It declares `id`, `name`, `description`, a `{ min, max }` player range, and optional `rules`. It creates an engine with `createEngine`, handles game payloads with `handleAction`, and maps engine state to a per-seat client view with `toView`. A module may request commentary by supplying a prompt to the shared commentator.
- **`GuiModule`** (`gui/src/games/GuiModule.ts`) is the browser plugin contract. `mount(root, context)` creates the game screen inside its shadow root and returns a screen with `applyState(view)` and `render()`, plus optional `commentary()` and `destroy()`. `isFinished(view)` tells the shared shell when to refresh match statistics. Game styles stay in the module's own CSS.

Both registries must list a new game: `src/games/index.ts` and `gui/src/games/index.ts`. `GET /api/games` is generated from the server registry and drives the lobby.

## Room lifecycle

1. A logged-in client sends `create_room` with a `gameId` (default `"war"`). The server creates a six-character room code and records the selected module.
2. Other logged-in clients send `join_room` with that code. The room accepts seats up to the module's `players.max`.
3. The host sends `start_game` once at least `players.min` seats are occupied. The server creates the module's engine and broadcasts the initial state.
4. Clients send game actions inside `game_message`. The server validates the action, applies it, and broadcasts a fresh per-seat view.
5. After a finished match, either seated player may send `restart_game` to create a fresh engine in the same room.
6. A dropped connection keeps that seat for 60 seconds and pauses moves. Leave, or the end of that grace period, discards a running game and keeps the room available for a replacement. Rooms with no client message close after the configured idle timeout, and an active reconnect grace period takes precedence.

## HTTP and WebSocket protocol

HTTP JSON endpoints use the cookie session established by registration or login:

- `POST /api/register` and `POST /api/login` with `{ "username", "password" }`
- `POST /api/logout`
- `GET /api/me` → `{ "username", "wins", "losses" }`
- `GET /api/games` → `{ "games": [{ "id", "name", "description", "players": { "min", "max" }, "rules"? }] }`

WebSocket messages are JSON at `/ws`. Creating or joining a room requires a valid login.

### Client → server

| Type | Payload | Meaning |
| --- | --- | --- |
| `create_room` | `{ gameId? }` | Create a room for the selected game; omitted `gameId` defaults to `"war"`. |
| `join_room` | `{ roomCode }` | Join an existing room up to its module's maximum player count. |
| `start_game` | `{}` | Host-only; start once the module's minimum player count has joined. |
| `restart_game` | `{}` | Start a fresh match after the current match finishes. |
| `leave_room` | `{ roomCode? }` | Leave the current room immediately. `roomCode` lets a dropped player leave the reserved seat without rejoining. |
| `game_message` | `{ payload }` | Carry a game-specific action, such as `{ kind: "flip" }` in War or `{ kind: "move", cell: 0–8 }` in Tic-Tac-Toe. |

### Server → client

| Type | Payload | Meaning |
| --- | --- | --- |
| `room_created` / `room_joined` | `{ roomCode, gameId, host, players, min, max }` | Confirm room membership, selected game, host, roster, and player range. |
| `players_update` | `{ players }` | Update the waiting-room roster before the match starts. |
| `player_reconnecting` / `player_reconnected` | `{ username }` | A dropped player still has their seat. Moves wait until they return or the 60-second grace period ends. |
| `player_left` | `{ username }` | A player left on purpose, or did not reconnect in time. A running game is discarded. |
| `room_left` | `{}` | The current client left its room. |
| `room_closed` | `{ reason: "idle" }` | The room expired after inactivity. |
| `game_message` | `{ payload: { kind: "state", view } }` | Authoritative state mapped for the receiving seat. |
| `game_message` | `{ payload: { kind: "commentary", text, round } }` | Optional public commentary from the selected game. |
| `error` | `{ message }` | Invalid room, action, lifecycle transition, or authentication-related request. |

Views are game-specific and may include private information for the receiving seat, but must never expose another player's hidden information. Clients cannot send `state` or `commentary`; only the server can.

## War rules

- A standard 52-card deck is split 26/26 between two players.
- Both players flip their top card. The higher card wins both; aces are high.
- A tie starts a war. Each player burns up to three cards face-down, then flips again. A player with fewer than four cards burns what is available and keeps a card to flip.
- A tied flip starts another war. The winner takes the whole pot, and collected cards are shuffled before going to the bottom of that player's pile.
- If both players run out of cards during a tie-break, the result is a draw. Otherwise the game ends when one player holds all 52 cards.

## Adding a game

1. Add `src/games/<id>/` with a `GameEngine` implementation and a `GameModule` export.
2. Register the server module in `src/games/index.ts`; its metadata and optional rules then appear in `GET /api/games`.
3. Add `gui/src/games/<id>/<id>.ts` exporting a `GuiModule`, with styles beside it. Render only inside the supplied shadow root and use `setBackground` for page background changes.
4. Register the screen in `gui/src/games/index.ts`.
5. Add engine tests next to the game and run `npm test`.

The server handles accounts, rooms, invite links, seats, lifecycle, and shared match records. A game module owns only its rules, actions, views, and optional commentary prompt.

## Deployment and validation

The Render Blueprint uses `npm ci --include=dev && npm run build` to build the client and `npm start` to serve the application. The server reads `PORT`; secure WebSockets are selected automatically when the page is served over HTTPS.

For local development:

```bash
npm install
npm run build
npm start
```

Use two browser windows with separate accounts to create and join a room. `npm run typecheck` checks the TypeScript contracts, and `npm test` builds the client before running the engine and server tests.
