# Work log

One entry per work session, newest first. `decision.md` says *why* a choice was made; this file says *what happened*, so the next person or agent can pick up where the last one stopped.

Each entry: date · who (a person, or `agent`) · issues · what changed · how it was checked · what's left.

---

## 2026-11-09 · agent, for Shulamit · #59, #77, #81

**Asked for:** Review draft PR #70 against the game-plugin contract, then add whatever issue #59 still requires.

**What changed:**
- Reviewed the seven games already on the branch. Each one implements `GameEngine`, `GameModule` and `GuiModule` the same way War and Tic-Tac-Toe do, and hidden information stays in the owning seat's view. No contract fixes came out of that review.
- Added Nim (#77): engine, tests, module, screen, registry entries, README and the server game list.
- Added Battleship fleet placement (#81): a `place` action with server checks, drag and rotate on the setup screen, and tests for valid and invalid layouts.

**How it was checked:** `npm run typecheck` and `npm test` (100 tests). The final Battleship screen was not played in a browser, and the preview page was not rebuilt after that screen change.

**What's left:** open the pull request for review. Commentary was not tried with a real API key.

## 2026-11-04 · agent (Claude), for Yosef Skolnick · #59–#69

**Asked for:** build every game that fits the current game-plugin work, add a log and decision entries, add a link in the UI, and open issues first. Built on `refactorWarAndTTT` (the user's choice) and delivered as a draft pull request.

**Issues opened:** #59 (parent) and its children: #60 Rock-Paper-Scissors, #61 Goofspiel, #62 Connect Four, #63 Dots and Boxes, #64 Battleship, #65 Crazy Eights, #66 Go Fish, #67 How to play links, #68 this log, #69 shared cards module.

**What changed:**
- Seven new games, each a `GameEngine` + `GameModule` in `src/games/<id>/` with tests, and a `GuiModule` in `gui/src/games/<id>/`, listed in both registries.
- `src/games/shared/cards.ts` (deck, shuffle, card helpers) and `src/games/shared/view.ts` (viewer-relative results, names, commentary opening). War now gets its deck from the shared module and re-exports it, so old imports still work.
- `gui/src/games/shared/` for drawing cards and the common layout pieces the new screens share.
- `rules` on `GameModule` and `GET /api/games`; a **How to play** link under every lobby tile. Rules written for all nine games.
- `README.md`, `AGENTS.md` (work log rule, hidden-information rule), `decision.md` (eight entries), and the preview page rebuilt.
- Fixed a flaky War server test that hung when the first random flip was a tie.

**How it was checked:**
- `npm run typecheck` and `npm test`: 94 tests pass (53 before), including network tests that Rock-Paper-Scissors picks and Battleship fleets never reach the other player.
- The server test file run 25 times in a row with no failures after the flaky-test fix.
- Every new game played to the end in two real browser sessions against a local server; wins and losses showed up on the accounts. Lobby and every game checked at phone width (no sideways scrolling).
- The preview page loads every game with no errors.

**What's left:**
- Commentary was not tried with a real API key; prompts are covered only by reading them.
- Win/loss records are still one total across all games (unchanged decision).
- Battleship has random placement only; drag-and-drop placement would be a new issue.
- Uno (#30) can reuse `src/games/shared/cards.ts` and Crazy Eights' draw/discard handling.
- Poker on `claude/poker-game-requirements-j5u75v` still needs porting to the plugin contract.
