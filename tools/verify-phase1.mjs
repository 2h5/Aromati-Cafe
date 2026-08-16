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
  "index.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"
];

/* Compared whole-page, not board-only: the hours and contact renderers write
   into the footer, the mobile menu and the Visit table, so a regression there
   would sit outside any #carteBody. */
const ROOT = "body";

/* Wording deliberately changed since the baseline.

   The baseline does not move. Re-pinning it to a newer commit would be the
   easy fix and the wrong one: it re-blesses whatever the conversion had
   already broken, silently, and this check stops meaning anything. An
   intentional edit is recorded here instead — applied as a rewrite of the old
   text before the comparison, so everything not listed is still a bug.

   An entry that matches nothing is itself a failure. A rule kept alive after
   the text moved on is how an allowance list turns into a blindfold. */
const INTENDED = [
  { page: "index.html", was: "Book a Table", now: "Reserve a Table",
    why: "renamed on request, 2026-08-01" },

  { page: "index.html", was: "Georgian kitchen, all day", now: "Georgian kitchen",
    why: "menu summary shortened on request, 2026-08-12" },
  { page: "menu-food.html", was: "Georgian kitchen, all day", now: "Georgian kitchen",
    why: "menu summary shortened on request, 2026-08-12" },
  { page: "menu-drinks.html", was: "Georgian kitchen, all day", now: "Georgian kitchen",
    why: "menu summary shortened on request, 2026-08-12" },
  { page: "menu-wine.html", was: "Georgian kitchen, all day", now: "Georgian kitchen",
    why: "menu summary shortened on request, 2026-08-12" },

  { page: "index.html",
    was: "Everything comes out of the open kitchen on the ground floor. Khachapuri is blistered to order and khinkali is pleated by hand.",
    now: "Everything comes out of the open kitchen on the ground floor. Khachapuri is blistered to order, with Georgian favorites served all day.",
    why: "unverified preparation claim replaced on request, 2026-08-12" },
  { page: "menu-food.html",
    was: "Everything comes out of the open kitchen on the ground floor. Khachapuri is blistered to order and khinkali is pleated by hand. Served all day.",
    now: "Everything comes out of the open kitchen on the ground floor. Khachapuri is blistered to order, with Georgian favorites served all day.",
    why: "unverified preparation claim replaced on request, 2026-08-12" },

  /* The café's address changed, on every page that prints it. Five entries and
     not one, because a rewrite is scoped to a page on purpose: an allowance
     that applied everywhere would go on forgiving this string on a page that
     stopped displaying it. */
  { page: "index.html", was: "info@aromatiNY.com", now: "info@aromatinyc.com",
    why: "the café's real address, 2026-08-01 (50d9002)" },
  { page: "menu-food.html", was: "info@aromatiNY.com", now: "info@aromatinyc.com",
    why: "the café's real address, 2026-08-01 (50d9002)" },
  { page: "menu-drinks.html", was: "info@aromatiNY.com", now: "info@aromatinyc.com",
    why: "the café's real address, 2026-08-01 (50d9002)" },
  { page: "menu-wine.html", was: "info@aromatiNY.com", now: "info@aromatinyc.com",
    why: "the café's real address, 2026-08-01 (50d9002)" }
];

/* Presentation-only text that was removed from the page. These nodes are
   removed from the baseline copy before the whole-page text comparison; all
   remaining copy is still required to match exactly. */
