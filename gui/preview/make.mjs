// Inlines the preview build into page.html → live-war-preview.html, a single
// file anyone can open by double-clicking (no install, no server).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const assets = readdirSync(here("./dist/assets"));
const read = (ext) => readFileSync(here(`./dist/assets/${assets.find((f) => f.endsWith(ext))}`), "utf8");

// srcdoc frames can't rewrite their URL, so ignore replaceState there.
const stub =
  "<script>{const o=history.replaceState.bind(history);history.replaceState=(...a)=>{try{o(...a)}catch{}}}</script>";
const html = readFileSync(here("./dist/index.html"), "utf8")
  .replace(/<script type="module"[^>]*><\/script>/, () =>
    `${stub}<script type="module">${read(".js").replaceAll("</script", "<\\/script")}</script>`)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${read(".css")}</style>`);

const page = readFileSync(here("./page.html"), "utf8").replace(
  "/*GUI_HTML*/null",
  () => JSON.stringify(html).replaceAll("<", "\\u003c"),
);
writeFileSync(here("./live-war-preview.html"), `<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}`);
console.log("Wrote preview/live-war-preview.html");
