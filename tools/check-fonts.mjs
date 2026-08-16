/* The font-loading setup, guarded against the four ways it has already broken.
   node tools/check-fonts.mjs

   READ THIS BEFORE CHANGING ANYTHING ABOUT FONTS.

   The nav is fixed to the top of every page. If the text in it is measured in
   one font and then re-measured in another, it visibly shifts on every single
   navigation, and the masthead's bottom edge — a hard colour seam across the
   page — jumps with it. This has been fixed three times and broken twice, and
   each break was a side effect of work that had nothing to do with fonts:

     1. Google Fonts with display=swap. A fallback is painted and then replaced.
        The wordmark went 121.91px → 119.08px, every navigation.
     2. `max-width: 58ch` on the masthead lede. `ch` is the width of the font's
        own "0" and is not the same number of pixels in the fallback — the box
        was 8% narrower, the lede wrapped to an extra line, and the seam moved
        31.5px. Nothing about that edit looked font-related.
     3. Self-hosting with no font-display. The browser hides the text until the
        font arrives and then shows it: a blink on every page.
     4. font-display: optional, including on an inlined face. It commits at the
        first paint, before the font pipeline has finished even for a data: URI,
        so the page renders in the fallback and stays there.

   What holds now: the two faces that carry every word above the fold are inside
   styles.css as data: URIs with no font-display, so there is nothing to fetch,
   nothing to wait for and nothing to swap. The rest are linked with
   `optional`, because never swapping matters more for them than which face
   they land on.

   `npm run check:layout` measures the symptom in a real browser and is the
   stronger check — but it SKIPS when Chrome is not installed, which is exactly
   when a regression would go out unnoticed. This one is static, runs anywhere,
   and cannot skip. Keep both. */

import { readFileSync, existsSync } from "node:fs";

const PAGES = ["index.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* Must be inlined, because they are what the nav, the mastheads and the menus
   are set in. Kept in step with CRITICAL in tools/fetch-fonts.mjs. */
const MUST_INLINE = ["Fraunces", "Manrope"];

/* Blocks whose text is on screen before anything scrolls. A ch measure here
   changes width when the font changes and takes the layout with it. */
const ABOVE_FOLD = /^\s*\.(nav|mhead|hero|mswitch|morder|carte__masthead)[\w_-]*/;

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(detail.split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

const css = readFileSync("styles.css", "utf8");
console.log("\nfont loading\n");

/* ── 1. nothing is fetched from Google ─────────────────────────────────────
   A third-party font cannot be there for the first paint, whatever else is
   done to it. This is break #1 and it is the easiest one to reintroduce, by
   copying a <head> from anywhere else. */
{
  const guilty = PAGES.filter((p) => existsSync(p) && /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(p, "utf8")));
  if (guilty.length) {
    fail("a page still loads fonts from Google", guilty.join("\n") +
         "\nrun: npm run fetch:fonts, and delete the <link> tags");
  } else pass("no page fetches a font from another origin");
}

/* ── 2. the critical faces are inlined ─────────────────────────────────── */
{
  const missing = MUST_INLINE.filter((f) => {
    const face = new RegExp(`font-family:\\s*'${f}'[^}]*?url\\(data:font/woff2`, "i");
    return !face.test(css);
  });
  if (missing.length) {
    fail("a face that has to be inlined is not", missing.join(", ") +
         "\nthese carry the nav and the mastheads — linked, they arrive after the first paint");
  } else pass(`${MUST_INLINE.length} critical faces are inlined as data: URIs`);
}

/* ── 3. no font-display on an inlined face ─────────────────────────────────
   Break #4. `optional` on a data: URI still commits to the fallback. */
{
  const bad = [...css.matchAll(/@font-face\s*\{([^}]*url\(data:[^}]*)\}/g)]
    .filter((m) => /font-display/.test(m[1]))
    .map((m) => (m[1].match(/font-family:\s*'([^']+)'/) || [])[1] || "?");
  if (bad.length) {
    fail("an inlined face carries font-display", [...new Set(bad)].join(", ") +
         "\noptional commits to the fallback before the font pipeline finishes, even inlined");
  } else pass("no inlined face carries font-display");
}

/* ── 4. every linked face never swaps ──────────────────────────────────── */
{
  const bad = [...css.matchAll(/@font-face\s*\{([^}]*url\((?!data:)[^}]*)\}/g)]
    .filter((m) => /src:\s*url\(assets\/fonts/.test(m[1]) && !/font-display:\s*optional/.test(m[1]))
    .map((m) => (m[1].match(/src:\s*url\(([^)]+)\)/) || [])[1] || "?");
  if (bad.length) {
    fail("a linked font face can still swap", bad.join("\n") +
         "\nlinked faces need font-display: optional, or they replace text after it is painted");
  } else pass("every linked face is font-display: optional");
}

/* ── 5. no base64 is written twice ─────────────────────────────────────────
   Google emits one @font-face per weight, all pointing at one variable file.
   Emitted separately with an inlined src, the same 88 kB lands in the
   stylesheet five times — it produced a 626 kB styles.css once. */
{
  const counts = new Map();
  for (const m of css.matchAll(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]{64})/g)) {
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  const dupes = [...counts.values()].filter((n) => n > 1).length;
  if (dupes) {
    fail(`${dupes} inlined font(s) written more than once`,
         "collapse the weights into one @font-face per file — see fetch-fonts.mjs");
  } else pass(`${counts.size} inlined font(s), each written once`);
}

/* ── 6. nothing above the fold is measured in ch ────────────────────────────
   Break #2, and the one that will happen again, because it does not look like
   a font change. ch is the width of the font's "0"; the metric-matched
   fallbacks do not equalise it. Use em. */
{
  const bad = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selector, body] = m;
    if (!ABOVE_FOLD.test(selector)) continue;
    for (const d of body.matchAll(/([\w-]+)\s*:\s*[^;]*?[\d.]+ch\b/g)) {
      bad.push(`${selector.trim().split("\n").pop().trim()} — ${d[1]}`);
    }
  }
  if (bad.length) {
    fail("a ch measure is used above the fold", bad.join("\n") +
         "\nch changes width with the font. Use em — see .mhead__lede in styles.css");
  } else pass("nothing above the fold is sized in ch");
}

console.log(failures
  ? `\n${failures} font problem(s) — the nav will shift on every navigation. ` +
    `Read the header of this file before "fixing" it.`
  : "\nthe fonts cannot shift the layout: nothing fetched, nothing swapped, nothing in ch");
process.exit(failures ? 1 : 0);