const REMOVED = [
  { page: "index.html", sel: ".mmenu__links .mml__n",
    why: "decorative mobile-menu numbers removed, 2026-08-04" },

  /* The 2026-08-04 removal only reached index.html. The other four pages carry
     their own copy of the drawer, so they kept the numbers — and once the CSS
     that positioned them was gone with the home page's, they rendered as a bare
     line of digits above each word. Same removal, three days late. */
  { page: "menu-food.html",   sel: ".mmenu__links .mml__n", why: "as index.html, 2026-08-07" },
  { page: "menu-drinks.html", sel: ".mmenu__links .mml__n", why: "as index.html, 2026-08-07" },
  { page: "menu-wine.html",   sel: ".mmenu__links .mml__n", why: "as index.html, 2026-08-07" },

  /* The brand became the drawn lockup on 2026-08-06. Where the bar used to set
     the name in type it now paints the studio artwork, so "Aromati" and
     "café · wine bar" are no longer strings on any page — the name is on the
     link as an aria-label, which is not page text and is not compared here.
     One entry per page, deliberately: an allowance that applied everywhere
     would keep forgiving this on a page that had quietly lost its bar. */
  { page: "index.html",       sel: ".nav__brand", why: "brand set as the lockup, 2026-08-06" },
  { page: "menu-food.html",   sel: ".nav__brand", why: "brand set as the lockup, 2026-08-06" },
  { page: "menu-drinks.html", sel: ".nav__brand", why: "brand set as the lockup, 2026-08-06" },
  { page: "menu-wine.html",   sel: ".nav__brand", why: "brand set as the lockup, 2026-08-06" },

  /* Same day, same reason, on the hero: the seven letters of AROMATI and the
     gold "Café ✦ Wine Bar" under them are both inside the lockup now. */
  { page: "index.html", sel: ".hero__title", why: "hero wordmark is the lockup, 2026-08-06" },
  { page: "index.html", sel: ".hero__sub",   why: "the lockup carries this line, 2026-08-06" },

  { page: "index.html",       sel: ".studio-credit", why: "portfolio credit removed on request, 2026-08-12" },
  { page: "menu-food.html",   sel: ".studio-credit", why: "portfolio credit removed on request, 2026-08-12" },
  { page: "menu-drinks.html", sel: ".studio-credit", why: "portfolio credit removed on request, 2026-08-12" },
  { page: "menu-wine.html",   sel: ".studio-credit", why: "portfolio credit removed on request, 2026-08-12" },

  { page: "index.html",       sel: ".footer__cols > div:nth-child(4)", structure: true,
    why: "Good to Know footer column removed with the declined FAQ, 2026-08-15" },
  { page: "menu-food.html",   sel: ".footer__cols > div:nth-child(5)", structure: true,
    why: "Good to Know footer column removed with the declined FAQ, 2026-08-15" },
  { page: "menu-drinks.html", sel: ".footer__cols > div:nth-child(5)", structure: true,
    why: "Good to Know footer column removed with the declined FAQ, 2026-08-15" },
  { page: "menu-wine.html",   sel: ".footer__cols > div:nth-child(5)", structure: true,
    why: "Good to Know footer column removed with the declined FAQ, 2026-08-15" }
];

/* Content added since the baseline, named by selector rather than by the words
   in it. A text diff compares two lists by position, so an insertion shifts
   everything after it and reports the whole rest of the page as changed —
   true, and useless.

   The subtree is cut out of the rendered page before the comparison, which
   means this check says nothing about it. That is the right split: this check
   asks "did the conversion change what was already here", and new content was
   not here. What covers the block instead is KEPT_IN_MARKUP below — the served
   markup has to already say what the renderer would make it say.

   Like INTENDED, an entry that matches nothing fails. */
const ADDED = [
  { page: "index.html",        sel: "[data-order-group]", why: "delivery links, 2026-08-01" },
  { page: "menu-food.html",    sel: "[data-order-group]", why: "delivery links, 2026-08-01" },
  { page: "menu-drinks.html",  sel: "[data-order-group]", why: "delivery links, 2026-08-01" },
  { page: "menu-wine.html",    sel: "[data-order-group]", why: "delivery links, 2026-08-01" },
  { page: "index.html",        sel: "#reservationPanel", why: "OpenTable-ready reservation modal, 2026-08-16" },
  { page: "index.html",        sel: "#navReserve", why: "desktop reservation trigger, 2026-08-16" },
  { page: "index.html",        sel: "#mobileReserve", why: "mobile-menu reservation trigger, 2026-08-16" }
];

