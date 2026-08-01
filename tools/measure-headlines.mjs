/* How long can a headline get before it breaks the design?
   node tools/measure-headlines.mjs

   The ten headlines carrying data-split are chopped into individual words for
   the staggered entrance, and the opening choreography is timed around them. A
   headline that is too long does not error — it silently wrecks the animation
   and pushes everything under it down the page.

   `tools/copy-labels.mjs` caps them at 72 characters on the home page and 32
   on an inner page's masthead. memory.md has carried an open item since those
   numbers were written: they were **reasoned about, not measured**. They were
   sized to catch something obviously too long, not to find the point where the
   layout actually gives.

   This measures it. For each headline, on each page, at three widths, it grows
   the text one word at a time and records where the line count goes past what
   the shipped headline uses. That number is the real ceiling; the cap should
   sit at or under it.

   Two judgements are deliberately left to a person, because measurement cannot
   settle them:

     - Which width the cap should be sized for. A cap that holds at 390px is
       very tight on a desktop; one sized for 1600px lets a phone wrap to five
       lines. The table below reports all three so the trade-off is visible
       rather than assumed.
     - Whether one extra line is actually a break. On a masthead it moves a
       hard colour seam and is obvious; in a section head it may be fine.

   So this prints a report and does not fail a build. It is a measuring tape,
   not a guard — run it when the type or the layout changes.

   ── WHAT THE FIRST RUN FOUND, 2026-08-01 ──
   A character cap is a poor proxy for the thing it is trying to prevent.

   `cafe.headline` ships at 28 characters on one line, while the measured
   ceiling for that slot came out at 23. Both are true, and the gap is the
   point: a character count does not track rendered width. Two things pull them
   apart. Glyphs differ — "Wine Bar" and "khinkali" are the same eight
   characters and not the same width — and lines break at spaces, so the last
   word either fits whole or moves whole. The copy vocabulary also lets the
   owner place an explicit line break, which moves the wrap more than any
   length limit does.

   Read the ceiling column as a **word-quantised lower bound**, not an exact
   limit: it is the last whole word that fitted, so the true ceiling is
   somewhere between it and the next word boundary. That is honest for
   comparing slots against each other and wrong for setting a precise cap.

   So no cap was changed on the strength of this run. The quantity that
   actually describes the constraint is the rendered line count of the real
   element, and the place to enforce it is the Phase 5 editor, which can
   measure it live as the owner types — the same way it will check contrast and
   alt text. The character caps stay as a coarse backstop against something
   absurd. See memory.md, open item 0.

   Needs Chrome. */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(existsSync);

if (!CHROME) {
  console.log("\n  skip  no Chrome or Edge found — headline ceilings not measured\n");
  process.exit(0);
}

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];
const WIDTHS = [1600, 1024, 390];

/* Real words, not "aaaa…". Line breaking depends on where the spaces fall, so
   a single long token measures something the owner will never type. These are
   the kind of words this site actually uses. */
const WORDS = ("Georgian khachapuri and khinkali from the open kitchen every " +
  "morning with wine poured by the glass until close on the second floor above " +
  "the café in Murray Hill served all day").split(" ");

const PROBE = `
<script>
(function () {
  function lines(el) {
    /* Client rects, not offsetHeight: one rect per line box, which is exactly
       the question, and it needs no assumption about line-height. Measured on
       the element's own text so surrounding padding cannot confuse it. */
    var r = document.createRange();
    r.selectNodeContents(el);
    return r.getClientRects().length;
  }

  var WORDS = ${JSON.stringify(WORDS)};
  var out = [];

  document.querySelectorAll("[data-split]").forEach(function (el) {
    /* data-split has already been chopped into per-word spans by script.js.
       Rewriting textContent collapses that back to plain text, which is what
       is being measured — the wrap, not the animation wrapper. */
    var key = el.getAttribute("data-copy") || "(no key)";
    var shipped = el.textContent.trim();

    el.textContent = shipped;
    var shippedLines = lines(el);

    /* Grow a word at a time and record the last length that still fits inside
       the shipped line count. */
    var text = "", fits = 0, i = 0, atCap = null;
    while (i < WORDS.length) {
      var next = text ? text + " " + WORDS[i] : WORDS[i];
      el.textContent = next;
      if (lines(el) > shippedLines) break;
      text = next;
      fits = next.length;
      i++;
    }

    /* And what the current cap would actually look like, so the report can say
       whether it is too loose rather than only what the ceiling is. */
    var cap = Number(el.getAttribute("data-probe-cap") || 0);
    if (cap) {
      var s = "";
      for (var j = 0; j < WORDS.length && (s + " " + WORDS[j]).length <= cap; j++) {
        s = s ? s + " " + WORDS[j] : WORDS[j];
      }
      el.textContent = s;
      atCap = { text: s.length, lines: lines(el) };
    }

    el.textContent = shipped;
    out.push({ key: key, shipped: shipped.length, shippedLines: shippedLines,
               ceiling: fits, atCap: atCap });
  });

  document.title = JSON.stringify(out);
})();
</script>
`;

