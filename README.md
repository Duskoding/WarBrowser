# WarBrowser

## Overview

The game rules run on a server using our Java card library. The server handles player actions, determines round results, and keeps both browsers synchronized.

The project also includes a feature that calls an AI model through its API, such as a commentator that describes each round.

## Features

- Two-player gameplay in separate browsers
- Live card reveals and synchronized game updates
- Server-side game rules powered by the Java card library
- An AI-powered feature using a model API

## Deliverables

- A project specification using the provided template in `docs/SPEC.md`
- A working game demonstrated live in class

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

## Deploy

Run the Node.js server on a host that permits WebSocket connections and expose
it over HTTPS. The browser automatically uses secure WebSockets (`wss`) when
the page is served over HTTPS. Set `PORT` if the hosting platform provides a
specific listening port. For production, terminate TLS at the hosting
platform or a reverse proxy and forward WebSocket upgrades to this server.
WarBrowser is a live, two-player version of the card game War. Two players compete from separate browsers, with each card flip appearing on both screens at the same time.