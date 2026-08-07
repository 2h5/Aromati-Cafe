/* The photograph hold, in a browser that actually paints.
   node tools/test-photo-browser.mjs

   tools/test-photo-settle.mjs asks the same questions in jsdom, and jsdom
   cannot answer the one that matters most. It has no image pipeline, no
   decode, no compositor and no frames — so "was this photograph visible?" is
   there a question about CSS rules in a stylesheet, answered by reading them.
   A real browser answers it by painting, and the gap between those two is
   exactly where a hold that looks correct can still blink.

   So this runs the real pages in headless Chrome, with a CMS response
   deliberately throttled to the width of the problem, and samples the hero as
   fast as the clock allows: is it visible, and if so, which file is in it? A pass
   is a run in which the answer changed exactly once — from nothing to the
   right photograph.

   It also settles the one question nobody should take on trust: whether a
   pagehide handler can put anything on screen before a hard reload tears the
   document down. See the last section; the answer is no, and it is measured
   rather than assumed.

   Needs Chrome. Skips cleanly without it — which, as everywhere else in this
   repo, means a green run on a machine with no browser proves nothing. */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(existsSync);

if (!CHROME) {
  console.log("\n  skip  no Chrome or Edge found — the photograph hold was not painted\n");
  process.exit(0);
}

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").slice(0, 8).map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);
const check = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(what);
  else fail(what, `want: ${JSON.stringify(want)}\n got: ${JSON.stringify(got)}`);
};

const PAGE = "index.html";
const SHIPPED = "hero-wine-frame";

/* The probe goes in immediately after config.js, which is in <head> above
   photo-boot.js. It has to be there and not lower: photo-boot.js decides
   whether to hold the hero from AROMATI_CONFIG and from localStorage, both
   read before the body is parsed, so a probe injected at the foot of the page
   would be setting up a world the code under test has already left. */
