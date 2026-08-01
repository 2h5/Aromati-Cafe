/* Phase 1 — one-off: give every page the seed data and the renderer.
   node tools/wire-scripts.mjs

   Order matters and is the whole point: the data, then render.js, then
   script.js. The boards, the hours and the contact details all have to be in
   the DOM before script.js initialises, because its reveal observers, tab
   filter and entrance choreography measure what is already there.

   Idempotent. */

import { readFileSync, writeFileSync } from "node:fs";

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* seed-menu.js only where there is a board to build. */
const COMMON = ["data/seed-settings.js", "data/seed-hours.js"];
const ANCHOR = '<script src="script.js"></script>';

for (const file of PAGES) {
  let html = readFileSync(file, "utf8");
  const wanted = [...COMMON];
  if (html.includes('id="carteBody"')) wanted.push("data/seed-menu.js");
  wanted.push("render.js");

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
