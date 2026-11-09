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

## 2026-11-04 — Specify a common pure-engine interface (#45)

- **Decision:** Add a shared `GameEngine<TState, TAction, TResult>` contract in `src/engine/GameEngine.ts` with `apply(seat, action)` returning an `EngineResult` union (`{ ok: false; error }` | `{ ok: true; finished? }`) and per-seat `getState(seat)`. Seats are numeric (`0 .. n-1`). This change is specify-only: WarEngine and Tic-Tac-Toe are not refactored to implement it yet; adoption happens in later issues (#29/#48 for War, #34 for Uno). The server continues to talk to `GameDefinition` / `GameSession` (#46).
- **Made by:** agent
- **Reason:** Issue #28/#45 needs a pure rules layer below the server game-module shape so War and future games (Uno) share one action/result/state pattern without networking concerns.

## 2026-11-04 — Specify a common server game-module shape (#46)

- **Decision:** Add a shared `GameModule` contract in `src/games/GameModule.ts` with named `createEngine`, `handleAction`, and `toView`, typed against `GameEngine` (#45), plus win/record via `finished` on the action result (no separate `onFinished` callback). This is specify-only: live `GameDefinition` / `GameSession`, War, Tic-Tac-Toe, and `server.js` stay unchanged until later adoption issues (engines still need to implement `GameEngine` then).
- **Made by:** agent
- **Reason:** Issue #28/#46 needs an explicit server plugin boundary above `GameEngine` so games expose factory, action handling, per-seat views, and end-of-game signaling in one shape without folding those jobs into opaque session closures.

## 2026-11-04 — Specify a common GUI module shape (#47)

- **Decision:** Add a shared `GuiModule` contract in `gui/src/games/GuiModule.ts` with named entry point (`mount`), session/state (`applyState`), and `render` on the mounted screen, plus optional `commentary` / `destroy` and `isFinished`. This is specify-only: live `ClientGame` / `GameScreen`, War, Tic-Tac-Toe, and `main.ts` stay unchanged until later adoption issues.
- **Made by:** agent
- **Reason:** Issue #28/#47 needs an explicit client plugin boundary so each game's screen separates mount, state apply, and paint the same way the server module separates factory, actions, and views.

## 2026-11-04 — Refactor War and Tic-Tac-Toe onto the game-plugin contracts (#29)

- **Decision:** Full cutover from `GameDefinition`/`ClientGame` to `GameEngine` + `GameModule` + `GuiModule` for War and Tic-Tac-Toe. Move War engine/types/tests into `src/games/war/` and TTT into `src/games/tictactoe/`. Keep the lobby shell (`gui/src/main.ts`, etc.) shared. Promote commentary to shared: `Commentator.describe(prompt: string)`; each game builds its own prompt. `handleAction` takes `GameModuleContext` so modules can request commentary.
- **Made by:** agent
- **Reason:** Issues #29/#48–#51 (plus TTT) require adopting the #45–#47 contracts uniformly so both games and the server/GUI use one plugin shape before Uno and further shared-core work.

## 2026-11-09 — Keep a dropped connection in the room (#78)

- **Decision:** Any socket close while a player is in a room, including before the match starts, keeps that player's seat for a grace period instead of deleting the game. Moves are rejected until they return or the time runs out. Pressing Leave still ends the match immediately. After the grace period, the match is discarded the way a leave works today, and someone else can join for a new game.
- **Made by:** user
- **Reason:** A phone lock or a short network blip was ending the game for both players. The grace period should cover the waiting room as well as a match in progress, and the other player should not be able to keep playing alone.

## 2026-11-09 — How a dropped player gets their seat back (#78)

- **Decision:** The grace period is 60 seconds (`reconnectGraceMs` on the server, so tests can use a shorter wait). The open page keeps the room and retries the socket, then sends `join_room` for that room, which restores a reserved seat. A second connection is rejected with "You are already in this room." while the first socket is still open; if a retry arrives before the server has seen the drop, the page tries again. Opening the room link after the socket has dropped restores the same seat and the current view. Leave while offline reconnects only to send `leave_room` with the room code, which drops the reservation without resuming play. A different account cannot take a reserved seat. Joining or creating a different room abandons a seat this account still holds.
- **Made by:** agent
- **Reason:** The bug is a momentary drop while the page is still open, so the page should retry by itself. The room link still has to work for a refresh or another device once the old socket is gone. A live second connection stays rejected so two windows cannot fight over the seat.

