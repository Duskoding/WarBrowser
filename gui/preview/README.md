# GUI preview

`live-war-preview.html` shows the GUI running in two side-by-side windows, as
two players, connected through a pretend copy of the room server in
`server.js`. Open it in a browser; nothing to install.

To rebuild it after changing the GUI (from `gui/`):

```bash
npm run build:preview
```

How it works: `vite.config.ts` builds the real GUI with `src/connection.ts`
swapped for `sim-connection.ts`, and `make.mjs` inlines that build into
`page.html`, which holds the pretend server and the server log.
