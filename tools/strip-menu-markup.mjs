/* Phase 1 — one-off: remove the course markup render.js now generates.
   node tools/strip-menu-markup.mjs

   Empties each page's carte__body of every <section class="course"> that is
   not marked data-static, tags the host with data-menu so render.js knows
   which board to build, and adds the data + renderer script tags.

   Idempotent: running it twice is a no-op. */

import { readFileSync, writeFileSync } from "node:fs";

const PAGES = [
  { file: "menu-food.html",   slug: "food"   },
  { file: "menu-drinks.html", slug: "drinks" },
  { file: "menu-wine.html",   slug: "wine"   }
];

const SCRIPTS =
  '<script src="data/seed-menu.js"></script>\n' +
  '<script src="render.js"></script>\n';

for (const page of PAGES) {
  let html = readFileSync(page.file, "utf8");

  /* 1. tag the host */
  if (!html.includes('data-menu="')) {
    const host = '<div class="carte__body" id="carteBody">';
    if (!html.includes(host)) throw new Error(`${page.file}: carte__body not found`);
    html = html.replace(host, `<div class="carte__body" id="carteBody" data-menu="${page.slug}">`);
  }

  /* 2. drop every generated course, keep the static ones.
        Sections are located by their opening tag and sliced to the matching
        close by depth-counting, because a <section> can contain others. */
  const opens = [...html.matchAll(/<section class="course[^"]*"[^>]*>/g)];
  const cuts = [];

  for (const open of opens) {
    if (open[0].includes("data-static")) continue;

    let depth = 0, i = open.index;
    const rx = /<\/?section\b[^>]*>/g;
    rx.lastIndex = open.index;
    let m;
    while ((m = rx.exec(html))) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) { i = m.index + m[0].length; break; }
    }
    if (depth !== 0) throw new Error(`${page.file}: unbalanced <section>`);

    /* Take the comment banner above it too, so the file does not end up as a
       field of orphaned <!-- BREAKFAST --> markers.

       Walked backwards by hand rather than by regex: an anchored pattern like
       /\n\s*<!--[^]*?-->\s*$/ matches leftmost-first, so on a page whose first
       comment is the NAV banner it happily spans from there to here and the
       cut takes the whole document with it. */
    let from = open.index;
    const before = html.slice(0, from).replace(/[ \t\r\n]+$/, "");
    if (before.endsWith("-->")) {
      const start = before.lastIndexOf("<!--");
      const comment = before.slice(start);
      /* one comment, closing exactly where the trimmed text ends — i.e. the
         banner directly above this section, not something further up */
      if (start > -1 && comment.indexOf("-->") === comment.length - 3) from = start;
    }
    cuts.push([from, i]);
  }

  for (const [from, to] of cuts.reverse()) {
    html = html.slice(0, from) + html.slice(to);
  }

  /* tidy the blank run the cuts leave behind */
  html = html.replace(/(<div class="carte__body"[^>]*>)\s*\n\s*\n+/, "$1\n\n");
  html = html.replace(/\n{3,}(\s*)<\/div>/g, "\n\n$1</div>");

  /* 3. scripts, before script.js so the board exists when it initialises */
  if (!html.includes('src="render.js"')) {
    const anchor = '<script src="script.js"></script>';
    if (!html.includes(anchor)) throw new Error(`${page.file}: script.js tag not found`);
    html = html.replace(anchor, SCRIPTS + anchor);
  }

  writeFileSync(page.file, html, "utf8");

  const left = [...html.matchAll(/<section class="course[^"]*"[^>]*>/g)].length;
  console.log(`${page.file.padEnd(18)} stripped, ${left} static course(s) left in markup`);
}
