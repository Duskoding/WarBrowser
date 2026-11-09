# Decision log

## 2026-11-09 — Remount game screens when replay starts

- **Decision:** Treat the first non-finished state after a finished state as a new client match and remount the game screen before applying it.
- **Made by:** agent
- **Reason:** Game screens keep transient state such as commentary round counters and animation timers. Reusing the finished screen lets replay state inherit stale values, so a fresh screen lifecycle is required for reliable replay behavior across all games.

## 2026-11-09 — Replay finished games in the same room

- **Decision:** Add a `restart_game` WebSocket message that either seated player may send after a match is recorded as finished. The server recreates the same game module and engine for the existing roster, while the client shell shows a shared **Play again** button on game-over state.
- **Made by:** agent
- **Reason:** Players should be able to start another match without copying a new invite or rebuilding the room. Keeping the room and seats preserves the existing lifecycle and win/loss behavior, while replacing the engine prevents stale game state from leaking into the replay.

## 2026-11-09 — Port the remaining games from draft PR #70

- **Decision:** Port Goofspiel (`goofspiel`), Connect Four (`connect4`), Dots and Boxes (`dots`) and Battleship (`battleship`) from draft PR #70 onto the current `GameModule` contract, the same way as Crazy Eights and Go Fish: `players: { min: 2, max: 2 }`, no `rules` field (left for #67), and tests pass `players: 2` in the module context. Rock-Paper-Scissors is not ported: Efrat's own version (#60, PR #89) reached main first and is kept as is. The other issues (#61–#64) stay open for their assignees to review and close.
- **Made by:** agent
- **Reason:** With all seven games ported, this branch replaces PR #70, which cannot merge onto the n-player contract. Keeping the port mechanical (no rule changes) leaves rule review to each game's assignee.

## 2026-11-09 — Share one card module between War and future card games

- **Decision:** Add `src/games/shared/cards.ts` with the standard 52-card deck (`Card`, `Suit`, `Rank` types, `createDeck`, `fisherYates`, `parseCard`, `sortHand`, `cardName`). War imports its deck from there; `src/games/war/types.ts` re-exports the types and `WarEngine.ts` re-exports `createDeck`/`fisherYates` so existing imports keep working. Uno keeps its own 108-card deck because its cards differ. Shared view and commentary helpers for 2-player games go in `src/games/shared/view.ts`.
- **Made by:** agent
- **Reason:** Crazy Eights and Go Fish both need a standard deck, and duplicating it per game would drift. Uno's deck is not a standard 52-card deck, so forcing it onto the shared module would add complexity for no gain.

## 2026-11-09 — Port Crazy Eights and Go Fish from draft PR #70 instead of merging it

- **Decision:** Take the Crazy Eights (`crazy8`) and Go Fish (`gofish`) code from draft PR #70 (branch `claude/more-games`) by porting it onto the current `GameModule` contract rather than merging the branch. PR #70 stays open for its other five games, which need the same port.
- **Made by:** agent
- **Reason:** PR #70 was branched before games could declare a player range (`players: { min, max }`, see the 2026-11-08 entry for #33), so it cannot merge cleanly as-is. Porting the two games in a focused change keeps the shared contracts intact and lets these two land without waiting for the rest of the branch.

## 2026-11-09 — Limit Crazy Eights and Go Fish to two players

