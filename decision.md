# Decision log

## 2026-11-09 — Keep repository guidance and decision logs tracked (#54)

- **Decision:** Keep the repository-root `AGENTS.md` and `decision.md` files as tracked project files. Do not rename or remove either file during repository cleanup.
- **Made by:** agent (GitHub Copilot)
- **Reason:** `AGENTS.md` contains the contributor and agent conventions, while `decision.md` preserves the project's durable decisions. Both are active project documentation and must remain available to future contributors.

## 2026-11-09 — Add a work session log

- **Decision:** Add a repository-root `LOG.md` with a short entry format covering who worked, related issues, changes, and remaining work. Add one entry for each work session so the next person or agent can resume from the latest handoff.
- **Made by:** agent (GitHub Copilot)
- **Reason:** `decision.md` explains why project choices were made, but it does not capture the practical state of each session. A separate concise log preserves handoff context without mixing transient progress with durable design decisions.

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

## 2026-11-08 — Make `GameModule.players` a range, started by the host (#33)

- **Decision:** Change `GameModule.players` from a fixed `number` to `{ min, max }`. A room now accepts joiners up to `max` and the host (the socket that created the room, or whoever is first in `room.sockets` after earlier departures) explicitly starts the match with a new `start_game` client message once at least `min` players have joined; the server no longer auto-starts a room the moment it hits a fixed count. War and Tic-Tac-Toe both become `{ min: 2, max: 2 }` (no behavior change for players beyond the extra click); Uno is planned as `{ min: 2, max: 8 }`. Replaced the two-player-only `opponent_joined` / `opponent_disconnected` protocol events with roster-based `players_update` (`{ players }`) and `player_left` (`{ username }`), and `room_created` / `room_joined` now carry the full roster, `host`, `min`, and `max` instead of a single `username`/`opponentUsername` pair. Updated `server.js`, the preview's `sim-server.ts`/`sim-connection.ts`, `gui/src/main.ts` (player list, host-only Start button, waiting-room status text), `gui/src/types.ts`, `gui/src/connection.ts`, `test/server.test.js`, `README.md`, and `SPEC_v2.md` accordingly.
- **Made by:** user (requested the range and host-triggered start) and agent (Claude Code), implementation
- **Reason:** Issue #33 (Uno's state/types) needs 2–8 players, which a fixed `players: number` and an auto-start-at-N room model can't express. A host-triggered start (rather than auto-starting at `min` or waiting for `max`) lets a room wait for more players without forcing every seat to fill first. This is a prerequisite for #33 but is a shared-contract change, so War and Tic-Tac-Toe adopt the same shape rather than special-casing Uno.
- **Known gap carried forward:** Postgres match recording (`recordPostgresMatch`) still hardcodes exactly two players (see #71); it is unaffected by this change and remains a blocker for recording results in any Uno match with more than two players.

## 2026-11-08 — Design Uno's state/types (#33)

- **Decision:** Add `src/games/uno/types.ts`: `Card` (`color: Color | null`, `rank`), `UnoState` (per-seat `hand`, every seat's `handCounts`, `discardTop` plus a separate `activeColor` for after a wild, `direction`, `currentSeat`/`yourTurn`, pile counts, `round`/`winner`/`over`), `UnoAction` (`play` with optional `chosenColor`, or `draw`), and a `UnoResult` shaped like Tic-Tac-Toe's (Uno resolves each action immediately; it has no War-style multi-player-wait state). Assumed four house-rule simplifications, documented in the file: no stacking Draw Two/Four, draw-one-and-pass (a drawn card is never auto-played), no enforced "Uno" call penalty, no Wild Draw Four challenge, and a player may draw even when holding a legal play.
- **Made by:** user (confirmed scope: 2+ players, deferred remaining rule calls to the agent) and agent (Claude Code), implementation
- **Reason:** #34 (`UnoEngine`) and #36 (Uno's GUI) both need these shapes agreed first; the house-rule assumptions are called out explicitly so they're easy to revisit rather than silently baked into the engine.

## 2026-11-08 — Implement UnoEngine (#34)

- **Decision:** Add `src/games/uno/UnoEngine.ts` implementing `GameEngine<UnoState, UnoAction, UnoResult>`, plus `UnoEngine.test.ts`. Constructor takes `(players: number, options?: UnoEngineOptions)` rather than hiding player count inside options, since `GameModule.createEngine(context)` doesn't yet pass a player count — wiring that through `GameModuleContext` is left to #35. 108-card deck built directly in this file (not the shared `src/games/shared/cards.ts` from draft PR #70, which isn't merged). The opening discard is redrawn until it isn't a wild. Turn advance is direction-aware (`seatAfter`/`advanceTurn`); Reverse explicitly special-cases exactly 2 players to act as Skip (mathematically a plain direction flip is a no-op with 2 seats, so the official "Reverse = Skip" rule has to be coded directly, not derived). Draw Two/Wild Draw Four draw into the seat after the current one, then skip that seat.
- **Made by:** agent (Claude Code)
- **Reason:** #34 needs the pure rules layer before #35 (server plugin) and #36 (GUI) can be built against it. Deferring the shared cards module avoids depending on unmerged work (see #33's note on PR #70/#69).

## 2026-11-08 — Fix two-player-only win recording for games with more than two players; implement Uno's server plugin (#35, #71 partial)

- **Decision:**
  - Added `GameModuleContext.players: number` (the room's actual seated count) so a variable-player-count engine like Uno's can be constructed correctly; `server.js`'s `start_game` handler and the preview's `sim-server.ts` now pass it.
  - **Fixed a real bug, not just Postgres:** the existing SQLite win-recording loop in `server.js` called `recordMatch(winnerId, loserId)` once per loser, incrementing the *winner's* win count once per opponent instead of once per game — harmless at exactly 2 players (1 loser) but wrong at 3+ (caught by this work's own 3-player Uno test, which found the host recorded 2 wins for 1 game). Replaced it with `recordWins(db, winnerId, loserIds)` in `src/auth.ts` (one win, N losses) and `recordPostgresWins` in `src/postgres-auth.ts` for the Postgres path. `recordMatch` is now a thin wrapper over `recordWins` for the 2-id case, kept for the existing test and 2-player call style.
  - **Postgres match history (option 1 from #71):** for a game with exactly 2 players, `recordPostgresMatch` still inserts an audit row into the 2-column `matches` table as before. For 3+ players, no audit row is inserted (the table can't represent it without a schema migration), but `recordPostgresWins` still updates every player's `wins`/`losses` correctly. A junction-table migration for full N-player match history is deferred as its own follow-up, not done here.
  - Added `src/games/uno/index.ts` (the `GameModule`: `id: "uno"`, `players: { min: 2, max: 8 }`, `createEngine` wiring the new context field into `UnoEngine`, `handleAction` for `play`/`draw` payloads, `toView` exposing hand/handCounts/discardTop/activeColor/direction/currentSeat/winnerSeat — raw seat numbers rather than War/Tic-Tac-Toe's "you"/"opponent" strings, since those don't generalize past 2 players) and `src/games/uno/prompt.ts` (commentary prompt). Registered `uno` in `src/games/index.ts`.
- **Made by:** agent (Claude Code); option 1 vs. the full migration for #71 was the user's call (minimal fix now, migration deferred)
- **Reason:** #35 explicitly includes "win recording," and Uno is the first game that can actually exceed 2 players, so the existing double-counting bug and the Postgres two-player-only schema both had to be addressed here rather than deferred further. `toView` uses seat numbers instead of "you"/"opponent" because Uno's GUI (#36) needs to display more than one opponent.
