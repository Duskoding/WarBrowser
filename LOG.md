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
- **Issues:** #60, #61, #62, #63, #64 (closed #65, #66, #69 earlier this session)
- **Changed:** Added `rps`, `goofspiel`, `connect4`, `dots` and `battleship` modules and screens, ported from draft PR #70 to `players: { min, max }`; registered them in `src/games/index.ts` and `gui/src/games/index.ts`; `test/server.test.js` lists all ten games; preview rebuilt. 121 tests pass.
- **Remaining:** Open a PR for this branch and merge it; then close draft PR #70 without merging. Assignees of #60–#64 should review their game and close the issue. PR #70's lobby "How to play" work belongs to #67.
## 2026-11-09 — Keep project guidance files tracked

- **Who:** agent (GitHub Copilot)
- **Issues:** #54
- **Changed:** Kept the repository-root `AGENTS.md` and `decision.md` tracked; documented the preservation decision.
- **Remaining:** none