/* The caps as copy-labels.mjs currently sets them, read from the file rather
   than duplicated here — a report that quotes a stale number is worse than no
   report. */
const labels = readFileSync("tools/copy-labels.mjs", "utf8");
const CONST = {};
for (const m of labels.matchAll(/^const\s+(HEAD_\w+)\s*=\s*(\d+)/gm)) CONST[m[1]] = Number(m[2]);
const CAPS = {};
for (const m of labels.matchAll(/"([\w.]+)":\s*\{[^}]*maxLength:\s*(\w+)/g)) {
  CAPS[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : CONST[m[2]];
}

function measure(page, width) {
  const tmp = page.replace(/\.html$/, ".__head.html");
  let html = readFileSync(page, "utf8");
  /* Stamp each headline with the cap that applies to it, so the probe can
     report what that cap looks like without knowing the label file. */
  html = html.replace(/data-split\s+data-copy="([\w.]+)"/g, (all, key) =>
    CAPS[key] ? `${all} data-probe-cap="${CAPS[key]}"` : all);
  writeFileSync(tmp, html.replace("</body>", PROBE + "</body>"));
  try {
    const dom = execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--no-sandbox",
      `--window-size=${width},900`, "--virtual-time-budget=12000",
      "--dump-dom", "file:///" + resolve(tmp).replace(/\\/g, "/")
    ], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
    const m = dom.match(/<title>(\[.*\])<\/title>/);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) : [];
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

const found = {};
for (const page of PAGES) {
  if (!existsSync(page)) continue;
  for (const width of WIDTHS) {
    for (const r of measure(page, width)) {
      (found[r.key] = found[r.key] || {})[width] = r;
    }
  }
}

console.log("\nhow long a data-split headline can get before it takes an extra line\n");
console.log("  key                    cap   shipped   ceiling at 1600 / 1024 / 390   verdict");
console.log("  " + "─".repeat(78));

const tooLoose = [];
for (const key of Object.keys(found).sort()) {
  const at = found[key];
  const cap = CAPS[key];
  const ceilings = WIDTHS.map((w) => (at[w] ? at[w].ceiling : "—"));
  const shipped = (at[WIDTHS[0]] || {}).shipped || 0;

  /* A cap is too loose where it permits a string that already wraps past the
     shipped line count at that width. */
  const loose = WIDTHS.filter((w) => at[w] && at[w].atCap && at[w].atCap.lines > at[w].shippedLines);
  if (loose.length) tooLoose.push({ key, cap, loose, at });

  const verdict = loose.length
    ? `adds a line at ${loose.join(", ")}px`
    : "holds at every width";

  const shippedLines = (at[WIDTHS[0]] || {}).shippedLines || 0;
  console.log(`  ${key.padEnd(22)} ${String(cap).padStart(3)}   ` +
              `${(shipped + " (" + shippedLines + "L)").padStart(9)}   ` +
              `${ceilings.map((c) => String(c).padStart(4)).join(" / ").padEnd(28)}   ${verdict}`);
}

console.log("\n  shipped = the headline that is on the site today");
console.log("  ceiling = the longest real text that still fits the same number of lines");
console.log("  cap     = maxLength in tools/copy-labels.mjs\n");

if (tooLoose.length) {
  console.log(`  ${tooLoose.length} cap(s) allow a headline that reflows the layout:\n`);
  for (const t of tooLoose) {
    const tightest = Math.min(...WIDTHS.map((w) => (t.at[w] ? t.at[w].ceiling : Infinity)));
    console.log(`    ${t.key}: cap ${t.cap}, but only ${tightest} characters hold at every width.`);
  }
  console.log("\n  Sizing every cap to the narrowest width is one option and it is a harsh");
  console.log("  one — 390px is where anything wraps. The other is to accept an extra");
  console.log("  line on a phone and size for the desktop composition. That is a design");
  console.log("  call, which is why this prints rather than fails.\n");
} else {
  console.log("  every cap holds the layout at every width measured.\n");
}
