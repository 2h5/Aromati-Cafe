/* Phase 1 — one-off: give every page the seed data and the renderer.
   node tools/wire-scripts.mjs

   Order matters and is the whole point: the data, then render.js, then
   script.js. The boards, the hours and the contact details all have to be in
   the DOM before script.js initialises, because its reveal observers, tab
   filter and entrance choreography measure what is already there.

   Idempotent. */

import { readFileSync, writeFileSync } from "node:fs";

const PAGES = ["index.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* The whole set, in the order it has to load. config.js first because data.js
   reads it; the seeds next because render.js reads them; data.js before
   render.js because render.js asks it what to paint.

   This list has grown a phase at a time — the copy in Phase 1, data.js and
   config.js in Phase 4, the photographs in Phase 6 — and it is written out
   here in full rather than patched around, so this file stays the one place
   that knows what a page loads and in what order. */
const COMMON = [
  "config.js",
  "data/seed-settings.js",
  "data/seed-hours.js",
  "data/seed-copy.js",
  "data/seed-photos.js"
];
const ANCHOR = '<script src="script.js"></script>';

for (const file of PAGES) {
  let html = readFileSync(file, "utf8");
  const wanted = [...COMMON];
  /* seed-menu.js only where there is a board to build. */
  if (html.includes('id="carteBody"')) wanted.push("data/seed-menu.js");
  wanted.push("data.js", "render.js");

  /* Drop any tags already present, then insert the whole set in one known
     order — cheaper to reason about than patching around what is there. */
  for (const src of wanted) {
    html = html.replace(new RegExp(`\\s*<script src="${src.replace(/[/.]/g, "\\$&")}"></script>`, "g"), "");
  }

  if (!html.includes(ANCHOR)) throw new Error(`${file}: script.js tag not found`);
  html = html.replace(ANCHOR, wanted.map((s) => `<script src="${s}"></script>`).join("\n") + "\n" + ANCHOR);

  writeFileSync(file, html, "utf8");
  console.log(`${file.padEnd(18)} ${wanted.join(", ")}`);
}
