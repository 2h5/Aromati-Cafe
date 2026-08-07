/* One photograph, once, and it is the right one.
   node tools/test-photo-settle.mjs

   tools/test-photo-boot.mjs asks whether photo-boot.js hides and reveals the
   right things in isolation. This asks the question a visitor actually has:
   over a whole page load, with a real database answer arriving mid-flight, is
   a photograph ever *replaced* in front of them?

   That is a different question and it needs a different rig, because the bug
   it exists to catch lives in the seam between three files. photo-boot.js hides
   a slot in <head>. render.js paints the cached picture into it. data.js comes
   back from the network a moment later with a different one. Every one of those
   three steps was correct on its own while the hero went on blinking on every
   reload, because nobody owned the *order*.

   So each case below runs a real page and asks the same two things:

     1. What was on screen, and visible, at every point in the load?
        `seen()` is the whole test — it reports the src of a photograph only if
        that photograph is actually visible, and a case passes when the list of
        things a visitor could have seen has exactly one entry in it.

     2. Did it end visible? Every path, including the ugly ones, has to finish
        with nothing hidden. A blinking hero is a bad site; a permanently blank
        hero is a broken one, and this rewrite made the second failure easier
        to cause than it was before. */

import { boot, seedRows, serve, settle, reporter } from "./page-boot.mjs";

const { state, check, fail, pass } = reporter();

const STORAGE = "https://stub.invalid/storage/v1/object/public/site-photos/";
const HERO = "hero.main";
const SHIPPED = "assets/web/hero-wine-frame.webp";

/* A photos table with one row: the hero, pointing at `name`. The URL data.js
   builds from a storage path is not written out here — it is derived the same
   way data.js derives it, so a change to that shape breaks this loudly rather
   than making every comparison quietly false. */
const photoRows = (name) => [{ slot: HERO, storage_path: name, alt: "the dining room" }];
const photoUrl = (name) => STORAGE + name;

/* The database, answering after the cached photograph has already decoded.

   The delay is the point, not an approximation. A returning visitor's cached
   picture comes out of the immutable HTTP cache in single-digit milliseconds
   while the round trip to Supabase takes hundreds — so the interesting window,
   the one where the page is holding a picture it has ready and could show, is
   always open by the time the answer lands. An instant stub closes that window
   before the test can look through it, and the whole class of ordering bug
   this file exists for slips past. */
const slow = (rows, ms = 25) => {
  const inner = serve(rows);
  return async (url) => {
    await new Promise((r) => setTimeout(r, ms));
    return inner(url);
  };
};

/* What data.js would have left in localStorage after a visit that saw `name`.
   This is the returning visitor's starting state and the thing that makes the
   second blink possible: it is one edit behind the database by construction. */
function cacheShowing(name) {
  const rows = seedRows();
  return {
    menu: {}, hours: new Array(7).fill({ closed: false, opens: 420, closes: 1320 }),
    hoursNote: null, exceptions: {},
    settings: { address: {}, orderingLinks: {} },
    copy: { seeded: "yes" },
    photos: name ? { [HERO]: { alt: "the dining room", url: photoUrl(name) } } : {},
    _rows: rows.length
  };
}

/* ── the instrument ─────────────────────────────────────────────────────────
   A photograph the visitor cannot see has not been shown, however wrong it is.
   So this reads the boot script's own stylesheet — the live one, not the
   script's bookkeeping — works out whether the hero is visible right now, and
   records its src only if it is. */
function watcher(win) {
  const doc = win.document;
  const img = doc.querySelector(`[data-photo="${HERO}"]`);
  const seen = [];

  const hiddenRules = () => {
    const el = doc.querySelector("style[data-photo-boot]");
    if (!el || !el.sheet) return [];
    return [...el.sheet.cssRules]
      .filter((r) => /visibility:\s*hidden/.test(r.cssText))
      .map((r) => r.selectorText);
  };

  const visible = () => {
    if (!img) return false;
    const rules = hiddenRules();
    if (rules.includes(`[data-photo="${HERO}"]`)) return false;
    if (rules.includes("[data-photo-critical]") &&
        img.hasAttribute("data-photo-critical")) return false;
    return true;
  };

  const sample = () => {
    if (!visible()) return;
    const src = img && img.getAttribute("src");
    if (src && seen[seen.length - 1] !== src) seen.push(src);
  };

  sample();
  return { sample, seen, visible, hiddenRules, img };
}

/* jsdom will not tell us when a microtask flipped a CSS rule, so the page is
   sampled on every turn of the loop while it settles. A photograph shown for
   even one tick lands in `seen`. */