function probeFor({ cached, delayMs, cmsPhoto }) {
  return `<script>
(function () {
  window.AROMATI_CONFIG = { url: "https://example.invalid", anonKey: "x".repeat(40) };

  var CMS = ${JSON.stringify(cmsPhoto)};
  var CACHED = ${JSON.stringify(cached)};

  /* Seed the cache the way a previous visit would have left it: with whatever
     the database said LAST time. This is the returning visitor, and the gap
     between this value and the one below is the whole reported bug. */
  if (CACHED) {
    try {
      localStorage.setItem("aromati:content:v3", JSON.stringify({
        menu: {}, hours: [], hoursNote: null, exceptions: {},
        settings: {}, copy: {},
        photos: { "hero.main": { alt: "cached", url: CACHED } }
      }));
    } catch (e) {}
  } else {
    try { localStorage.removeItem("aromati:content:v3"); } catch (e) {}
  }

  /* A throttled database. Every table answers after the same delay, which is
     the point of the run: the window in which the page is holding a picture it
     already has and could show is open for that long, and any bug that shows
     the wrong one has that long to do it. */
  var seeded = false;
  window.fetch = function (url) {
    var table = String(url).split("/rest/v1/")[1].split("?")[0];
    return new Promise(function (resolve) {
      setTimeout(function () {
        var rows = [];
        if (table === "site_settings") rows = [{ key: "email", value: "a@b.c" }];
        else if (table === "site_copy") rows = [{ key: "x", value: "y" }];
        else if (table === "business_hours") {
          for (var d = 0; d < 7; d++) {
            rows.push({ day_of_week: d, is_closed: false,
                        opens_at: "07:00:00", closes_at: "22:00:00" });
          }
        } else if (table === "menu_courses") {
          rows = [{ id: "c1", page: "food", course_key: "k", tab_label: "T",
                    heading: "H", sizes: null, is_static: false,
                    static_id: null, sort_order: 0 }];
        } else if (table === "menu_items") {
          rows = [{ id: "i1", course_id: "c1", name: "N", tag: null,
                    description: null, price: 1, prices: null,
                    price_all_sizes: null, no_price: false, is_hidden: false,
                    options_dom_id: null, sort_order: 0,
                    menu_item_pours: [], menu_item_options: [] }];
        } else if (table === "photos") {
          rows = CMS ? [{ slot: "hero.main", storage_path: "x.webp", alt: "from the cms" }] : [];
        }
        seeded = true;
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve(rows); } });
      }, ${delayMs});
    });
  };

  /* data.js builds the storage URL out of AROMATI_CONFIG.url, and that origin
     does not exist — so an <img> pointed at it would never load and the run
     would prove nothing about decoding or about what gets painted.

     So the two places a photograph URL reaches an element are intercepted and
     pointed at a real file in the repo: setAttribute("src", …), which is how
     render.js fills a slot, and the src property, which is how it primes the
     off-DOM Image it decodes first. Both, or the interesting path is the one
     that gets missed. The file is deliberately not the shipped hero, so a swap
     cannot hide inside an identical picture. */
  function rewrite(v) {
    return (typeof v === "string" && v.indexOf("https://example.invalid") === 0)
      ? ${JSON.stringify(cmsPhoto || "")} : v;
  }
  var elSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    return elSet.call(this, name, name === "src" ? rewrite(value) : value);
  };
  var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true, enumerable: srcDesc.enumerable,
    get: function () { return srcDesc.get.call(this); },
    set: function (v) { srcDesc.set.call(this, rewrite(v)); }
  });

  var errs = [];
  window.addEventListener("error", function (e) { errs.push(String(e.message || e.error)); });

  /* ── the instrument ──
     getComputedStyle is the honest question: it accounts for whatever rules
     photo-boot.js turns out to have inserted, rather than re-deriving them
     here and agreeing with a bug.

     Driven by a timer and not by requestAnimationFrame, which is the obvious
     choice and does not work: under --virtual-time-budget the clock is
     advanced far faster than frames are produced, so a rAF chain fires once
     and then starves — the first version of this file sampled "(held)" and
     nothing else on a run whose hero demonstrably ended up visible. Timers are
     what virtual time advances, so a timer sees every state the page passes
     through. Sampling frames would be closer to what a visitor sees; sampling
     nothing is not closer to anything. */
  var seen = [];
  function file(src) {
    var s = String(src).split("#")[0].split("?")[0];
    return s.substring(s.lastIndexOf("/") + 1).replace(/\\.[a-z0-9]+$/i, "");
  }
  function sample() {
    var img = document.querySelector('[data-photo="hero.main"]');
    if (img) {
      var vis = getComputedStyle(img).visibility;
      var tag = vis === "hidden" ? "(held)" : file(img.currentSrc || img.src);
      if (seen[seen.length - 1] !== tag) seen.push(tag);
    }
    setTimeout(sample, 8);
  }
  sample();

  /* --virtual-time-budget lets the whole load run in a fraction of the wall
     clock, so this is well past everything: the throttled response, the
     decode, and photo-boot.js's 1200ms deadline. */
  setTimeout(function () {
    var img = document.querySelector('[data-photo="hero.main"]');
    var sheet = document.querySelector("style[data-photo-boot]");
    document.title = JSON.stringify({
      seen: seen,
      answered: seeded,
      errors: errs,
      /* Read at the end, so a run that reports nothing but "(held)" says
         whether the hold is still on or the sampler simply never ran. Those
         are very different bugs and one of them is in this file. */
      endVisibility: img ? getComputedStyle(img).visibility : "no element",
      rulesLeft: sheet && sheet.sheet
        ? [].map.call(sheet.sheet.cssRules, function (r) { return r.selectorText; })
        : []
    });
  }, 4000);
}());
</script>`;
}

function run(probe, page = PAGE) {
  const html = readFileSync(page, "utf8")
    .replace('<script src="photo-boot.js"></script>', probe + '\n<script src="photo-boot.js"></script>');
  const tmp = `tmp-photo-browser-${Date.now()}.html`;
  writeFileSync(tmp, html);
  try {
    const dom = execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--no-sandbox",
      "--window-size=1600,900", "--virtual-time-budget=20000",
      "--dump-dom", "file:///" + resolve(tmp).replace(/\\/g, "/")
    ], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
    const m = dom.match(/<title>(\{.*?\})<\/title>/);
    return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) : null;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

/* The photograph the "CMS" hands back. A real file in the repo so it decodes,
   and visibly not the shipped hero so a swap cannot hide. */
const CMS_FILE = "assets/web/dining-wide.jpg";
const CMS = "dining-wide";

console.log("\na first visit, with the database throttled to 600ms\n");
{
  const r = run(probeFor({ cached: null, delayMs: 600, cmsPhoto: CMS_FILE }));
  if (!r) fail("the page did not report", "no probe result in <title>");
  else {
    check("the database did answer", r.answered, true);    check("the hero is held, then shows the CMS photograph, and that is all",
          r.seen, ["(held)", CMS]);
    check("the shipped photograph was never painted",
          r.seen.some((s) => s === SHIPPED), false);
  }
}

