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

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const BASE = process.env.PHASE1_BASE || "53b3d5e";   // last commit before the conversion
const PAGES = [
  "index.html", "faq.html",
  "menu-food.html", "menu-drinks.html", "menu-wine.html"
];

/* Compared whole-page, not board-only: the hours and contact renderers write
   into the footer, the mobile menu and the Visit table, so a regression there
   would sit outside any #carteBody. */
const ROOT = "body";

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
    /* Script and style bodies are not page text. This matters here because the
       seed files and render.js are injected into <body> to run them, so without
       it the comparison reads their entire source as content. */
    if (node.nodeName === "SCRIPT" || node.nodeName === "STYLE") return;
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
    /* jsdom does not fetch the page's own <script src> tags, so the same files
       are injected by hand, in the order the page lists them. Read from the tags
       themselves rather than a fixed list, so this cannot drift from what the
       browser actually loads. */
    const srcs = [...window.document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .filter((src) => /^(data\/|render\.js)/.test(src) && existsSync(src));
    for (const src of srcs) {
      const s = window.document.createElement("script");
      s.textContent = readFileSync(src, "utf8");
      window.document.body.appendChild(s);
    }
  }
  return dom.window.document.querySelector(ROOT);
}

let failures = 0;

for (const page of PAGES) {
  const before = boardOf(
    execFileSync("git", ["show", `${BASE}:${page}`], { encoding: "utf8", maxBuffer: 1 << 24 }),
    { render: false }
  );
  const after = boardOf(readFileSync(page, "utf8"), { render: true });

  if (!before || !after) throw new Error(`${page}: no ${ROOT}`);

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
    build: root.querySelectorAll("#build").length,
    hourLines: root.querySelectorAll(".hours__line").length,
    telLinks: root.querySelectorAll('a[href^="tel:"]').length,
    igLinks: root.querySelectorAll('a[href*="instagram.com"]').length
  });

  const sa = shape(before), sb = shape(after);
  const shapeDiffs = Object.keys(sa).filter((k) => sa[k] !== sb[k]);

  /* The hours, phone, address and Instagram handle are still written out in the
     markup as well as generated — deliberately, so a crawler or a reader with
     no JavaScript still gets them in the served HTML. The cost is that those
     copies can drift from the seed data, and nothing about the page would look
     wrong: the rendered site would be right and the source would lie.

     So: the page as served must already say what the renderer would make it
     say. Any difference here is drift, and it is a real bug even though every
     visitor sees the correct value.

     Scoped to those elements specifically. The menu boards are not among them:
     their markup was removed on purpose, so "the served HTML does not match the
     rendered page" is the intended state there, not drift. */
  const KEPT_IN_MARKUP = [
    '[data-hours="footer"]', ".mmenu__hours", "#hoursList",
    '[data-contact="address"]', ".mmenu__addr",
    'a[href^="tel:"]', 'a[href^="mailto:"]', ".ig__handle"
  ];

  const stale = [];
  {
    const raw = boardOf(readFileSync(page, "utf8"), { render: false });
    for (const sel of KEPT_IN_MARKUP) {
      const was = [...raw.querySelectorAll(sel)].map((n) => visibleText(n).join(" "));
      const now = [...after.querySelectorAll(sel)].map((n) => visibleText(n).join(" "));
      for (let i = 0; i < Math.max(was.length, now.length); i++) {
        if (was[i] !== now[i]) stale.push({ i: sel, markup: was[i], data: now[i] });
      }
    }
  }

  const ok = !diffs.length && !shapeDiffs.length && !stale.length;
  if (!ok) failures++;

  console.log(`${ok ? "PASS" : "FAIL"}  ${page.padEnd(18)} ${b.length} strings, ${sb.items} items`);
  for (const d of diffs.slice(0, 8)) {
    console.log(`        [${d.i}] was: ${JSON.stringify(d.was)}\n             now: ${JSON.stringify(d.now)}`);
  }
  if (diffs.length > 8) console.log(`        …and ${diffs.length - 8} more`);
  for (const k of shapeDiffs) console.log(`        ${k}: ${sa[k]} -> ${sb[k]}`);
  for (const s of stale.slice(0, 6)) {
    console.log(`        drift [${s.i}] markup: ${JSON.stringify(s.markup)}\n` +
                `                     data: ${JSON.stringify(s.data)}`);
  }
  if (stale.length > 6) console.log(`        …and ${stale.length - 6} more drifted`);
}

console.log(failures ? `\n${failures} page(s) failed` : "\nall pages identical");
process.exit(failures ? 1 : 0);
