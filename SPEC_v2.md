# WarBrowser — Live War, Two Browsers

*Spec v2: the original spec, updated where the code in this repository differs from it. Everything not listed under "Changes from v1" at the end is unchanged.*

Scope for this sprint (60 min): two anonymous players join a room via a shared link and play a live, server-authoritative game of War with an AI commentator. No accounts, no abstraction layers for hypothetical future games — just War, built directly.

## Stack

- **Language:** Node.js (24 or later) + TypeScript, full stack (server and client), single repo. The engine, commentator and client are TypeScript; the server entry point (`server.js`) is plain JavaScript that imports the TypeScript engine directly (Node 24 runs `.ts` natively, so there is no server build step).
- **Realtime:** WebSockets (`ws` library — no need for Socket.IO's extra features at this scope).
- **Hosting:** Render (one Web Service running the Node process; it serves the static client build and the WebSocket on the same port).
- **AI commentator:** Claude API (Haiku-class model, short prompt, fired once per round — optimizes for cost/latency over depth).

## Architecture

```
Browser A ──ws──┐                  ┌── ws── Browser B
                 │                  │
                 ▼                  ▼
            ┌─────────────────────────┐
            │       Node server        │
            │  - Room manager (Map)    │
            │  - GameEngine (per room) │
            │  - Claude API client     │
            └─────────────────────────┘
```

Server holds all state in memory, keyed by room code. No database for this sprint.

`WarEngine`: holds the deck, both players' piles, and round state; exposes `flip(playerId)` and `getState(playerId)`.

**Multiple games:** each game is a `GameDefinition` in `src/games/` (`id`, `name`, `description`, `players`, and `create()` returning a session with `view(seat, players)` and `act(seat, payload)`), listed in `src/games/index.ts`. `src/games/war.ts` wraps `WarEngine`; `src/games/tictactoe.ts` is a second, small game. A room is created for one game and the server runs that game's session once the room is full. In the browser, each game has a screen in `gui/src/games/<id>/` listed in `gui/src/games/index.ts`, and the lobby lists the games from `GET /api/games`.

## WebSocket protocol

### Client → Server

| type | payload | meaning |
| --- | --- | --- |
| `create_room` | `{ gameId? }` | player creates a room for a game (default `"war"`) and receives a 6-character room code |
| `join_room` | `{ roomCode }` | player joins an existing room, up to the game's `max` player count (the invite link `?room=CODE` joins automatically) |
| `start_game` | `{}` | host-only; starts the room's game once at least `min` players have joined |
| `leave_room` | `{}` | player leaves their room |
| `game_message` | `{ payload }` | carries a game action: `{ kind: "flip" }` in War, `{ kind: "move", cell }` in Tic-Tac-Toe |

### Server → Client

| type | payload | meaning |
| --- | --- | --- |
| `room_created` / `room_joined` | `{ roomCode, gameId, host, players, min, max }` | confirms the player is in a room, which game it is for, the current roster (join order), and who the host is |
| `players_update` | `{ players }` | roster changed while waiting for the host to start |
| `player_left` / `room_left` | `{ username }` / `{}` | a player disconnected or left; any running game is discarded, and the room stays open for a replacement to join |
| `game_message` | `{ payload: { kind: "state", view } }` | authoritative state after every change; `view` is `{ yourCard, opponentCard, pile, yourCount, opponentCount, phase, inWar, warCards, lastRound, winner? }` and `phase` is `waiting \| flipped \| war \| roundOver \| gameOver` |
| `game_message` | `{ payload: { kind: "commentary", text, round } }` | AI-generated line about the round that just resolved |
| `error` | `{ message }` | room full, invalid move, etc. |

Each player gets their own view of the same state (`yourCard`/`opponentCard` and the two counts swap per player; `winner` is `"you"` or `"opponent"`). There is no private information in War: each player sees the other's card the moment it is flipped, even if they have not flipped yet, so the two views always show the same cards. Clients cannot send `state` or `commentary`; only the server can.

Three view fields make a war readable on screen: `inWar` stays `true` for the whole war (the phase alone is not enough, because it becomes `flipped` as soon as one player flips their war card), `warCards` lists the tied pairs so far as `{ yours, opponent }` (more than one when wars chain), and `lastRound` — `{ wasWar, winner: "you" | "opponent" | null, cardsWon }` — describes the round that just resolved until the next flip starts a new one.

## War rules (this implementation)

- Standard 52-card deck, split 26/26, no jokers.
- Both players flip their top card simultaneously (server waits for both `flip` messages before resolving).
- Higher card takes both cards into the winner's pile. Ace high. Won cards go to the bottom of the winner's pile in random order.
- Tie → "war": each player burns 3 cards face-down (the server does this automatically), then each sends one more `flip` for the face-up card. The tied cards stay on screen for the whole war (as `warCards`), and the UI keeps its war banner until the war resolves and then reports who won it and how many cards they took. Winner of that flip takes the whole pot — the tied cards, the burned cards and the new flips (10 cards for a single war), or more if the new flips also tie — war chains. If a player has fewer than 4 cards left during a war, they burn what they can and flip whatever they have left, always keeping one card to flip (standard "all-in" tie-break). A player with no card left to continue after a tie loses the war; if both are out, the game is a draw.
- Game ends when one player holds all 52 cards, or (for sprint demo purposes) after a fixed round cap if you want a guaranteed-short demo — flag this as a `maxRounds` config, default off (an engine option; the server does not enable it).

## AI commentator

- Fires server-side after each round resolves (not on every message — only on round resolution, to control cost).
- Prompt gets a compact summary: cards flipped, who won, running score, whether it was a war. Keep the prompt short and the requested output short (one sentence) — this is what keeps it cheap and low-latency.
- Commentary is broadcast to both players as a `game_message` with `kind: "commentary"` (tagged with the round number) alongside/after the `state` message. If the API call is slow, don't block gameplay on it — `state` always goes out immediately; commentary arrives when it arrives.

## Team split (5 people) — proposed, reassign freely

1. **Game engine (one person)** — `WarEngine`: deck/shuffle/deal/flip/war logic, unit tests; also owns the engine's types.
2. **Server/realtime** — ws server, room manager, socket message handling, wiring GameEngine to sockets.
3. **Client UI** — board rendering, flip button, card/pile/score display, connecting to the socket.
4. **AI commentator integration** — Claude API call, prompt, wiring the commentary broadcast into the server.
5. **Deploy + QA** — Render setup, env vars/secrets (Claude API key), smoke-testing two-browser play, demo script.

## 60-minute build order

- **0–10 min:** scaffold repo (TS config, ws server listening, minimal static client), confirm everyone can run it locally. Agree on the message protocol above before splitting.
- **10–40 min (parallel):** 1 builds `WarEngine` against the interface with unit tests; 2 builds room manager + socket wiring against a stubbed engine; 3 builds client UI against the message protocol (can fake server responses locally); 4 builds the Claude API call against a mocked round summary; 5 sets up the Render service and env vars.
- **40–55 min:** integrate everything — wire `WarEngine` into the server, client into real sockets, commentator into the real broadcast. Play a full game in two browser tabs.
- **55–60 min:** deploy to Render, smoke test from two separate machines/networks if possible, run the demo script.

## Changes from v1

What changed from the original spec, and why:

- **Stack:** the server entry point is plain JavaScript rather than TypeScript, importing the TypeScript engine directly. Node 24 runs `.ts` natively, so the server needs no build step; the trade-off is that Node 24 or later is required.
- **Protocol:** `join { roomId }` and top-level `flip` / `state` / `commentary` became `create_room` / `join_room` / `leave_room` plus a `game_message` envelope. The room server and client were built first as a generic two-player relay, and the engine was integrated behind it instead of rewriting both.
- **Rooms:** a server-generated 6-character code (with a shareable `?room=CODE` link) replaced a caller-chosen `roomId`, so players can't collide on a name.
- **State:** each player gets a view relative to themselves (`yourCount` / `opponentCount`) instead of `scoreA` / `scoreB`; the engine's own `getState(playerId)` still returns `scoreA` / `scoreB` plus `round` and `winner`, and the server converts it.
- **Card visibility:** v1 kept the opponent's card face-down until both players had flipped. v2 shows each flipped card to the opponent immediately, because War has no private cards and players expect to see each other's flips as they happen.
- **Commentary:** carries the round number, so the client can ignore a slow reply for an older round.
- **War:** the burn is automatic and each player sends one flip after it; the tied cards, a war flag and the result of the last round are part of the state view, so the UI shows the whole war instead of only the moment of the tie; the winner's collected cards are shuffled before they go to the bottom of their pile, which prevents endless identical cycles.
- **Game end:** a draw (both players out of cards) is possible and has no winner.
- **Team:** the game engine was built by one person, so the two engine roles became one and the build order refers to 5 roles.
- **Repo:** the client and server share one root `package.json` (one install, one build), and `render.yaml` defines the Render service.
- **Multiple games:** v1 deliberately built only War, with no abstraction for future games. The site now hosts several games: a lobby to choose one, a `GameDefinition` interface on the server and a `ClientGame` interface in the browser, with War moved onto them unchanged and Tic-Tac-Toe added as a second game. `create_room` takes a `gameId`, room messages report it, and `GET /api/games` lists the games. Win/loss records are shared across games.
