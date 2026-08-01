/* Phase 1 verification — does the rendered page still say what it used to?
   node tools/verify-phase1.mjs

   Extraction proved the seed data matches the old markup. This proves the
   renderer puts that data back on the page correctly, which is a different
   failure and needs its own check: correct data can still be rendered into the
   wrong element, the wrong order, or not at all.

   Method: load each stripped page in jsdom with the real seed data and the
   real render.js, then compare the board's visible text — every string a guest
   would read, in document order — against the same board in the last commit
   before the strip. Any difference is a bug.

   Whitespace is normalised and the "$" is ignored, because it moved from the
   markup into CSS on purpose (styles.css renders it now). Nothing else is
   forgiven. */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const BASE = process.env.PHASE1_BASE || "68ac715";   // last commit with the markup
const PAGES = ["menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* Every readable string inside the board, in order. Currency symbols dropped:
   they are the one thing that legitimately moved from markup to stylesheet. */
function visibleText(root) {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, " ").replace(/\$/g, "").trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.classList && node.classList.contains("sr-only")) return;  // added by the renderer
    for (const child of node.childNodes) walk(child);
  };
  walk(root);
  return out;
}

function boardOf(html, { render }) {
  const dom = new JSDOM(html, { runScripts: render ? "dangerously" : undefined });
  if (render) {
    const { window } = dom;
    /* The page's own <script src> tags are not fetched by jsdom, so the seed
       data and the renderer are injected by hand — the same files, in the same
       order the page loads them. */
    const run = (file) => {
      const s = window.document.createElement("script");
      s.textContent = readFileSync(file, "utf8");
      window.document.body.appendChild(s);
    };
    run("data/seed-menu.js");
    run("render.js");
  }
  return dom.window.document.getElementById("carteBody");
}

let failures = 0;

for (const page of PAGES) {
  const before = boardOf(
    execFileSync("git", ["show", `${BASE}:${page}`], { encoding: "utf8", maxBuffer: 1 << 24 }),
    { render: false }
  );
  const after = boardOf(readFileSync(page, "utf8"), { render: true });

  if (!before || !after) throw new Error(`${page}: no carteBody`);

  const a = visibleText(before);
  const b = visibleText(after);

  const diffs = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) diffs.push({ i, was: a[i], now: b[i] });
  }

  /* Structure, not just words: the classes styles.css and the tab filter read
     have to survive too, or the board renders as an unstyled list of correct
     text. */
  const shape = (root) => ({
    courses: root.querySelectorAll("section.course").length,
    sized: root.querySelectorAll("section.course--sized").length,
    items: root.querySelectorAll("li.mi").length,
    prices: root.querySelectorAll(".mi__price").length,
    cells: root.querySelectorAll(".mi__cell").length,
    solo: root.querySelectorAll(".mi__cell--solo").length,
    pours: root.querySelectorAll(".mi__pours li").length,
    opts: root.querySelectorAll(".mi__opts li").length,
    tags: root.querySelectorAll(".mi__tag").length,
    noprice: root.querySelectorAll(".mi--noprice").length,
    descs: root.querySelectorAll(".mi__desc").length,
    build: root.querySelectorAll("#build").length
  });

  const sa = shape(before), sb = shape(after);
  const shapeDiffs = Object.keys(sa).filter((k) => sa[k] !== sb[k]);

  const ok = !diffs.length && !shapeDiffs.length;
  if (!ok) failures++;

  console.log(`${ok ? "PASS" : "FAIL"}  ${page.padEnd(18)} ${b.length} strings, ${sb.items} items`);
  for (const d of diffs.slice(0, 8)) {
    console.log(`        [${d.i}] was: ${JSON.stringify(d.was)}\n             now: ${JSON.stringify(d.now)}`);
  }
  if (diffs.length > 8) console.log(`        …and ${diffs.length - 8} more`);
  for (const k of shapeDiffs) console.log(`        ${k}: ${sa[k]} -> ${sb[k]}`);
}

console.log(failures ? `\n${failures} page(s) failed` : "\nall pages identical");
process.exit(failures ? 1 : 0);
