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
