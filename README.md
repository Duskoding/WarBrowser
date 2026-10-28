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