/* Phase 1 — one-off: mark the two footer paragraphs render.js needs to find.
   node tools/add-content-hooks.mjs

   Everything else the hours and contact renderers touch can be found by what
   it already is — a[href^="tel:"], .mmenu__hours, #hoursList, the JSON-LD
   block. Only the footer's address and hours paragraphs are anonymous <p>s
   whose sole distinguishing feature is the <h4> above them, so they get an
   explicit hook rather than a brittle sibling lookup.

   Idempotent. */

import { readFileSync, writeFileSync } from "node:fs";

const PAGES = ["index.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* <h4> heading text -> the attribute its following <p> should carry */
const HOOKS = [
  { heading: "Aromati Café &amp; Wine Bar", attr: 'data-contact="address"' },
  { heading: "Hours",                       attr: 'data-hours="footer"'   }
];

for (const file of PAGES) {
  let html = readFileSync(file, "utf8");
  let added = 0;

  for (const hook of HOOKS) {
    const rx = new RegExp(`(<h4>${hook.heading}</h4>\\s*)<p>`, "g");
    html = html.replace(rx, (whole, head) => {
      if (whole.includes(hook.attr)) return whole;
      added++;
      return `${head}<p ${hook.attr}>`;
    });
  }

  writeFileSync(file, html, "utf8");
  console.log(`${file.padEnd(18)} ${added} hook(s) added`);
}