console.log("\na reload after the owner changed the photograph\n");
{
  /* The cache holds the shipped hero — a returning visitor whose last visit
     predates the edit — and the database now says something else. This is the
     exact sequence the owner reported: reload, watch the old picture, watch it
     be replaced. */
  const r = run(probeFor({
    cached: "assets/web/hero-wine-frame.webp", delayMs: 600, cmsPhoto: CMS_FILE
  }));
  if (!r) fail("the page did not report", "no probe result in <title>");
  else {
    check("the cached photograph is never painted, only the new one",
          r.seen, ["(held)", CMS]);
    check("no reload shows two photographs", r.seen.filter((s) => s !== "(held)").length, 1);
  }
}

console.log("\nthe database never answers at all\n");
{
  /* Past the 1200ms deadline by a wide margin. The page has to stop waiting
     and show what it has — the shipped photograph, since the cache is empty. */
  const r = run(probeFor({ cached: null, delayMs: 999999, cmsPhoto: CMS_FILE }));
  if (!r) fail("the page did not report", "no probe result in <title>");
  else {
    check("the deadline fires and the shipped photograph appears",
          r.seen, ["(held)", SHIPPED]);
    check("and it is not replaced afterwards",
          r.seen.filter((s) => s !== "(held)").length, 1);
  }
}

/* What is deliberately NOT checked here: the rule that a database answering
   *after* the deadline has its photographs dropped rather than swapped in.

   It was written, it passed, and it passed for the wrong reason — with the
   guard deleted from render.js it went on passing, because a decode() started
   that late in a --virtual-time-budget run rejects, so the swap the check was
   watching for could not have happened either way. A check that cannot fail is
   worse than no check: it reads as coverage.

   That rule is exercised in tools/test-photo-settle.mjs instead, where the
   deadline can be fired by hand at a known moment and the late answer released
   after it. Sabotaging the guard fails it there. This file keeps the case
   above — a database that never answers at all — which is the deadline itself
   and does fail when the deadline is broken. */

/* ── can a pagehide handler cover the outgoing document? ────────────────────

   Worth asking, because if it could, a hard reload could be masked from the
   moment the visitor pressed the key rather than only from the new document's
   first paint — and every discussion of this problem eventually proposes it.

   It cannot, and this measures rather than assumes. The probe paints a cover
   in a pagehide handler and then asks the only question that decides it: did
   the browser produce a frame after the handler ran? requestAnimationFrame is
   the frame callback, so a rAF that never fires is a frame that never
   happened, and a cover that is never composited is a cover nobody saw.

   The result is recorded in sessionStorage and read by the document that
   replaces it, because the document that ran the handler is gone. */
console.log("\ncan pagehide paint before a hard reload?\n");
{
  const probe = `<script>
(function () {
  window.AROMATI_CONFIG = { url: "https://example.invalid", anonKey: "x".repeat(40) };
  window.fetch = function () { return new Promise(function () {}); };

  var prior = sessionStorage.getItem("pagehide-probe");
  if (prior) {
    document.title = prior;
    return;
  }

  window.addEventListener("pagehide", function () {
    var cover = document.createElement("div");
    cover.style.cssText = "position:fixed;inset:0;background:#f4ede1;z-index:99999";
    document.body.appendChild(cover);
    /* Force layout, so the browser has genuinely computed the cover and the
       only thing left between it and the visitor is a paint. */
    var forced = cover.offsetHeight;
    var framed = false;
    requestAnimationFrame(function () { framed = true; });
    /* Nothing may await anything here — the document is being torn down. What
       is recorded is the state at the end of the handler, plus whether a frame
       callback had already run by then, which is the only way a paint could
       have happened. */
    sessionStorage.setItem("pagehide-probe", JSON.stringify({
      handlerRan: true,
      coverInDocument: !!cover.parentNode,
      layoutComputed: forced > 0,
      framePaintedAfterHandler: framed
    }));
  });

  setTimeout(function () { location.reload(); }, 500);
}());
</script>`;

  const r = run(probe);
  if (!r) fail("the pagehide probe did not report", "no result in <title>");
  else {
    check("the handler runs, and the cover really is in the document",
          [r.handlerRan, r.coverInDocument, r.layoutComputed], [true, true, true]);
    /* The finding. If this is ever `true` on some browser, masking a hard
       reload becomes possible and this file should say so — but the site must
       not be built on it, because it is false here and false by spec intent:
       the document is being unloaded and the compositor is done with it. */
    check("but no frame is produced after it — nothing painted, nothing seen",
          r.framePaintedAfterHandler, false);
  }
}

console.log(failures
  ? `\n${failures} problem(s) — a photograph is painted and replaced in a real browser\n`
  : "\nin a real browser, the hero is painted once and it is the right one\n");
process.exit(failures ? 1 : 0);
