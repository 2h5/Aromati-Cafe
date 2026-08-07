/* The replaced photograph, before the first paint.
   node tools/test-photo-boot.mjs

   photo-boot.js is the one script that runs from <head>, before the body
   exists, and it does something the rest of the site never does: it hides part
   of the page. That is a good trade when it works and the worst bug on the site
   when it does not — an invisible hero is worse than a wrong one, and it would
   only appear for visitors whose cache and network are in a state the person
   deploying it does not have.

   So this asks the three questions that matter, in order of how bad the answer
   would be:

     1. Can a photograph ever stay hidden? Every path — no cache, a broken
        cache, a refused URL, a slot the renderer never visits, a stylesheet
        that cannot be built, a bfcache restore — has to end with everything
        visible. This is most of the file.

     2. Does it hide the right things? Exactly the slots with a usable
        replacement, and no others, or a first visit pays for a feature it
        cannot use.

     3. Does the security rule survive being moved earlier? The boot script
        makes the browser fetch an owner-typed URL sooner than render.js does.
        It therefore has to apply the same https-only test, at its own door. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let failures = 0;

function check(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

const BOOT = readFileSync("photo-boot.js", "utf8");
const PAGE = `<!doctype html><html><head></head><body>
  <img data-photo="hero.main" data-photo-critical src="assets/web/hero-dining.jpg">
  <img data-photo="story.one" src="assets/web/story.jpg">
  <img data-photo="strip.a" src="assets/web/strip.jpg" data-photo-decorative>
</body></html>`;

/* The boot script in a real document, with a real localStorage, run the way the
   browser runs it: from <head>, with whatever the last visit left behind. */
