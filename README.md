# WarBrowser

WarBrowser is a live, two-player version of the card game War. Players join a room through a shared link and play from separate browsers, with game updates appearing in real time.

## How It Works

The server manages the deck, player cards, and game rules. Each player clicks to flip, and the server reveals the cards and resolves the round once both players have flipped.

An AI commentator provides short descriptions of completed rounds without interrupting gameplay.

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

- Shared game rooms for two players
- Live updates through WebSockets
- Server-controlled game state
- Standard War gameplay, including ties
- AI-generated round commentary
- No accounts required

## Planned Stack

- Node.js and TypeScript
- WebSockets using the ws library
- Claude API for AI commentary
- Render for hosting

## Game Rules

- A standard 52-card deck is split evenly between two players.
- The higher card wins the round. Aces are high.
- Matching cards trigger a war, with additional cards played to determine the winner.
- The winner collects the cards played.
- The game ends when one player holds all 52 cards.

## Specification

See [docs/SPEC.md](docs/SPEC.md) for the full project specification.