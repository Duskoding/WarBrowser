# WarBrowser

WarBrowser is a live, two-player version of the card game War. Players join a room through a shared link and play from separate browsers, with game updates appearing in real time.

## How It Works

The server manages the deck, player cards, and game rules. Each player clicks to flip, and the server reveals the cards and resolves the round once both players have flipped.

An AI commentator provides short descriptions of completed rounds without interrupting gameplay.

## Features

- Shared game rooms for two players
- Live updates through WebSockets
- Server-controlled game state
- Standard War gameplay, including ties
- AI-generated round commentary
- No accounts required

## Planned Stack

WarBrowser is the connection layer for playing War on two different computers.
It includes a small Node.js WebSocket server and a browser client that lets one
player create a room, another join with its six-character code, and both relay
JSON game messages to each other.

## Run locally

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in two browser windows. Create a room in one
   window and join it from the other with the displayed code.

The connection client is also available as `window.WarConnection` in
`public/client.js`. It provides `connect()`, `createRoom()`, `joinRoom(code)`,
`sendGameMessage(payload)`, `leaveRoom()`, and `disconnect()`. Game events are
delivered to the `onEvent` callback as `{ type: "game_message", payload }`.
War rules and card state are intentionally left to the game implementation.

## Deploy to Render

The repository includes a `render.yaml` Blueprint for the Node.js Web Service.

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and select the
   branch to deploy. Render will detect `render.yaml` and configure the service.
3. Deploy the service and copy its `https://` URL when it is ready.

Render supplies `PORT`, serves the browser client, and supports the `/ws`
WebSocket endpoint. When the page is opened over HTTPS, the client uses secure
WebSockets (`wss`) automatically.

## Test with two computers

1. Open the Render URL in a browser on both computers. Do not use
   `localhost`, since that points to each computer itself.
2. On the first computer, create a room and copy the displayed six-character
   room code.
3. On the second computer, enter the code and join the room.
4. Confirm that the first browser reports the opponent joined and that game
   messages appear in both browsers.

## Game Rules
- A standard 52-card deck is split evenly between two players.
- The higher card wins the round. Aces are high.
- Matching cards trigger a war, with additional cards played to determine the winner.
- The winner collects the cards played.
- The game ends when one player holds all 52 cards.

## Specification

See [docs/SPEC.md](docs/SPEC.md) for the full project specification.
