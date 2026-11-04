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

## 2026-11-04 — Add seven two-player games built from War and Tic-Tac-Toe logic (#59)

- **Decision:** Add Rock-Paper-Scissors (#60), Goofspiel (#61), Connect Four (#62), Dots and Boxes (#63), Battleship (#64), Crazy Eights (#65) and Go Fish (#66), each as a `GameEngine` + `GameModule` in `src/games/<id>/` and a `GuiModule` in `gui/src/games/<id>/`, listed in both registries. They are built on the `refactorWarAndTTT` branch and delivered as a draft pull request.
- **Made by:** user (Yosef Skolnick asked for every game that could be built with the current work, on the refactor branch, as a draft PR); choice of games by agent (Claude)
- **Reason:** Each game reuses something the site already has: War's both-players-act-then-reveal, Tic-Tac-Toe's turns and move checks, War's deck and shuffle, and per-seat views. Left out on purpose: Uno (#30 already belongs to the team), poker (on `claude/poker-game-requirements-j5u75v`, needs porting to the plugin contract), games for three or more players (match recording assumes two) and real-time games (the server has no clock).

## 2026-11-04 — Share the deck helpers instead of importing them from War (#69)

- **Decision:** Move `Suit`, `Rank`, `Card`, `createDeck()` and `fisherYates()` to `src/games/shared/cards.ts`, along with card parsing, sorting and naming helpers. War's `types.ts` and `WarEngine.ts` re-export them, so existing imports keep working. Add `src/games/shared/view.ts` for helpers every two-player view uses (result and actor relative to the viewer, player names, the commentary prompt opening).
- **Made by:** agent (Claude)
- **Reason:** Three of the new games use a standard deck, and Uno (#33/#34) will need the same draw/discard handling. Card games shouldn't depend on War's module to get a deck.

## 2026-11-04 — Add "How to play" rules to every game (#67)

- **Decision:** Add an optional `rules: string[]` to `GameModule`, return it from `GET /api/games` (as `[]` when a game has none), and show it on each lobby tile as a **How to play** link that opens the rules in place (`<details>`). Rules are written for all nine games. This is the only change to the lobby shell (`gui/src/main.ts`, `gui/src/style.css`).
- **Made by:** user (asked for a link in the UI); approach by agent (Claude)
- **Reason:** With nine games, players need to learn a game before starting a room. Keeping the rules in each `GameModule` means a new game brings its own rules and the lobby needs no game-specific code.

## 2026-11-04 — Commentary only for public, notable moments in the new games

- **Decision:** The new games ask for commentary only when something notable and public happens: each resolved round in Rock-Paper-Scissors and Goofspiel; the final move in Connect Four; a closed box in Dots and Boxes; a sunk ship in Battleship; a wild 8 or the winning card in Crazy Eights; a completed book in Go Fish. Prompts only use what both players can already see, and say "Player 1"/"Player 2" rather than usernames.
- **Made by:** agent (Claude)
- **Reason:** Commentary is sent to both players, so a prompt that mentioned a hand, a bid or a ship position would leak it. Commenting on every move would also multiply API calls (an earlier review flagged commentary cost).

## 2026-11-04 — Rule choices for the new games

- **Decision:**
  - Rock-Paper-Scissors: first to 3 round wins; a tied round counts for no one.
  - Goofspiel: Ace = 1 … King = 13; a tied bid carries the prize to the next round's winner; prizes still carried after round 13 go to no one.
  - Connect Four: 7 × 6 board.
  - Dots and Boxes: 4 × 4 boxes; 8–8 is a draw.
  - Battleship: 10 × 10 with fleet 5, 4, 3, 3, 2. Fleets are placed at random and re-shuffled until the player presses Ready (no drag-and-drop placement). Turns alternate after every shot, hit or miss.
  - Crazy Eights: 7 cards each; draw one card per turn, then play or pass; the discard pile is reshuffled into the draw pile when it runs out; if nobody can play or draw, two passes in a row end the game and fewer cards wins.
  - Go Fish: 7 cards each; drawing the rank you asked for lets you go again; an empty hand draws a card at the start of its turn.
  - In every new game the room's host (seat 0) moves first.
- **Made by:** agent (Claude)
- **Reason:** These are common, simple versions of each game. Random placement in Battleship keeps setup to two buttons and leaves no way to send an invalid fleet. The Crazy Eights stalemate rule stops a game that could otherwise never end.

## 2026-11-04 — Views say "you" and "opponent", not seat numbers

- **Decision:** Every new game's `toView` describes owners, results and last actions relative to the viewer (`"you"`, `"opponent"`, `"draw"`), as War and Tic-Tac-Toe already do for results.
- **Made by:** agent (Claude)
- **Reason:** Each screen then draws "your" pieces the same way in either seat, and the views never need to explain which seat number the viewer has.

## 2026-11-04 — Keep a work log in LOG.md (#68)

- **Decision:** Add `LOG.md` with one entry per work session (date, who, issues, what changed, how it was checked, what's left), newest first, and require it in `AGENTS.md` next to the `decision.md` rule. Also add an `AGENTS.md` rule that hidden information stays out of other seats' views and commentary prompts, with a test.
- **Made by:** user (asked for logs alongside the decision structure); format by agent (Claude)
- **Reason:** `decision.md` records why choices were made but not what each session did or left unfinished. With several people and agents working at once, the next one needs to see both.

## 2026-11-04 — Fix a flaky War commentary test

- **Decision:** Give the server test "sends commentary to both players after a round resolves, not before" a fixed deal (3♠ vs 2♦) through `engineOptions.shuffle`.
- **Made by:** agent (Claude)
- **Reason:** With a random deck, about 1 run in 17 started with a tie. The round then went to war instead of resolving, no commentary was sent, and the test waited forever. 25 runs in a row pass with the fixed deal.
