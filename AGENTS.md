# Agent instructions

## Project overview

WarBrowser is a site for live two-player, server-authoritative browser games: War, plus Tic-Tac-Toe as a second, example game. Players choose a game in the lobby. The repository contains a Node.js server, TypeScript game rules and authentication/commentary modules, and a Vite-built browser client.

- `server.js` owns HTTP/WebSocket routing, room membership, and wiring between clients and whichever game a room was created for.
- `src/games/` contains one `GameDefinition` per game (`war.ts`, `tictactoe.ts`), the shared interface (`types.ts`), and the list of games (`index.ts`).
- `src/engine/` contains the concrete `WarEngine` rules and its unit tests.
- `src/auth.ts` contains SQLite-backed users, sessions, and match records.
- `src/commentator.ts` integrates optional AI round commentary.
- `gui/` contains the Vite + TypeScript client. `gui/src/main.ts` and `gui/src/style.css` are the shell (accounts, lobby, rooms); each game's screen is in `gui/src/games/<id>/`.
- `gui/preview/` builds `live-war-preview.html`, a no-install two-window preview that runs the real games from `src/games/`.
- `test/` contains server-level tests.
- `SPEC_v2.md` is the current implementation specification; `SPEC_v1.md` is historical context.

## Runtime and commands

- Use Node.js 24 or later.
- Install dependencies with `npm install` locally or `npm ci --include=dev` in deployment/clean-build environments.
- Run `npm run build` after client or build-configuration changes.
- Run `npm run typecheck` after TypeScript changes.
- Run `npm test` for the full test suite; it builds the client first.
- Run `npm start` to serve the built client and WebSocket server.
- Run `npm run dev` for Vite client development.
- Run `npm run build:preview` after client or game changes to refresh `gui/preview/live-war-preview.html`.

Do not commit generated output, local databases, environment files, or credentials. The repository ignores `node_modules/`, build output, `.env`, and SQLite data files. Keep `ANTHROPIC_API_KEY` out of source control; commentary must remain optional when the key is absent.

## Code and architecture conventions

- Preserve strict TypeScript settings and existing ESM/NodeNext module conventions. Use explicit types and `.ts` import extensions where the surrounding code does.
- Keep each game's rules in its own module (`WarEngine` for War, `src/games/<id>.ts` for others), independent from networking and browser concerns. Prefer extending the engine and its tests rather than duplicating rules in `server.js` or the GUI. `server.js` must stay game-agnostic.
- Treat the server as authoritative: validate WebSocket messages and state transitions on the server, and send clients only the protocol shapes documented in `README.md` and `SPEC_v2.md`.
- Reuse existing helpers and data shapes before introducing new abstractions. Add new games through the `GameDefinition` and `ClientGame` interfaces ("Adding a game" in `README.md`), and keep the current room protocol unless a requirement explicitly changes it.
- Keep each game's screen inside its shadow root: style it through its own `.css` file passed as `styles`, change the page background only with `setBackground`, and don't edit `gui/src/main.ts` or `gui/src/style.css` for game-specific changes.
- Follow the existing formatting style: double-quoted JavaScript/TypeScript strings, semicolons, and small focused functions. Add comments only for non-obvious behavior.
- Update directly related documentation and tests when behavior or protocol changes.

## Testing and change discipline

Read the relevant implementation, tests, README, and current specification before changing behavior. Make surgical changes, avoid unrelated refactors, and run the smallest relevant validation command followed by `npm test` when shared behavior is affected.

Never commit secrets or weaken authentication, input-size limits, server-side validation, or the server-authoritative game model. Surface errors using the repository's existing response/error patterns rather than silently accepting invalid input.

## Decision log requirement

Whenever a person or agent makes a project decision, record it in `decision.md`. Each entry must include the decision, the date, and who made it; identify the maker as `agent` when the decision is made by an agent. This applies to implementation, architecture, testing, documentation, and operational decisions.
