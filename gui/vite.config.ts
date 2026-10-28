import { defineConfig } from "vite";

// In dev, forward /ws to the teammates' Node server (`node server.js`, port 3000).
export default defineConfig({
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
