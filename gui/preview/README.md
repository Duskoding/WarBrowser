# Site preview

`live-war-preview.html` shows the site running in two side-by-side windows, as
two players, connected through a pretend server that follows the room rules in
`server.js` and runs the real games from `src/games/`. Open it in a browser;
nothing to install. Accounts are skipped and commentary is sample text.

To rebuild it after changing the client or a game (from the repo root):

```bash
npm run build:preview
```

How it works: `vite.config.ts` builds the real client with `src/connection.ts`
and `src/session.ts` swapped for `sim-connection.ts` and `sim-session.ts`;
`make.mjs` bundles `sim-server.ts` (the pretend server) and inlines both into
`page.html`, which holds the two windows and the server log.
