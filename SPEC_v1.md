# WarBrowser — Live War, Two Browsers

*Spec v1: the original spec, kept as documentation. Spec v2 contains the up-to-date specification information.*

Scope for this sprint (60 min): two anonymous players join a room via a shared link and play a live, server-authoritative game of War with an AI commentator. No accounts, no abstraction layers for hypothetical future games — just War, built directly.

## Stack

- **Language:** Node.js + TypeScript, full stack (server and client), single repo.
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

Server holds all state in memory, keyed by `roomId`. No database for this sprint.

`WarEngine`: holds the deck, both players' piles, and round state; exposes `flip(playerId)` and `getState()`. No interface/abstraction layer — just the one concrete class, since there's only one game.

## WebSocket protocol

### Client → Server

| type | payload | meaning |
| --- | --- | --- |
| `join` | `{ roomId }` | player connects to a room (creates it if it doesn't exist and has <2 players) |
| `flip` | `{}` | player flips their top card |

### Server → Client

| type | payload | meaning |
| --- | --- | --- |
| `state` | `{ yourCard, opponentCard, pile, scoreA, scoreB, phase }` | authoritative state after every change; `phase` is `waiting \| flipped \| war \| roundOver \| gameOver` |
| `commentary` | `{ text }` | AI-generated line about the round that just resolved |
| `error` | `{ message }` | room full, invalid move, etc. |

Both players always get an identical state broadcast (no hidden info beyond "opponent's card is face-down until both have flipped" — War has no secret info once revealed, so this is trivial to keep fair).

## War rules (this implementation)

- Standard 52-card deck, split 26/26, no jokers.
- Both players flip their top card simultaneously (server waits for both `flip` messages before resolving).
- Higher card takes both cards into the winner's pile. Ace high.
- Tie → "war": each player burns 3 cards face-down, then flips a 4th face-up. Winner of that flip takes all 8 (or more, if the 4th also ties — war chains). If a player has fewer than 4 cards left during a war, they flip whatever they have left (standard "all-in" tie-break).
- Game ends when one player holds all 52 cards, or (for sprint demo purposes) after a fixed round cap if you want a guaranteed-short demo — flag this as a `maxRounds` config, default off.

## AI commentator

- Fires server-side after each round resolves (not on every message — only on round resolution, to control cost).
- Prompt gets a compact summary: cards flipped, who won, running score, whether it was a war. Keep the prompt short and the requested output short (one sentence) — this is what keeps it cheap and low-latency.
- Commentary is broadcast via `commentary` message alongside/after the `state` message. If the API call is slow, don't block gameplay on it — `state` always goes out immediately; commentary arrives when it arrives.

## Team split (6 people) — proposed, reassign freely

1. **Game engine** — `WarEngine`: deck/shuffle/deal/flip/war logic, unit tests.
2. **Game engine (pair)** — same area, paired for speed given the 1-hour window; also owns the GameEngine interface shape.
3. **Server/realtime** — ws server, room manager, socket message handling, wiring GameEngine to sockets.
4. **Client UI** — board rendering, flip button, card/pile/score display, connecting to the socket.
5. **AI commentator integration** — Claude API call, prompt, wiring the commentary broadcast into the server.
6. **Deploy + QA** — Render setup, env vars/secrets (Claude API key), smoke-testing two-browser play, demo script.

## 60-minute build order

- **0–10 min:** scaffold repo (TS config, ws server listening, minimal static client), confirm everyone can run it locally. Agree on the message protocol above before splitting.
- **10–40 min (parallel):** 1&2 build `WarEngine` against the interface with unit tests; 3 builds room manager + socket wiring against a stubbed engine; 4 builds client UI against the message protocol (can fake server responses locally); 5 builds the Claude API call against a mocked round summary; 6 sets up the Render service and env vars.
- **40–55 min:** integrate everything — wire `WarEngine` into the server, client into real sockets, commentator into the real broadcast. Play a full game in two browser tabs.
- **55–60 min:** deploy to Render, smoke test from two separate machines/networks if possible, run the demo script.
