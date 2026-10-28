# WarBrowser

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

## Deploy

Run the Node.js server on a host that permits WebSocket connections and expose
it over HTTPS. The browser automatically uses secure WebSockets (`wss`) when
the page is served over HTTPS. Set `PORT` if the hosting platform provides a
specific listening port. For production, terminate TLS at the hosting
platform or a reverse proxy and forward WebSocket upgrades to this server.
