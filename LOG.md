# Work session log

Add one short entry for each work session so the next person or agent can resume quickly.

## Entry format

## YYYY-MM-DD — Short description

- **Who:** person or agent
- **Issues:** issue numbers or `none`
- **Changed:** files or behavior changed
- **Remaining:** unfinished work, blockers, or `none`

## 2026-11-09 — Add session log

- **Who:** agent (GitHub Copilot)
- **Issues:** none
- **Changed:** Added `LOG.md`, linked it from `AGENTS.md`, and documented the decision in `decision.md`.
- **Remaining:** none

## 2026-11-09 — Add Crazy Eights and Go Fish; shared card module

- **Who:** agent, on behalf of yskolnick (taking over Hannah Lichtman's, GitHub HannahL06, work)
- **Issues:** #65 (Crazy Eights), #66 (Go Fish), #69 (shared cards)
- **Changed:** Added `src/games/shared/cards.ts` and `src/games/shared/view.ts`; War now imports its deck from the shared module (types and helpers re-exported so existing imports work). Added `src/games/crazy8/` (`crazy8`) and `src/games/gofish/` (`gofish`), both 2-player, with screens in `gui/src/games/crazy8/` and `gui/src/games/gofish/`, shared card-face styles in `gui/src/games/shared/`, and registrations in `src/games/index.ts` and `gui/src/games/index.ts`. Ported from draft PR #70 (`claude/more-games`) to the `players: { min, max }` contract. Rebuilt the preview; `test/server.test.js` lists the new games. All 97 tests pass.
- **Remaining:** PR #70 still has its other five games, which need the same port. Close #65, #66 and #69 once this branch is merged.

## 2026-11-09 — Port the remaining PR #70 games

- **Who:** agent, on behalf of yskolnick
- **Issues:** #61, #62, #63, #64 (closed #65, #66, #69 earlier this session)
- **Changed:** Added `goofspiel`, `connect4`, `dots` and `battleship` modules and screens, ported from draft PR #70 to `players: { min, max }` (kept Efrat's `rps` from PR #89 rather than #70's); registered them in `src/games/index.ts` and `gui/src/games/index.ts`; `test/server.test.js` lists all ten games. All tests pass.
- **Remaining:** Open a PR for this branch and merge it; then close draft PR #70 without merging. Assignees of #61–#64 should review their game and close the issue. PR #70's lobby "How to play" work belongs to #67.
## 2026-11-09 — Close idle rooms

- **Who:** agent (GitHub Copilot)
- **Issues:** #83
- **Changed:** Added configurable idle-room cleanup, the `room_closed` protocol event and lobby handling, documentation, and focused server coverage.

## 2026-11-09 — Cap AI commentary calls (#80)

- **Who:** agent (GitHub Copilot)
- **Issues:** #80
- **Changed:** Added shared per-room and per-server commentary limits, environment configuration, skip logging, tests, and documentation.
- **Remaining:** none

## 2026-11-09 — Keep project guidance files tracked

- **Who:** agent (GitHub Copilot)
- **Issues:** #54
- **Changed:** Kept the repository-root `AGENTS.md` and `decision.md` tracked; documented the preservation decision.
- **Remaining:** none

## 2026-11-09 — Implement Rock-Paper-Scissors

- **Who:** agent (GitHub Copilot)
- **Issues:** #60
- **Changed:** Added the RPS engine, tests, server and client module registrations, GUI screen/styles, README coverage, and decision-log entry.
- **Remaining:** none; typecheck, build, and full test suite pass.

## 2026-11-09 — Uno GUI module

- **Who:** agent (Claude Code), on behalf of Ariella (GitHub Duskoding)
- **Issues:** #36 (child of #30)
- **Changed:** Added `gui/src/games/uno/uno.ts` and `uno.css` and registered `uno` in `gui/src/games/index.ts`. Shows other players with card counts and an UNO! marker at one card, the draw and discard piles, the color to match and play direction, your hand sorted by color with playable cards highlighted, a color picker for wilds, and a per-move line in the commentary box. No server, engine or protocol changes. Checked with a full 3-player game in real browsers (winner and stats update, no errors, no sideways scroll at phone width); all 83 tests pass.
- **Remaining:** No GUI tests exist for any game yet. The Uno engine has no "call UNO" or "play the card you just drew" rules, so the screen has no buttons for them; if the engine owner (#30) adds them, the screen needs matching buttons. Once `gui/src/games/shared/` (cards module, PR #70 work) is on `main`, card drawing could move there. Keyboard/screen-reader pass is tracked in #82.
