/* Does the masthead change height after the page has already been painted?
   node tools/measure-masthead.mjs

   The bottom edge of the masthead is a hard colour seam across the full width
   of the page, so any change to the masthead's height after first paint is a
   visible jump along that line — and everything below it moves too.

   Two heights are compared on each page:

     fallback  — measured before the webfonts arrive, which is what the first
                 paint actually shows
     swapped   — measured after document.fonts.ready

   They have to be equal, and nothing else here is a substitute for that.
   `min-height` looks like a cushion but is not one: at a 900px window it
   resolves to 515px against content that needs 558px, so the masthead is sized
   by what is in it and passes every reflow straight through to the seam. That
   is the normal case on a laptop, not an edge case.

   What made them unequal was `ch`. It is the advance width of the font's "0",
   and the metric-matched fallback faces in styles.css do not equalise it —
   size-adjust is one ratio for a whole face. `max-width:58ch` on the lede was
   557.78px on the fallback and 602.91px after the swap, so three lines became
   two and the seam moved 31.5px. The measures are in em now.

   Each page is measured twice: once as it ships, and once with a much longer
   headline and lede written in first. That second run is the one that matters
   for the CMS — the owner will type things nobody here chose, and the seam has
   to hold still for those too.

   Needs Chrome. jsdom has no layout, so nothing else in this repo can answer
   this question at all. Skips cleanly where there is no browser. */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(existsSync);

if (!CHROME) {
  console.log("\n  skip  no Chrome or Edge found — masthead layout not measured\n");
  process.exit(0);
}

const PAGES = ["menu-food.html", "menu-drinks.html", "menu-wine.html", "faq.html"];

/* Deliberately awkward: long enough to wrap several times, and full of the
   narrow and wide letters where a fallback face differs most from the real
   one. If the seam holds for this it will hold for a menu description. */
const LONG_TITLE = "The Food and Wine Menu for Every Occasion";
const LONG_LEDE =
  "Everything comes out of the open kitchen on the ground floor, all day, " +
  "every day of the week without exception. Khachapuri is blistered to order " +
  "in the stone oven and khinkali is pleated by hand in the morning, and the " +
  "wine list is poured by the glass until close.";

function probe(stress) {
  return `
<script>
(function () {
  var STRESS = ${stress ? "true" : "false"};
  if (STRESS) {
    var t = document.querySelector(".mhead__title");
    var l = document.querySelector(".mhead__lede");
    /* textContent, like everything else here — see the one security rule. */
    if (t) t.textContent = ${JSON.stringify(LONG_TITLE)};
    if (l) l.textContent = ${JSON.stringify(LONG_LEDE)};
  }
  function h(sel) {
    var el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().height * 100) / 100 : -1;
  }
  var fallback = h(".mhead");

  /* No requestAnimationFrame anywhere in here: under --virtual-time-budget the
     frame callback may never run and the page then reports nothing at all.
     Reading getBoundingClientRect forces the layout, which is all that is
     needed. */
  document.fonts.ready.then(function () {
    var swapped = h(".mhead");
    /* What the content actually needs, with the min-height taken away. Not a
       subtraction: the padding sits in that gap and would flatter the answer. */
    var head = document.querySelector(".mhead");
    head.style.setProperty("min-height", "0px", "important");
    var natural = h(".mhead");
    document.title = JSON.stringify({ fallback: fallback, swapped: swapped, natural: natural });
  });
})();
</script>
`;
}

function measure(page, stress) {
  const tmp = page.replace(/\.html$/, ".__probe.html");
  writeFileSync(tmp, readFileSync(page, "utf8").replace("</body>", probe(stress) + "</body>"));
  let dom;
  try {
    dom = execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--no-sandbox",
      "--window-size=1600,900", "--virtual-time-budget=15000",
      "--dump-dom", "file:///" + resolve(tmp).replace(/\\/g, "/")
    ], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
  } finally {
    unlinkSync(tmp);
  }
  const m = dom.match(/<title>(\{.*?\})<\/title>/);
  if (!m) return null;
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}

/* The stress run currently fails: with a long headline the fallback and
   Fraunces break the line in different places, and the seam moves ~98px. The
   em conversion fixed the box width, which is what the shipped copy needed;
   it cannot fix per-letter advance widths, because size-adjust is one ratio
   for a whole face.

   The fix for that is to stop the swap happening at all — `display=optional`
   on the Google Fonts request, measured at 816.84px → 816.84px against this
   same copy. It is not applied yet because it is a visible decision, not a
   technical one: a first-ever visit then renders in the metric-matched
   fallback rather than Fraunces.

   So this is reported and not failed on, deliberately and temporarily. Turn it
   fatal the moment the font loading question is answered — either because
   `optional` made it pass, or because the trade was refused and this is a
   limit we accept and should therefore stop measuring. What must not happen is
   this staying a warning by default: see memory.md, *What's still open*. */
const STRESS_IS_FATAL = false;

let failures = 0;
let warnings = 0;
console.log("\nmasthead height across the webfont swap\n");

for (const page of PAGES) {
  for (const [label, stress] of [["as shipped", false], ["owner-length copy", true]]) {
    const r = measure(page, stress);
    if (!r) {
      failures++;
      console.log(`  FAIL ${page} (${label}) — the probe never reported`);
      continue;
    }
    const moved = Math.abs(r.swapped - r.fallback);
    /* Under half a pixel is measurement rounding, not a jump anyone can see. */
    const still = moved < 0.5;
    const fatal = !still && (!stress || STRESS_IS_FATAL);
    if (fatal) failures++;
    else if (!still) warnings++;

    console.log(`  ${still ? "ok  " : fatal ? "FAIL" : "warn"} ${page.padEnd(17)} ${label.padEnd(18)} ` +
                `${r.fallback}px → ${r.swapped}px` +
                (still ? "" : `   the seam moves ${moved.toFixed(2)}px`));

    /* Reported, never failed on. Slack is not the safety property — the
       equality above is — but it says whether the masthead is sized by its
       min-height or by what is written in it, and on a laptop it is the
       second. Worth seeing rather than assuming. */
    const slack = Math.round((r.swapped - r.natural) * 10) / 10;
    if (slack <= 0.5) console.log("         sized by its content, not by min-height — no cushion");
  }
}

if (failures) {
  console.log(`\n${failures} masthead measurement(s) failed — the seam moves on load`);
} else if (warnings) {
  console.log(`\nthe seam holds for the copy that ships.\n` +
    `${warnings} warning(s): it does not hold for longer copy, and the owner will\n` +
    `write longer copy. Not fatal yet only because the fix is a decision about\n` +
    `how the fonts load — see the note above STRESS_IS_FATAL.`);
} else {
  console.log("\nthe seam holds still, for the shipped copy and for longer copy");
}
process.exit(failures ? 1 : 0);
