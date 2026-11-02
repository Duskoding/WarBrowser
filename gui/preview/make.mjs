// Inlines the preview build into page.html → live-war-preview.html, a single
// file anyone can open by double-clicking (no install, no server).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = (p) => new URL(p, import.meta.url);
const asset = (name) => readFileSync(here(`./dist/assets/${name}`), "utf8");
const assets = readdirSync(here("./dist/assets"));

// The pretend server runs the real games in src/games/, bundled as one script.
const serverBuild = await build({
  configFile: false,
  logLevel: "warn",
  build: {
    write: false,
    lib: { entry: fileURLToPath(here("./sim-server.ts")), name: "SimServer", formats: ["iife"], fileName: "sim-server" },
  },
});
const simServer = serverBuild[0].output[0].code;

const { gameSummaries } = await import("../../src/games/index.ts");

// srcdoc frames can't rewrite their URL, so ignore replaceState there.
const stub =
  "<script>{const o=history.replaceState.bind(history);history.replaceState=(...a)=>{try{o(...a)}catch{}}}</script>";
const html = readFileSync(here("./dist/index.html"), "utf8")
  .replace(/<script type="module"[^>]*src="[^"]*\/([^/"]+)"[^>]*><\/script>/, (_, file) =>
    `${stub}<script type="module">${asset(file).replaceAll("</script", "<\\/script")}</script>`)
  .replace(/<link rel="stylesheet"[^>]*href="[^"]*\/([^/"]+)"[^>]*>/g, (_, file) => `<style>${asset(file)}</style>`);

const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const page = readFileSync(here("./page.html"), "utf8")
  .replace("/*SIM_SERVER*/", () => simServer.replaceAll("</script", "<\\/script"))
  .replace("/*GUI_HTML*/null", () => json(html))
  .replace("/*GAMES*/[]", () => json(gameSummaries()));
writeFileSync(here("./live-war-preview.html"), `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}`);
console.log(`Wrote preview/live-war-preview.html (${assets.length} built assets inlined)`);