/* Content the owner has since replaced outright. The subtree is cut from BOTH
   sides — baseline and rendered — and this check then says nothing about it.

   ── why this is not the re-pinning that the note above forbids ──
   Those two things look alike and are not. Re-pinning BASE would re-bless the
   whole of every page at a newer commit, including the parts this check exists
   to watch, and it would do so silently and permanently. This names one subtree
   on three pages and leaves everything else on those pages — nav, masthead,
   footer, hours, address, delivery links, the copy fields — compared against
   the original baseline exactly as before.

   ── why the board had to come out ──
   The question this file asks is "did moving the menu from markup into the
   renderer change what the page says". For the boards that question is now
   unanswerable and no longer interesting: on 2026-08-06 the menu was resynced
   to the printed sheets in assets/menus/, which replaced 84 items with 113 and
   rewrote nearly every price and description. Practically none of the baseline
   text survives, so the comparison reports a few hundred differences that are
   all correct. Enumerating them in INTENDED would be transcribing the menu a
   third time, and a list that long stops being read.

   What covers the boards instead is the printed sheets themselves, plus
   tools/test-menu-shapes.mjs for how each price shape renders and
   tools/check-live-project.mjs for whether the database agrees with the seeds.

   Like the lists above, an entry that matches nothing is a failure. */
const RESEEDED = [
  { page: "menu-food.html",   sel: "#carteBody", why: "menu resynced to assets/menus/, 2026-08-06" },
  { page: "menu-drinks.html", sel: "#carteBody", why: "menu resynced to assets/menus/, 2026-08-06" },
  { page: "menu-wine.html",   sel: "#carteBody", why: "menu resynced to assets/menus/, 2026-08-06" }
];

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
const usedIntent = new Set();
const usedAdded = new Set();
const usedRemoved = new Set();
const usedReseeded = new Set();

/* Cut every RESEEDED subtree out of one side. Returns nothing — the clone is
   modified in place, and the entry is banked as used the moment it matches on
   either side, so a selector that has stopped existing still gets reported. */
function dropReseeded(root, page) {
  for (const gone of RESEEDED.filter((r) => r.page === page)) {
    const hits = [...root.querySelectorAll(gone.sel)];
    if (hits.length) usedReseeded.add(gone);
    for (const n of hits) n.parentNode.removeChild(n);
  }
}

