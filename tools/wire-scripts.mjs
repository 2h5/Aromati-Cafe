/* Phase 1 — one-off: give every page the seed data and the renderer.
   node tools/wire-scripts.mjs

   Order matters and is the whole point: the data, then render.js, then
   script.js. The boards, the hours and the contact details all have to be in
   the DOM before script.js initialises, because its reveal observers, tab
   filter and entrance choreography measure what is already there.

   Idempotent. */

import { readFileSync, writeFileSync } from "node:fs";

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* The whole set, in the order it has to load. The seeds first because render.js
   reads them; data.js before render.js because render.js asks it what to paint.

   config.js is NOT in this list and must not be added to it. It lives in
   <head>, immediately above photo-boot.js, because photo-boot.js reads it
   before the body is parsed to decide whether a CMS answer is coming and
   therefore whether it may hold the above-the-fold photograph. Moving it back
   down here does not break anything loudly: photo-boot.js reads `undefined`,
   quietly stops holding the hero on a first visit, and the swap this site was
   rebuilt to remove comes back with every test still green. The check below is
   the guard.

   This list has grown a phase at a time — the copy in Phase 1, data.js and
   config.js in Phase 4, the photographs in Phase 6 — and it is written out
   here in full rather than patched around, so this file stays the one place
   that knows what a page loads and in what order. */
const COMMON = [
  "data/seed-settings.js",
  "data/seed-hours.js",
  "data/seed-copy.js",
  "data/seed-photos.js"
];
const ANCHOR = '<script src="script.js"></script>';

/* config.js above photo-boot.js, both in <head>, or the hold is silently dead.
   Asserted rather than written, because the tags carry a comment explaining
   themselves and regenerating them would throw it away. */
function checkHead(file, html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const cfg = head.indexOf('<script src="config.js">');
  const boot = head.indexOf('<script src="photo-boot.js">');
  if (cfg < 0 || boot < 0 || cfg > boot) {
    throw new Error(`${file}: <head> must load config.js and then photo-boot.js — ` +
      "photo-boot.js reads AROMATI_CONFIG to decide whether to hold the hero");
  }
}

for (const file of PAGES) {
  let html = readFileSync(file, "utf8");
  checkHead(file, html);
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