function boot(cache, opts = {}) {
  /* runScripts so the file can be evaluated inside the window rather than in a
     bare sandbox: it reaches for document, localStorage and window.setTimeout,
     and the point of this harness is to run it against the real ones. */
  const dom = new JSDOM(PAGE, {
    url: "https://aromati.test/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });

  /* config.js, which now loads in <head> immediately above the file under test.
     photo-boot.js reads it to answer one question — is a second answer coming
     from a database? — and the answer decides whether the above-the-fold image
     is held on a visitor who has no cache to say that it should be. Absent by
     default, because that is the file:// case and the emptied-key case, and
     both have to keep behaving as they did in Phase 1. */
  if (opts.config) {
    dom.window.eval('var AROMATI_CONFIG = { url: "https://p.supabase.co", anonKey: "' +
                    "k".repeat(40) + '" };');
  }

  const store = {};
  if (cache !== null) store["aromati:content:v3"] = typeof cache === "string"
    ? cache : JSON.stringify(cache);

  Object.defineProperty(dom.window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => {
        if (opts.throwOnRead) throw new Error("storage is disabled by policy");
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: () => {}
    }
  });

  const timers = [];
  dom.window.setTimeout = (fn, ms) => { timers.push(fn); return timers.length; };

  dom.window.eval(BOOT);

  return {
    api: dom.window.AROMATI_PHOTO_BOOT,
    doc: dom.window.document,
    window: dom.window,
    /* What the browser would actually be told to fetch early. */
    preloads: () => [...dom.window.document.querySelectorAll('link[rel="preload"]')]
      .map((l) => l.getAttribute("href")).sort(),
    /* Which slots are hidden right now, read off the live stylesheet rather
       than off the script's own bookkeeping — the bookkeeping agreeing with
       itself is not the thing a visitor experiences. */
    hiddenSlots: () => {
      const el = dom.window.document.querySelector("style[data-photo-boot]");
      if (!el || !el.sheet) return [];
      return [...el.sheet.cssRules]
        .filter((r) => /visibility:\s*hidden/.test(r.cssText))
        .map((r) => r.selectorText.replace(/^\[data-photo="(.*)"\]$/, "$1")).sort();
    },
    fireTimers: () => timers.forEach((fn) => fn())
  };
}

const REPLACED = {
  photos: {
    "hero.main":  { alt: "a", url: "https://yofoiqgknsqzsuwtlqvh.supabase.co/a.webp" },
    "story.one":  { alt: "b", url: null }
  }
};

console.log("\nwhat is held back, and what is left alone\n");
{
  const b = boot(REPLACED);
  check("the replaced slot is hidden", b.hiddenSlots(), ["hero.main"]);
  check("and its replacement is already being fetched", b.preloads(),
        ["https://yofoiqgknsqzsuwtlqvh.supabase.co/a.webp"]);
  check("a slot with no replacement is never touched",
        b.hiddenSlots().includes("story.one"), false);
  check("and nothing is preloaded for it", b.preloads().length, 1);
}

console.log("\na first visit pays nothing\n");
{
  const b = boot(null);
  check("no cache hides nothing", b.hiddenSlots(), []);
  check("and fetches nothing early", b.preloads(), []);
  check("the page is not waiting on anything", b.api.isHeld("hero.main"), false);
}

console.log("\nthe URL is checked here too, not only in render.js\n");
{
  for (const bad of ["javascript:alert(1)", "http://example.com/a.jpg",
                     "//example.com/a.jpg", "data:image/png;base64,AAAA",
                     "assets/web/a.jpg", "https://example.com/a b.jpg"]) {
    const b = boot({ photos: { "hero.main": { alt: "a", url: bad } } });
    check(`${bad.slice(0, 28)} is not fetched and not held`,
          [b.preloads().length, b.hiddenSlots().length], [0, 0]);
  }
}

console.log("\nnothing can stay hidden\n");
{
  const b = boot(REPLACED);
  check("held to begin with", b.hiddenSlots(), ["hero.main"]);
  b.fireTimers();
  check("the timeout reveals it even if nobody ever calls reveal", b.hiddenSlots(), []);
  check("and the slot no longer reports as held", b.api.isHeld("hero.main"), false);
}
{
  const b = boot(REPLACED);
  b.api.reveal("hero.main");
  check("reveal clears exactly its own rule", b.hiddenSlots(), []);
  b.api.reveal("hero.main");
  check("and calling it twice is harmless", b.hiddenSlots(), []);
}
{
  const b = boot(REPLACED);
  b.api.revealAll();
  check("revealAll empties the sheet", b.hiddenSlots(), []);
}
{
  const b = boot(REPLACED);
  const ev = b.window.document.createEvent("Event");
  ev.initEvent("pageshow", false, false);
  Object.defineProperty(ev, "persisted", { value: true });
  b.window.dispatchEvent(ev);
  check("a bfcache restore never comes back to a hidden photograph",
        b.hiddenSlots(), []);
}

console.log("\na cache that cannot be read or trusted is simply no cache\n");
{
  check("storage that throws hides nothing", boot(REPLACED, { throwOnRead: true }).hiddenSlots(), []);
  check("malformed JSON hides nothing", boot("{ not json").hiddenSlots(), []);
  check("a cache with no photos key hides nothing", boot({ menu: {} }).hiddenSlots(), []);
  check("photos as a string hides nothing", boot({ photos: "nope" }).hiddenSlots(), []);
  check("a slot whose entry is null hides nothing",
        boot({ photos: { "hero.main": null } }).hiddenSlots(), []);
}

console.log("\nthe two copies of the cache key\n");
{
  /* data.js warns at runtime when these drift. That warning is in a console
     nobody is looking at, on a site that still works — so the real guard is
     here, where a drift fails a build. */
  const dataKey = /var CACHE_KEY = "([^"]+)"/.exec(readFileSync("data.js", "utf8"));
  const bootKey = /var CACHE_KEY = "([^"]+)"/.exec(BOOT);
  check("photo-boot.js reads the key data.js writes",
        bootKey && bootKey[1], dataKey && dataKey[1]);
}

console.log("\nrender.js reports every slot it is given\n");
{
  /* The boot script's safety net is a timeout, and a timeout that is doing the
     work every time is a bug wearing a seatbelt: the photograph appears a
     second late on every visit and nothing reports it. So the renderer has to
     account for each slot on every path it can take through one.

     `slotReady` rather than `releaseSlot` is what is looked for now. Under the
     two-stage hold a slot that is ready is not necessarily a slot that may be
     shown — it may still be waiting on the refresh — and a path that released
     directly would be a path that shows the cached photograph early, which is
     the bug. Exactly one place decides, and it is slotReady.

     Whitespace-collapsed before anything is looked for. A needle carrying its
     own indentation is a needle that breaks on a reformat, on a CRLF checkout,
     or on someone wrapping a line — and it breaks by quietly not matching,
     which reads as the code having lost a report it still has. */
  const RENDER = readFileSync("render.js", "utf8");
  /* From heldNow to the end of the section: setPhoto and renderPhotos, which
     are the per-slot paths. Deliberately not the whole photographs section —
     slotReady, settlePhotos and releaseSlot itself live above it, and they are
     the machinery that is *allowed* to release. */
  const half = RENDER.slice(RENDER.indexOf("function heldNow"),
                            RENDER.indexOf("/* ── go ──"))
                     .replace(/\s+/g, " ");
  const paths = [
    ["a slot with no data at all", "if (!photo) { slotReady(img, slot); return; }"],
    ["a url the https rule refuses", "} else { slotReady(img, slot); }"],
    ["a held slot, once its picture has decoded", "img.decode().then(ready, ready);"],
    ["a src that is already correct", 'if (img.getAttribute("src") === url) { ready(); return; }'],
    ["a replacement that never loads", "}, function () {"]
  ];
  for (const [what, needle] of paths) {
    check(what + " is reported", half.includes(needle), true);
  }

  /* The one thing that must not come back. Releasing a slot from inside the
     photograph paths is how the cached picture gets shown before the refresh
     has had its say — the whole of the reported bug in one call. Everything in
     here goes through slotReady, which knows whether it is allowed yet. */
  check("nothing in the photograph paths releases a slot directly",
        /releaseSlot\(slot\)/.test(half), false);
}

