# Decision log

## 2026-11-02 — Add agent guidance documentation

- **Decision:** Add a repository-root `AGENTS.md` documenting project conventions and require all person- or agent-made project decisions to be recorded in this file.
- **Made by:** agent (GitHub Copilot)
- **Reason:** The project needs durable, repository-local guidance so future agents can follow its Node.js, TypeScript, server-authoritative game, testing, and security conventions consistently.

## 2026-11-02 — Host several games, chosen from a lobby

- **Decision:** Turn the single-game site into a multi-game site: each game is a `GameDefinition` in `src/games/` (rules) plus a `ClientGame` in `gui/src/games/<id>/` (screen), `server.js` runs whichever game a room was created for, `create_room` takes a `gameId` (default `"war"`), room messages report it, and `GET /api/games` lists the games.
- **Made by:** user (requested multiple games with a lobby to choose one); design by agent (Claude Code)
- **Reason:** The team plans more games (a poker engine is in progress). One interface per side lets a game be added as new files without changing the server, the lobby or other games.

## 2026-11-02 — Add Tic-Tac-Toe as a second, example game

- **Decision:** Add Tic-Tac-Toe (`src/games/tictactoe.ts`, `gui/src/games/tictactoe/`) alongside War.
- **Made by:** agent (Claude Code)
- **Reason:** A second game that is turn-based and not card-based proves the game interfaces work beyond War and is the smallest complete example to copy. It can be removed by deleting its two files and its two registry entries.

## 2026-11-02 — Keep win/loss records and AI commentary as they were

- **Decision:** Win/loss records stay shared across all games (no per-game columns), and AI commentary stays War-only (its prompt is written for War).
- **Made by:** agent (Claude Code)
- **Reason:** Per-game records would need a database schema change, and game-neutral commentary needs a new prompt; both are separate decisions for the team.

## 2026-11-02 — Isolate each game's screen in a shadow root

- **Decision:** Draw each game inside its own shadow root, with its CSS applied as adopted stylesheets after shared defaults in `gui/src/games/base.css`. Games change the page background only through `setBackground`, which the shell resets, and errors thrown by a game's screen are caught by the shell.
- **Made by:** user (asked that the War redesign not affect the homepage or other games); approach by agent (Claude Code)
- **Reason:** Several people are styling different games at once. A shadow root keeps any game's CSS (including broad selectors like `button`) and HTML ids from reaching the lobby or other games, and keeps the lobby's CSS out of the games.

## 2026-11-02 — Keep the fixUi War redesign inside War only

- **Decision:** When merging `fixUi`, move its War table, war lineup and styling into `gui/src/games/war/`, and do not apply its site-wide restyle (header, buttons, login form, lobby, room bar, page background) to the lobby. Keep its two room-bar fixes (copy the invite link without selecting it; hide the link once the opponent joins). Load its Google Fonts on the page so the War screen can use them.
- **Made by:** agent (Claude Code), following the user's direction that the homepage is theirs and the War UI must not affect it
- **Reason:** The homepage owner is designing the lobby separately; the War redesign remains complete within War, and its site-wide styles stay in git history if the homepage owner wants to adopt any of them.

## 2026-11-02 — Make the preview run the real games

- **Decision:** The pretend server in `gui/preview/` now bundles and runs the games from `src/games/` instead of only relaying messages, with a quick-start button per game.
- **Made by:** agent (Claude Code)
- **Reason:** After game rules moved to the server, the preview could no longer play. Running the same game code keeps the preview correct as games are added.

## 2026-11-02 — Switch the agent guidance to multiple games

- **Decision:** Update `AGENTS.md`: describe the multi-game layout, replace "keep the single-game scope" with adding games through the game interfaces, and add the rule to keep game screens inside their shadow roots.
- **Made by:** agent (Claude Code), following the user's request for multiple games
- **Reason:** The single-game rule no longer matches the project, and leaving it would steer future agents against the current design.

## 2026-11-04 — Keep PostgreSQL storage in the multi-game server

- **Decision:** When merging PR #26 (PostgreSQL) into the multi-game branch, record matches through `recordPostgresMatch` from the game-agnostic `finished` result, using the room code from the player's socket. This also fixes `main`'s War path, which referenced an undefined `roomCode` and crashed the server process whenever a War game ended with a PostgreSQL database.
- **Made by:** agent (Claude Code), resolving merge conflicts at the user's request
- **Reason:** The multi-game server no longer has War-specific code, so PostgreSQL recording has to live in the shared game-over handling to work for every game. Verified against a local PostgreSQL 16 database: War and Tic-Tac-Toe games each recorded one match and the winner's and loser's stats.

## 2026-11-04 — Add Uno as the main game, alongside War

- **Decision:** Add Uno (2–4 players) to the existing site as its main game, first and featured in the lobby, while keeping War, Tic-Tac-Toe and the War commentator as they are. `create_room` without a `gameId` still means War.
- **Made by:** the user (Uno as the focus, keep the other games and the commentator, 2–4 players, minimal changes to War); implemented by agent (Claude Code)
- **Reason:** The team wants a more organised Uno version built on the same skeleton, without losing the ability to play War.

## 2026-11-04 — Rooms with a player range, started by the host

- **Decision:** `GameDefinition` gets an optional `minPlayers` and `create()` receives the seated player count. For games where `minPlayers` is below `players`, the server sends `room_players` on every join and leave, and the host (first player in the room) starts the game with `start_game`, or a rematch after a game ends. Fixed-size games keep the original behaviour and messages exactly, so War and Tic-Tac-Toe clients and tests are unchanged. Anyone leaving still ends the current game.
- **Made by:** agent (Claude Code)
- **Reason:** Uno needs 2–4 players, so "start when full" no longer works on its own; limiting the new events to such games avoids touching War's protocol.

## 2026-11-04 — Uno house rules

- **Decision:** One hand per game (no points). The starting card is always a number card; Wild Draw Four can always be played, with no challenge; Draw Two/Four don't stack; drawing is one card, which may be played straight away if it matches. Forgetting to call Uno can be caught by any other player (+2 cards) until the next card is played or drawn.
- **Made by:** agent (Claude Code)
- **Reason:** These are the common rules with the fewest extra prompts for players; each can be changed in `src/games/uno.ts` without touching the server.

## 2026-11-04 — Record games of three or more as one result per opponent

- **Decision:** When a game with more than two players ends, the winner is recorded as beating each other player: one win and one loss per opponent, in both SQLite stats and PostgreSQL `matches` rows. Two-player games are recorded exactly as before.
- **Made by:** agent (Claude Code)
- **Reason:** The existing match table and stats hold a winner and a loser per match; this fits Uno into them without a schema change. A dedicated multi-player match table can replace it later if the team wants placements.

## 2026-11-04 — Uno commentary not added yet

- **Decision:** The AI commentator stays War-only for now; Uno games have no commentary.
- **Made by:** agent (Claude Code)
- **Reason:** The commentator's prompt and input are written for War rounds. Adding Uno commentary means a new prompt and summary shape, best done as its own change.
