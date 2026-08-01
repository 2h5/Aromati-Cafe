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

let failures = 0;
console.log("\nwhat moves when the webfonts arrive\n");

for (const page of PAGES) {
  for (const [label, stress] of [["as shipped", false], ["owner-length copy", true]]) {
    const r = measure(page, stress);
    if (!r) {
      failures++;
      console.log(`  FAIL ${page.padEnd(17)} ${label} — the probe never reported`);
      continue;
    }

    const moved = [];
    for (const w of WATCH) {
      if (!(w.sel in r.before)) continue;
      const d = Math.abs(r.after[w.sel] - r.before[w.sel]);
      /* Under half a pixel is rounding in the measurement, not a jump. */
      if (d >= 0.5) {
        moved.push(`${w.why} (${w.sel}) ${r.before[w.sel]} → ${r.after[w.sel]}, ${d.toFixed(2)}px`);
      }
    }

    const watched = Object.keys(r.before).length;
    if (!watched) {
      failures++;
      console.log(`  FAIL ${page.padEnd(17)} ${label.padEnd(18)} nothing matched — has the markup moved?`);
      continue;
    }
    if (moved.length) failures++;
    console.log(`  ${moved.length ? "FAIL" : "ok  "} ${page.padEnd(17)} ${label.padEnd(18)} ` +
                `${watched} watched, ${moved.length} moved`);
    for (const line of moved) console.log(`         ${line}`);
  }
}

console.log(failures
  ? `\n${failures} measurement(s) moved — something is being laid out twice`
  : "\nnothing moves: the fonts are there for the first paint, on every page");
process.exit(failures ? 1 : 0);
