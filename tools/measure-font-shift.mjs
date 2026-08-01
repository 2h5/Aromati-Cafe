/* Does anything move when the webfonts arrive?
   node tools/measure-font-shift.mjs

   Text set in a fallback face is a different width from the same text in the
   real one, so if the real one arrives after the first paint the page
   re-lays-out under the visitor. Two places where that was visible here:

     the nav        the wordmark was 121.91px on the fallback and 119.08px
                    after — a fixed bar, on every page, twitching on every
                    navigation
     the masthead   its bottom edge is a hard colour seam across the page, and
                    a re-wrapped lede moved it 31.5px

   Both are fixed, by different things, and both are measured here because they
   can come back independently:

     - `ch` is the advance width of the font's own "0" and is not the same
       number of pixels in the fallback. `max-width:58ch` on the lede was 8%
       narrower before the swap, which cost it a line. The masthead measures
       are in em now. Any ch measure that ends up above the fold needs the same
       treatment.
     - The fonts are in assets/fonts and preloaded rather than fetched from
       Google, so there is no swap to survive in the first place. That is what
       took the nav to zero; the metric-matched fallbacks had it at 2.83px, and
       no amount of further tuning reaches zero, because size-adjust is one
       ratio for a whole face while individual letters differ.

   Each page is measured twice: as it ships, and with a much longer headline
   and lede written in first. The second run is the one that matters for the
   CMS — the owner will type things nobody here chose. It is not decoration: it
   failed by 97.9px while the fonts still came from Google, and its passing is
   the evidence that self-hosting fixed the general case rather than the one
   sentence that happens to be in the file today.

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
  console.log("\n  skip  no Chrome or Edge found — font shift not measured\n");
  process.exit(0);
}

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* What is watched, and why. The nav is on every page and fixed in place, so
   anything that moves there moves on every navigation. The wordmark and the
   Menus button are measured separately from the bar because the bar's own
   height never changed — the movement was inside it. */
const WATCH = [
  { sel: ".nav__brand", axis: "width",  why: "the wordmark" },
  { sel: ".nav__links", axis: "width",  why: "the section links" },
  { sel: "#menusBtn",   axis: "width",  why: "the Menus button" },
  { sel: ".mhead",      axis: "height", why: "the masthead seam" },
  { sel: ".hero",       axis: "height", why: "the home page's opening screen" }
];

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
  var WATCH = ${JSON.stringify(WATCH)};
  if (${stress ? "true" : "false"}) {
    /* textContent, like everything else here — see the one security rule. */
    var t = document.querySelector(".mhead__title") || document.querySelector(".hero__title");
    var l = document.querySelector(".mhead__lede")  || document.querySelector(".hero__sub");
    if (t) t.textContent = ${JSON.stringify(LONG_TITLE)};
    if (l) l.textContent = ${JSON.stringify(LONG_LEDE)};
  }
  function snap() {
    var o = {};
    WATCH.forEach(function (w) {
      var el = document.querySelector(w.sel);
      if (!el) return;                       // not on this page, nothing to watch
      var r = el.getBoundingClientRect();
      o[w.sel] = Math.round(r[w.axis] * 100) / 100;
    });
    return o;
  }
  var before = snap();

  /* No requestAnimationFrame: under --virtual-time-budget the frame callback
     may never run and the page then reports nothing at all. Reading
     getBoundingClientRect forces the layout, which is all that is needed. */
  document.fonts.ready.then(function () {
    document.title = JSON.stringify({ before: before, after: snap() });
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
  const m = dom.match(/<title>(\{.*\})<\/title>/);
  if (!m) return null;
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}

/* What is asserted, and why it is not the obvious thing.

   The obvious test is "measure before the fonts are ready, measure after, they
   must match". That is what this did first, and it is unreliable — it failed 1,
   2 and 0 times across three consecutive runs of an unchanged tree.

   The reason is not flakiness in the browser, it is that the "before" state is
   not a real one. The critical faces carry no font-display, so the browser does
   not paint text in a fallback and replace it; it waits, then paints once.
   getBoundingClientRect still answers before the font object has finished
   parsing, so it reports fallback metrics for a layout that was never on
   screen. Asserting on that is asserting on noise, and a guard that fails at
   random is a guard people learn to ignore.

   So the assertion is on the settled layout: it must match a committed baseline
   of the real fonts' metrics. That is what catches the failure that actually
   ships — the page rendering in Georgia instead of Fraunces for a whole load,
   which is exactly what font-display: optional did here. The complementary
   half, "no face is able to swap in the first place", is structural and lives
   in check-fonts.mjs where it can be checked exactly.

   The before/after delta is still printed, because it is useful when something
   is wrong. It is not failed on. */
const BASELINE = "tools/font-metrics.json";
const recorded = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const fresh = {};
const writing = process.argv.includes("--record");

let failures = 0;
console.log(`\nthe settled layout, against ${writing ? "a new baseline" : BASELINE}\n`);

for (const page of PAGES) {
  for (const [label, stress] of [["as shipped", false], ["owner-length copy", true]]) {
    const key = `${page} ${label}`;
    const r = measure(page, stress);
    if (!r) {
      failures++;
      console.log(`  FAIL ${page.padEnd(17)} ${label} — the probe never reported`);
      continue;
    }

    const watched = Object.keys(r.after).length;
    if (!watched) {
      failures++;
      console.log(`  FAIL ${page.padEnd(17)} ${label.padEnd(18)} nothing matched — has the markup moved?`);
      continue;
    }
    fresh[key] = r.after;

    /* Printed, never failed on — see the note above. */
    const drift = WATCH
      .filter((w) => w.sel in r.before && Math.abs(r.after[w.sel] - r.before[w.sel]) >= 0.5)
      .map((w) => `${w.why} settled at ${r.after[w.sel]}, was reading ${r.before[w.sel]} pre-parse`);

    if (writing || !recorded[key]) {
      console.log(`  rec  ${page.padEnd(17)} ${label.padEnd(18)} ${watched} recorded`);
      continue;
    }

    const wrong = WATCH
      .filter((w) => w.sel in r.after && w.sel in recorded[key])
      .filter((w) => Math.abs(r.after[w.sel] - recorded[key][w.sel]) >= 0.5)
      .map((w) => `${w.why} (${w.sel}) is ${r.after[w.sel]}, baseline says ${recorded[key][w.sel]}`);

    if (wrong.length) failures++;
    console.log(`  ${wrong.length ? "FAIL" : "ok  "} ${page.padEnd(17)} ${label.padEnd(18)} ` +
                `${watched} watched`);
    for (const line of wrong) console.log(`         ${line}`);
    if (wrong.length) {
      console.log("         the page is not settling in the fonts it is supposed to.");
      console.log("         If the design genuinely changed, re-record: npm run check:layout -- --record");
    }
    for (const line of drift) console.log(`         note: ${line}`);
  }
}

if (writing || Object.keys(recorded).length === 0) {
  writeFileSync(BASELINE, JSON.stringify(fresh, null, 2) + "\n");
  console.log(`\nbaseline written to ${BASELINE} — commit it, and read the diff`);
  process.exit(0);
}

console.log(failures
  ? `\n${failures} page(s) do not settle where they should`
  : "\nevery page settles in the real fonts, with the shipped copy and with longer copy");
process.exit(failures ? 1 : 0);