console.log("\nthe above-the-fold hold, and what gates it\n");
{
  /* With no config there is no second answer coming, so holding the hero would
     be a dark panel until the deadline on a page that is already correct —
     file://, and any deploy with config.js emptied. */
  const cold = boot(null);
  check("no database configured holds nothing", cold.hiddenSlots(), []);
  check("and the boot script says so", cold.api.isLive(), false);
}
{
  const live = boot(null, { config: true });
  check("a configured database holds the above-the-fold image on a cold visit",
        live.hiddenSlots(), ["[data-photo-critical]"]);
  check("and only that — nothing else is touched on a first visit",
        live.preloads(), []);
  live.api.reveal(live.api.CRITICAL);
  check("the reserved key reveals its own rule", live.hiddenSlots(), []);
}
{
  const live = boot(REPLACED, { config: true });
  check("a returning visitor is held to exactly what the cache says",
        live.hiddenSlots(), ["hero.main"]);
  live.fireTimers();
  check("and the deadline lifts it", live.hiddenSlots(), []);
}
{
  /* The regression. Reported from a real site on 7 August 2026: the hero sat
     behind the dark panel on every load, the masthead animated over it, and
     the photograph appeared with a jolt afterwards.

     The cause was this rule firing on a visitor whose cache already said the
     hero has no replacement. The picture was decoded and ready — measured at
     `complete=true` while still hidden — and was held anyway, waiting out a
     request whose answer was "nothing changed". Every load, for nothing.

     A cache carrying an empty photos map is not an absence of information. It
     is the CMS's own answer, and the answer is that these slots show what they
     ship with. */
  const settled = boot({ photos: {} }, { config: true });
  check("a cache that says 'no replacements' holds nothing at all",
        settled.hiddenSlots(), []);
}
{
  const partial = boot({ photos: { "story.one": { alt: "b", url: null } } }, { config: true });
  check("and a cache that answers for a slot with null holds nothing either",
        partial.hiddenSlots(), []);
}
{
  /* But a cache that cannot be read is not an answer, it is silence — and
     silence about the one image above the fold is the cold visit, which is
     still held. This is the line the fix must not cross: it narrows the hold
     to visitors who know something, not away entirely. */
  const broken = boot("{ not json", { config: true });
  check("an unreadable cache is silence, and silence still holds the hero",
        broken.hiddenSlots(), ["[data-photo-critical]"]);
  const noPhotos = boot({ menu: {} }, { config: true });
  check("so is a cache with no photos key at all",
        noPhotos.hiddenSlots(), ["[data-photo-critical]"]);
}

console.log("\nthe deadline records why it fired\n");
{
  const b = boot(REPLACED, { config: true });
  check("nothing is sealed while the page is still waiting", b.api.isSealed(), false);
  b.fireTimers();
  check("the deadline seals the page", b.api.isSealed(), true);
  /* render.js reads this and declines to apply photographs from a refresh that
     lands afterwards. Without it the safety net puts the blink back: the
     visitor is looking at the cached picture by then, and dropping the new one
     in on top is exactly the swap this file exists to remove. */
}
{
  const b = boot(REPLACED, { config: true });
  b.api.revealAll();
  check("but revealing early, on purpose, is not the same as giving up",
        b.api.isSealed(), false);
}

console.log(failures
  ? `\n${failures} problem(s) — a photograph could be hidden, or shown wrong\n`
  : "\nthe shipped photograph is never painted when a replacement is known\n");
process.exit(failures ? 1 : 0);