async function run(opts) {
  const page = opts.page || "index.html";
  const env = boot(page, opts);
  const w = watcher(env.window);
  for (let i = 0; i < 40; i++) {
    w.sample();
    await new Promise((r) => setTimeout(r, 1));
  }
  await settle();
  w.sample();
  return { ...env, ...w };
}

const only = (what, got, want) => check(what, got, [want]);

/* ── 1. a first visit, with a photograph already in the CMS ─────────────────
   No cache, so nothing on this machine knows a replacement exists. The old
   behaviour was to paint the shipped photograph and swap when the database
   answered — the blink a first-time visitor got, and the one photo-boot.js
   used to say could not be solved at runtime. It can; it costs a round trip. */
console.log("\na first visit, with a photograph already in the CMS\n");
{
  const r = await run({
    fetcher: slow({ ...seedRows(), photos: photoRows("new.webp") })
  });
  only("the visitor sees the CMS photograph and nothing before it",
       r.seen, photoUrl("new.webp"));
  check("the shipped photograph was never visible",
        r.seen.includes(SHIPPED), false);
  check("and the hero ends up visible", r.visible(), true);
}

/* ── 2. a stale cache, replaced by a newer CMS photograph ───────────────────
   The reported bug, exactly. The cache holds what the database said last time;
   the database now says something else. Both are "correct" data and the visitor
   must still only ever see one of them. */
console.log("\na stale cached photograph, replaced by a newer one\n");
{
  const r = await run({
    cache: cacheShowing("old.webp"),
    fetcher: slow({ ...seedRows(), photos: photoRows("new.webp") })
  });
  only("only the new photograph is ever visible", r.seen, photoUrl("new.webp"));
  check("the cached one is never painted in front of the visitor",
        r.seen.includes(photoUrl("old.webp")), false);
  check("and the hero ends up visible", r.visible(), true);
}

/* ── 3. the cache is already right ──────────────────────────────────────────
   The common case on a site nobody is editing today. There is nothing to wait
   for, but the page cannot know that until the database says so — so what is
   being checked is that the wait ends and ends on the correct picture, not
   that it never happened. */
console.log("\nthe cache and the database agree\n");
{
  const r = await run({
    cache: cacheShowing("same.webp"),
    fetcher: slow({ ...seedRows(), photos: photoRows("same.webp") })
  });
  only("one photograph, shown once", r.seen, photoUrl("same.webp"));
  check("nothing is left hidden", r.hiddenRules(), []);
}

/* ── 4. the owner keeps changing it ─────────────────────────────────────────
   Each visit starts from the cache the previous one wrote, which is the loop
   that made this permanent: every edit puts the cache one behind again, so a
   fix that only works on the second reload is not a fix. Three edits, three
   reloads, and no reload may show two photographs. */
console.log("\nthe owner changes the photograph three times running\n");
{
  let cache = null;
  for (const name of ["first.webp", "second.webp", "third.webp"]) {
    const r = await run({
      cache,
      fetcher: slow({ ...seedRows(), photos: photoRows(name) })
    });
    only(`edit → ${name}: one photograph, shown once`, r.seen, photoUrl(name));
    /* Carry the real cache forward rather than a hand-built one — what the
       next visit starts from has to be what this visit actually wrote. */
    const raw = r.store.get([...r.store.keys()].find((k) => k.startsWith("aromati:content")));
    cache = raw ? JSON.parse(raw) : null;
  }
}

/* ── 5. the database is unreachable ─────────────────────────────────────────
   Offline, DNS, a paused project, a rotated key. The page is already rendered
   from cache or seed and the only thing that matters is that the hold lets go. */
console.log("\nthe database is unreachable\n");
{
  const r = await run({
    cache: cacheShowing("cached.webp"),
    fetcher: async () => { throw new Error("offline"); }
  });
  only("the cached photograph is shown, once, and kept", r.seen, photoUrl("cached.webp"));
  check("nothing is left hidden", r.hiddenRules(), []);
}
{
  const r = await run({ fetcher: async () => { throw new Error("offline"); } });
  only("with no cache either, the shipped photograph is shown", r.seen, SHIPPED);
  check("nothing is left hidden", r.hiddenRules(), []);
}

/* ── 6. opened from a folder ────────────────────────────────────────────────
   No key, so no request will ever be made and there is nothing to wait for.
   The hold must not exist at all here — this is the path where a bug would
   mean a dark hero until the deadline on a page that is otherwise perfect. */
console.log("\nopened from file://, with no database configured\n");
{
  const r = await run({ seedOnly: true });
  only("the shipped photograph, immediately", r.seen, SHIPPED);
  check("nothing was ever held", r.hiddenRules(), []);
  check("no request was attempted", r.requests, []);
}