for (const page of PAGES) {
  const before = boardOf(
    execFileSync("git", ["show", `${BASE}:${page}`], { encoding: "utf8", maxBuffer: 1 << 24 }),
    { render: false }
  );
  const after = boardOf(readFileSync(page, "utf8"), { render: true });

  if (!before || !after) throw new Error(`${page}: no ${ROOT}`);

  const rewrites = INTENDED.filter((r) => r.page === page);
  const textBefore = before.cloneNode(true);
  dropReseeded(textBefore, page);
  for (const remove of REMOVED.filter((r) => r.page === page)) {
    const hits = [...textBefore.querySelectorAll(remove.sel)];
    if (hits.length) usedRemoved.add(remove);
    for (const n of hits) n.parentNode.removeChild(n);
  }
  const a = visibleText(textBefore).map((s) => {
    const hit = rewrites.find((r) => r.was === s);
    if (!hit) return s;
    usedIntent.add(hit);
    return hit.now;
  });
  /* Cut the added blocks out of a copy, so the live tree is left whole for the
     markup-drift check further down. */
  const trimmed = after.cloneNode(true);
  dropReseeded(trimmed, page);
  for (const add of ADDED.filter((x) => x.page === page)) {
    const hits = [...trimmed.querySelectorAll(add.sel)];
    if (hits.length) usedAdded.add(add);
    for (const n of hits) n.parentNode.removeChild(n);
  }
  const b = visibleText(trimmed);

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

  /* Shape is counted on both sides with the reseeded subtrees removed. Most
     REMOVED entries are text-only allowances; entries marked structure are
     intentional subtree deletions and therefore leave the baseline too. */
  const shapeBefore = before.cloneNode(true);
  const shapeAfter = after.cloneNode(true);
  dropReseeded(shapeBefore, page);
  dropReseeded(shapeAfter, page);
  for (const remove of REMOVED.filter((r) => r.page === page && r.structure)) {
    for (const n of shapeBefore.querySelectorAll(remove.sel)) n.parentNode.removeChild(n);
  }
  /* An intentional addition can carry structural facts too — the reservation
     modal adds a real tel: CTA. Remove added subtrees from the new side for the
     same reason their text was removed above: this comparison protects the
     pre-conversion page; new feature behavior is outside that baseline. */
  for (const add of ADDED.filter((r) => r.page === page)) {
    for (const n of shapeAfter.querySelectorAll(add.sel)) n.parentNode.removeChild(n);
  }

  const sa = shape(shapeBefore), sb = shape(shapeAfter);
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
    'a[href^="tel:"]', 'a[href^="mailto:"]', ".ig__handle",
    /* Every section-copy field, for the same reason: the headline in the
       source is what a crawler indexes and what a reader with no JavaScript
       gets, so it has to already say what seed-copy.js says. */
    "[data-copy]",
    /* The delivery links. Here the href is the whole point — the text says
       "DoorDash" either way, so comparing only what is readable would prove
       nothing about the link. See below: anchors are compared on href too. */
    "[data-order]"
  ];

  /* For a link, the address is as much a fact about the page as the words. A
     stale tel: or ordering href is invisible on screen and broken to a
     crawler, which is precisely the drift this section exists to catch. */
  const factsOf = (n) =>
    (n.tagName === "A" ? (n.getAttribute("href") || "") + " | " : "") +
    visibleText(n).join(" ");

  const stale = [];
  {
    const raw = boardOf(readFileSync(page, "utf8"), { render: false });
    for (const sel of KEPT_IN_MARKUP) {
      const was = [...raw.querySelectorAll(sel)].map(factsOf);
      const now = [...after.querySelectorAll(sel)].map(factsOf);
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

/* An allowance that no longer matches anything is stale, and a stale one hides
   whatever occupies that string next. */
const dead = INTENDED.filter((r) => !usedIntent.has(r));
if (dead.length) {
  failures++;
  console.log("\nFAIL  an intended-change entry matched nothing in the baseline");
  for (const r of dead) {
    console.log(`        ${r.page}: ${JSON.stringify(r.was)} — ${r.why}`);
    console.log("        the baseline no longer says this; drop the entry");
  }
}

const deadAdds = ADDED.filter((r) => !usedAdded.has(r));
if (deadAdds.length) {
  failures++;
  console.log("\nFAIL  an added-content entry matched nothing on the page");
  for (const r of deadAdds) {
    console.log(`        ${r.page}: ${r.sel} — ${r.why}`);
    console.log("        the block is gone; drop the entry, or it hides the next one");
  }
}

const deadReseeded = RESEEDED.filter((r) => !usedReseeded.has(r));
if (deadReseeded.length) {
  failures++;
  console.log("\nFAIL  a reseeded-content entry matched nothing on either side");
  for (const r of deadReseeded) {
    console.log(`        ${r.page}: ${r.sel} — ${r.why}`);
    console.log("        the subtree is gone; drop the entry, or it blindfolds this page");
  }
}

const deadRemoved = REMOVED.filter((r) => !usedRemoved.has(r));
if (deadRemoved.length) {
  failures++;
  console.log("\nFAIL  a removed-content entry matched nothing in the baseline");
  for (const r of deadRemoved) {
    console.log(`        ${r.page}: ${r.sel} — ${r.why}`);
    console.log("        the baseline no longer contains it; drop the entry");
  }
}

console.log(failures ? `\n${failures} page(s) failed` : "\nall pages identical");
process.exit(failures ? 1 : 0);
