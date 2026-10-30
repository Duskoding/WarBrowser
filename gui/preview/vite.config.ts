import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds the real GUI with src/connection.ts swapped for sim-connection.ts.
export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  logLevel: "warn",
  resolve: {
    alias: [
      { find: /^\.\/connection$/, replacement: fileURLToPath(new URL("./sim-connection.ts", import.meta.url)) },
      { find: /^\.\/session$/, replacement: fileURLToPath(new URL("./sim-session.ts", import.meta.url)) },
    ],
  },
  build: { outDir: fileURLToPath(new URL("./dist", import.meta.url)), emptyOutDir: true, modulePreload: false },
});