/* ── 7. the deadline ────────────────────────────────────────────────────────
   The network is slower than photo-boot.js is willing to wait. Two things have
   to happen and the second is the one worth the test: the page gives up and
   shows what it has, and then, when the answer finally lands, it does *not*
   put the new photograph in. Swapping it there would be the original bug,
   recreated by the safety net written to prevent a different one. */
console.log("\nthe database answers after the deadline\n");
{
  let release;
  const slow = new Promise((r) => { release = r; });

  const r = await run({
    cache: cacheShowing("cached.webp"),
    /* Replace the deadline with one we can fire by hand. Everything else about
       photo-boot.js — that it is armed before anything is hidden, that it
       reveals everything, that it records why — runs for real. */
    patch: (win) => {
      const real = win.setTimeout;
      win.setTimeout = (fn, ms) => (ms === 1200 ? (win.__expire = fn, 0) : real(fn, ms));
    },
    fetcher: async (url) => {
      await slow;
      return serve({ ...seedRows(), photos: photoRows("late.webp") })(url);
    }
  });

  check("the hero is still held while the request is in flight", r.visible(), false);
  if (typeof r.window.__expire !== "function") fail("the deadline was never armed");
  else pass("the deadline was armed in <head>, before anything was hidden");

  r.window.__expire();
  r.sample();
  only("firing it shows the photograph the page already had",
       r.seen, photoUrl("cached.webp"));
  check("and nothing is hidden any more", r.hiddenRules(), []);

  release();
  for (let i = 0; i < 40; i++) { r.sample(); await new Promise((x) => setTimeout(x, 1)); }
  await settle();
  r.sample();

  only("the late answer does not swap the photograph out from under the visitor",
       r.seen, photoUrl("cached.webp"));
  check("but it is cached, so the next load opens on it",
        JSON.parse(r.store.get("aromati:content:v3")).photos[HERO].url,
        photoUrl("late.webp"));
}

/* ── 8. the entrance still plays ────────────────────────────────────────────
   The hold covers the photograph and nothing else on purpose. If it ever grew
   to cover the hero itself, the title would animate to completion underneath
   it and the page would arrive already finished — which is the full-page
   loading screen this was written not to be. */
console.log("\nthe hold covers the photograph and not the page\n");
{
  const r = await run({
    cache: cacheShowing("old.webp"),
    fetcher: slow({ ...seedRows(), photos: photoRows("new.webp") })
  });
  const doc = r.doc;
  const rules = r.hiddenRules();
  check("no rule hides anything but photographs",
        rules.filter((s) => !/^\[data-photo/.test(s)), []);
  check("the hero title is in the document and animatable",
        !!doc.querySelector(".hero__title"), true);
  check("the boot stylesheet never touches body or a section",
        rules.some((s) => /body|\.hero\b|\.mhead\b/.test(s)), false);
}

/* ── 9. a restore from the back/forward cache ───────────────────────────────
   The page comes back fully rendered and no script re-runs. If a rule were
   still in the sheet the photograph would be invisible with nothing left to
   reveal it. */
console.log("\nrestored from the back/forward cache\n");
{
  const r = await run({
    cache: cacheShowing("cached.webp"),
    fetcher: slow({ ...seedRows(), photos: photoRows("cached.webp") })
  });
  const ev = r.window.document.createEvent("Event");
  ev.initEvent("pageshow", false, false);
  Object.defineProperty(ev, "persisted", { value: true });
  r.window.dispatchEvent(ev);
  check("nothing is hidden after the restore", r.hiddenRules(), []);
  check("and the photograph is visible", r.visible(), true);
}

/* ── 10. every page, not just the home page ─────────────────────────────────
   The mastheads are held by the same rule. A page that grew a masthead and no
   attribute would silently opt out of all of this. */
console.log("\nevery public page holds exactly one image above the fold\n");
for (const page of ["index.html", "faq.html", "menu-food.html",
                    "menu-drinks.html", "menu-wine.html"]) {
  const r = await run({
    page,
    fetcher: serve({ ...seedRows(), photos: [] })
  });
  const marked = r.doc.querySelectorAll("[data-photo][data-photo-critical]");
  check(`${page.padEnd(16)} marks one`, marked.length, 1);
  check(`${page.padEnd(16)} ends with nothing hidden`, r.hiddenRules(), []);
  check(`${page.padEnd(16)} reported no broken step`, r.errors, []);
}

console.log(state.failures
  ? `\n${state.failures} problem(s) — a photograph is replaced in view, or left hidden\n`
  : "\nno visitor, on any path, watches a photograph change\n");
process.exit(state.failures ? 1 : 0);