- **Decision:** Both games use `players: { min: 2, max: 2 }`. Their engines and screens assume exactly two seats.
- **Made by:** agent
- **Reason:** The rules as specified (one opponent's hand to ask, one opponent to pass play to, two-pass end condition in Crazy Eights) are defined for two players. Supporting more seats would need rules decisions (turn order, what a pass means across several players) that were not part of the requested scope. Games with more players can widen `players.max` later with their own rules.

## 2026-11-09 — Leave `rules` out of the ported games until issue #67

- **Decision:** The ported `GameModule` objects for Crazy Eights and Go Fish do not include the `rules` field that PR #70 added. The lobby "How to play" feature is tracked in issue #67, which is assigned to someone else, and will define that field.
- **Made by:** agent
- **Reason:** Adding `rules` now would define a contract that issue #67 owns. Leaving it out keeps this change to game rules and screens, and the field can be added to both games when #67 lands.
## 2026-11-09 — Close idle rooms without interrupting reconnect grace (#83)

- **Decision:** Track the last client message for every room and close rooms after `ROOM_IDLE_TIMEOUT_MS`, defaulting to 30 minutes. Send connected players a `room_closed` event with `reason: "idle"` so the client returns to the lobby, and defer cleanup while a room's reconnect grace deadline is active.
- **Made by:** agent
- **Reason:** Rooms otherwise remain in memory indefinitely when players stop interacting. A configurable timeout is testable and operationally safe, while the explicit grace-period check keeps this cleanup compatible with issue #78's reconnect lifecycle.

## 2026-11-09 — Cap AI commentary calls per room and server (#80)

- **Decision:** Route every room's commentary through a shared per-server limiter. Allow at most one call per room every three seconds and 20 calls per game, plus a server-wide sliding-window limit configured by `COMMENTARY_CALLS_PER_MINUTE` with a default of 60. Skipped calls resolve to no commentary and are logged without affecting gameplay.
- **Made by:** agent (GitHub Copilot)
- **Reason:** Commentary is optional and can otherwise create unbounded API spend during long games or across busy rooms. A shared limiter preserves the existing game-module contract, keeps gameplay non-blocking, and makes the server-wide budget explicit while still allowing tests to inject smaller deterministic limits.

## 2026-11-09 — Add Rock-Paper-Scissors game module (#60)

- **Decision:** Implement Rock-Paper-Scissors as a server `GameModule` and client `GuiModule`, with per-seat choice secrecy until both players pick, round wins tracked to a first-to-three match, and ties awarding neither player.
- **Made by:** agent (GitHub Copilot)
- **Reason:** Reuse the existing War simultaneous-reveal lifecycle while keeping RPS rules, state, and presentation isolated from the game-agnostic server and shared lobby.

## 2026-11-09 — Keep repository guidance and decision logs tracked (#54)

- **Decision:** Keep the repository-root `AGENTS.md` and `decision.md` files as tracked project files. Do not rename or remove either file during repository cleanup.
- **Made by:** agent (GitHub Copilot)
- **Reason:** `AGENTS.md` contains the contributor and agent conventions, while `decision.md` preserves the project's durable decisions. Both are active project documentation and must remain available to future contributors.

## 2026-11-09 — Add a work session log

- **Decision:** Add a repository-root `LOG.md` with a short entry format covering who worked, related issues, changes, and remaining work. Add one entry for each work session so the next person or agent can resume from the latest handoff.
- **Made by:** agent (GitHub Copilot)
- **Reason:** `decision.md` explains why project choices were made, but it does not capture the practical state of each session. A separate concise log preserves handoff context without mixing transient progress with durable design decisions.

## 2026-11-02 — Add agent guidance documentation

- **Decision:** Add a repository-root `AGENTS.md` documenting project conventions and the contribution workflow (preparation, focused implementation, safe editing, validation, documentation, diff review, secrets, ambiguity, and commit practices), and require all person- or agent-made project decisions to be recorded in this file.
- **Made by:** agent (GitHub Copilot), with scope confirmed by Efrat Kreslavskiy
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
## 2026-11-09 — Verify shared auth/session module (#38)

- **Decision:** Treat issue #38 as complete on the current architecture: SQLite users, sessions, authentication, and match-record helpers are already centralized in `src/auth.ts`, and the server consumes them through that shared module without game-specific copies.
- **Made by:** agent
- **Reason:** Re-moving or duplicating the module would create unnecessary risk and violate the issue's “unchanged” requirement. This verification records the implementation state before continuing with the remaining assigned issues.

## 2026-11-09 — Verify generalized server lifecycle (#39)

- **Decision:** Treat issue #39 as complete on the current architecture: `server.js` owns static serving, API routing, room membership, WebSocket lifecycle, and protocol dispatch, while game-specific actions and views are supplied through `GameModule`.
- **Made by:** agent
- **Reason:** The server already resolves games through the shared registry and keeps room state independent of any game's message kinds. Replacing this working boundary without a concrete missing behavior would be an unrelated refactor.

## 2026-11-09 — Verify generalized test harness (#41)

- **Decision:** Treat issue #41 as complete on the current architecture: `test/server.test.js` provides reusable server startup, HTTP authentication, WebSocket connection/message queuing, room setup, and cleanup helpers shared by all game scenarios.
- **Made by:** agent
- **Reason:** The harness already exercises multiple game modules and player counts through common helpers. Extracting another layer without a remaining duplicated pattern would add indirection rather than improve coverage or maintainability.

## 2026-11-09 — Normalize PostgreSQL match history for variable player counts (#71)

- **Decision:** Keep the existing `matches` table as the match header, make its legacy two-player columns nullable for multi-player rows, and add `match_players` as the authoritative per-match player/seat/result table. Record every completed PostgreSQL game through one transaction, including draws and all player counts.
- **Made by:** agent
- **Reason:** A fixed pair of player columns cannot represent Uno or future games with more than two players. The junction table preserves existing two-player history compatibility while providing complete audit data for variable-sized matches.

## 2026-11-09 — Expose aggregate and per-game player statistics (#72)

- **Decision:** Add per-game `games` statistics to the user API while retaining aggregate `wins` and `losses`. Both SQLite and PostgreSQL update the aggregate and the selected game's counters atomically when a match has a winner; draws create no win/loss increments.
- **Made by:** user (selected compatibility-preserving API shape) and agent (implementation)
- **Reason:** Existing clients rely on aggregate fields, while game-specific totals need a stable map keyed by the registered game id. Keeping both avoids a breaking protocol change and supports historical aggregate data that predates per-game tracking.

## 2026-11-09 — Keep `connection.ts` in the shared lobby shell (#40)

- **Decision:** Treat issue #40 as done. Leave `gui/src/connection.ts` where it is. It is already the shared GUI socket client: `gui/src/main.ts` is the only importer, and game screens send through the shell. Do not add a `gui/src/infra/` or `gui/src/shared/` folder for it.
- **Made by:** agent
- **Reason:** PR #25 put this boundary in place by moving game screens under `gui/src/games/` and keeping `connection.ts` in the shared lobby shell. Issue #40 was filed after that pull request merged. It is one task under parent issue #27 (extract the shared core), which stays open. Moving the file now would only change import paths and the preview alias.

## 2026-11-09 — Uno GUI module (#36)

- **Decision:** Build Uno's screen as a self-contained `GuiModule` in `gui/src/games/uno/` against the view `main` already sends, with no server or protocol changes. The client works out which cards are playable (same rule as `UnoEngine.canPlay`) only to highlight them; the server still validates every move. Cards are shown sorted by color but sent by their server hand index. Each move gets a built-in line in the commentary box, worked out by comparing consecutive views, and AI commentary for the same `round` replaces it. Card styles stay in `uno.css` for now rather than the unmerged `gui/src/games/shared/` card module from the Crazy Eights branch.
- **Made by:** user (Ariella, GUI owner for #36) asked for it; design choices by agent
- **Reason:** Keeps Uno's GUI independent of the Uno engine owner's work and of unmerged branches, and gives a readable game without an API key. Moving card drawing into the shared module can follow once that module is on `main`.

## 2026-11-09 — Resolve the new games onto current main (#59)

- **Decision:** Keep main's `GameModule` (`players: { min, max }`, no How to play `rules` list), its lobby, and the games already there, including Uno. Add Nim as a two-player module in that shape. Put Battleship fleet placement back on main's Battleship: a `place` action, plus drag and Rotate on the existing setup row. Leave out the preview page main removed, and the older Rock-Paper-Scissors tests that no longer match main's engine.
- **Made by:** agent
- **Reason:** Pull request #94 conflicted because main had already landed the other games and a newer module contract. Nim (#77) and player-placed fleets (#81) were the parts still missing.

## 2026-11-09 — Shell UI redesign: clean "game night" look with share and result moments

- **Decision:** Redesign the shell (`gui/src/main.ts`, `gui/src/style.css`) and the shared in-game defaults (`gui/src/games/base.css`, `shared/shared.css`) around flat dark surfaces, one coral accent and Bricolage Grotesque headings: a top bar, a sign-in hero with fanned CSS playing cards, game tiles with a per-game tinted icon and optional badge (`gui/src/flair.ts`), a waiting card with the room code in large tiles and player chips, a "Share invite" button (native share sheet on touch devices, clipboard elsewhere), and a win/lose splash with confetti and a "Brag about it" share (`gui/src/fx.ts`). The outcome is read from the player's win/loss record before and after the match is stored, so no game view or protocol changes are needed. A first neon/synthwave pass was dropped after the user found it odd-looking.
- **Made by:** user (asked for an "explosive and viral" UI and rejected the neon pass) and agent (design and implementation)
- **Reason:** Sharing a room and celebrating a win are the moments that spread a two-player game; doing them in the shell gives every game the same treatment without touching game modules, the server or the room protocol. Motion is limited and honours `prefers-reduced-motion`.

## 2026-11-09 — Keep the green felt as the site color

- **Decision:** Use a felt green as the shell background (first the original `#1f6b3a`; lightened to `#2f8f52` after the user found it too dark, with per-game link colors brightened to stay readable), with darker felt surfaces and the original gold (`#f5c542`) for buttons and highlights, in place of the dark-and-coral palette from the redesign. Layout and features from the redesign stay.
- **Made by:** user (asked to keep the green) and agent (gold accent, surface shades)
- **Reason:** The team likes the green; gold was the site's original button color and reads well on felt, where coral clashed.

## 2026-11-09 — Center a partly filled last row of lobby games

- **Decision:** Lay out the lobby game list with wrapping flex rows (4/3/2/1 columns by width) and center them, so a last row with fewer games sits in the middle instead of at the left.
- **Made by:** user
- **Reason:** With ten games, the last two looked stranded on the left.

## 2026-11-09 — Rematch from the result screen

- **Decision:** After merging the "Play again" replay from `main` (#96), the win/lose screen also offers a rematch that sends the same `restart_game` message. It is the main button after a loss ("Run it back"), a secondary one after a win, and any new unfinished game state closes the result screen for everyone.
- **Made by:** agent
- **Reason:** A rematch is the obvious next step from the result screen; reusing the existing replay message needs no protocol change.

## 2026-11-09 — Keep both decision logs when main moves again (#59)

- **Decision:** When `LOG.md` and `decision.md` conflict with newer main, keep this branch's Nim and Battleship entries and main's later shell, felt, lobby, and rematch entries.
- **Made by:** agent
- **Reason:** Both sides are records of work that already happened. Dropping either would lose the history.

## 2026-11-09 — Complete the lobby game records (#73)

- **Decision:** Use the redesigned lobby's record display on every game tile, including 0 wins and 0 losses for an unplayed game. Refresh tiles with the overall record after a match, and save the result before sending the final view that triggers the refresh.
- **Made by:** agent (Codex)
- **Reason:** Players can see a record for every game, and the refresh reads the saved result even if PostgreSQL is still processing the match.
