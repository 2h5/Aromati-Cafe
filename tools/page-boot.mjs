/* Booting a real page under a controlled network.
   Not a test. Imported by tools/test-resilience.mjs and tools/test-hours-live.mjs.

   Both of those ask a question that can only be answered by a whole page: the
   real markup, the real render.js and the real script.js, with fetch under the
   harness's control and the clock stopped. Building that twice would mean two
   rigs drifting apart, and the one that drifted would keep passing — so it is
   built once, here.

   What this deliberately does NOT do is assert anything. A shared helper that
   also has opinions about what a good page looks like ends up deciding what its
   callers are allowed to ask. Every check lives in the harness that wants it.

   Three things in here are load-bearing and are commented where they sit: the
   script tags are read off the page rather than listed, config.js is always
   replaced, and the clock is frozen. */

import { readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";

/* A Wednesday, mid-afternoon, New York. The open/closed pill is the one thing
   on these pages that changes by itself, and a harness whose result depends on
   when it was run is a harness people stop believing. */
export const FROZEN = "2026-08-05T15:30";

/* Read out of data.js rather than written down here. A harness that seeds the
   cache under last version's key seeds nothing at all: data.js finds no cache,
   renders the seeds, and every assertion about what a returning visitor sees
   quietly becomes an assertion about a first visit — which passes, and means
   nothing. This file held "aromati:content:v2" as a literal for exactly as
   long as data.js did. */
export const CACHE_KEY = (readFileSync("data.js", "utf8")
  .match(/CACHE_KEY\s*=\s*"([^"]+)"/) || [])[1];
if (!CACHE_KEY) throw new Error("page-boot: no CACHE_KEY found in data.js");

export function boot(page, {
  fetcher, cache = null, key = "k".repeat(40), seedOnly = false, now = FROZEN
} = {}) {
  /* pretendToBeVisual buys requestAnimationFrame, which the tab filter needs:
     it commits the new selection inside a rAF. Without it a click schedules a
     callback that throws in a timer, outside any try/catch on the page — which
     is how a harness kills itself instead of reporting. */
  const dom = new JSDOM(readFileSync(page, "utf8"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://aromatinyc.com/" + page
  });
  const { window } = dom;

  const errors = [];       // console.error — the site's own report of a broken step
  const warnings = [];     // console.warn  — expected in several paths, not a failure
  const thrown = [];       // an exception that escaped a <script> entirely
  window.console = {
    log() {}, info() {}, debug() {},
    warn: (...a) => warnings.push(a.map(String).join(" ")),
    error: (...a) => errors.push(a.map(String).join(" "))
  };
  window.addEventListener("error", (e) => thrown.push(String(e.error || e.message)));

  if (now) {
    /* Fixing the instant rather than the timezone keeps the site's Intl
       formatting on the real code path — the clock is read in
       America/New_York no matter where the page is opened.

       -04:00 is New York in August, which is where FROZEN sits and was fine
       while every caller sat there with it. A harness reaching for a date in
       the winter, or either side of a daylight saving change, has to say so:
       pass a `now` that carries its own offset and it is used as written. */
    const fixed = new Date(
      /[+-]\d{2}:\d{2}$/.test(now) ? now : `${now}:00-04:00`).getTime();
    const RealDate = window.Date;
    class FakeDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    }
    window.Date = FakeDate;
  }

  /* script.js expects a browser. Reporting reduced motion is the honest stub —
     a real code path the site supports — and it keeps the choreography out of
     tests that are about what is on the page, not about how it arrives. */
  window.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};

  const store = new Map();
  if (cache) store.set(CACHE_KEY, JSON.stringify(cache));
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  });

  const requests = [];
  window.fetch = (...a) => {
    requests.push(String(a[0]));
    if (!fetcher) return Promise.reject(new Error("no fetcher installed"));
    return fetcher(...a);
  };

  const inject = (code) => {
    const s = window.document.createElement("script");
    s.textContent = code;
    window.document.body.appendChild(s);
  };

  /* config.js is never the real one, so no request can leave the machine even
     if a stub is wrong. seedOnly is the file:// case: no key at all, which is
     what a page opened from a folder has, and what data.js treats as "do not
     even ask". */
  inject(`var AROMATI_CONFIG = { url: "https://stub.invalid", anonKey: ${
    seedOnly ? '""' : JSON.stringify(key)} };`);

  /* Read off the page rather than listed here, for the same reason
     verify-phase1.mjs does it: a page that starts loading a new file must not
     go on passing a test that never loads it. lenis is a third-party animation
     library with nothing to say about any of this. */
  const srcs = [...window.document.querySelectorAll("script[src]")]
    .map((s) => s.getAttribute("src"))
    .filter((src) => !/lenis|config\.js/.test(src));
  for (const src of srcs) {
    if (!existsSync(src)) throw new Error(`${page} loads ${src}, which does not exist`);
    inject(readFileSync(src, "utf8"));
  }

  return { window, doc: window.document, errors, warnings, thrown, requests, store };
}

/* Let refresh()'s promise chain settle: one turn for the fetch, one for the
   .then that paints. */
export const settle = () => new Promise((r) => setTimeout(r, 20));

/* ── the seed files, as values ────────────────────────────────────────────── */
export const seedEnv = {};
for (const f of ["data/seed-settings.js", "data/seed-hours.js", "data/seed-menu.js",
                 "data/seed-copy.js", "data/seed-photos.js", "data/seed-breakfast-builder.js"]) {
  new Function("g", `with (g) { ${readFileSync(f, "utf8")} }
    g.SEED_MENU = typeof SEED_MENU !== "undefined" ? SEED_MENU : g.SEED_MENU;
    g.SEED_HOURS = typeof SEED_HOURS !== "undefined" ? SEED_HOURS : g.SEED_HOURS;
    g.SEED_HOURS_NOTE = typeof SEED_HOURS_NOTE !== "undefined" ? SEED_HOURS_NOTE : g.SEED_HOURS_NOTE;
    g.SEED_HOURS_EXCEPTIONS = typeof SEED_HOURS_EXCEPTIONS !== "undefined" ? SEED_HOURS_EXCEPTIONS : g.SEED_HOURS_EXCEPTIONS;
    g.SEED_SETTINGS = typeof SEED_SETTINGS !== "undefined" ? SEED_SETTINGS : g.SEED_SETTINGS;
    g.SEED_COPY = typeof SEED_COPY !== "undefined" ? SEED_COPY : g.SEED_COPY;
    g.SEED_BREAKFAST_BUILDER = typeof SEED_BREAKFAST_BUILDER !== "undefined" ?
      SEED_BREAKFAST_BUILDER : g.SEED_BREAKFAST_BUILDER;`)(seedEnv);
}

export const hhmmss = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

/* seed-menu.js → the rows menu_courses and menu_items would hold. `edit` gets
   the course list for each page and may drop, empty or reorder it first, which
   is how the "deleted" cases are written.

   `hidden: true` on an item in that edit becomes is_hidden on the row. The seed
   files themselves never carry it — a seed is by definition the menu as the
   public sees it — so this exists only so a harness can say "the owner hid
   this" and then check that the site agrees. */
export function menuRows(edit) {
  const pages = JSON.parse(JSON.stringify(seedEnv.SEED_MENU));
  if (edit) edit(pages);

  const courses = [], items = [];
  let cid = 0, iid = 0;
  for (const page of Object.keys(pages)) {
    pages[page].forEach((c, ci) => {
      cid++;
      courses.push({
        id: "c" + cid, page, course_key: c.key, tab_label: c.tabLabel, heading: c.heading,
        sizes: c.sizes || null, is_static: !!c.isStatic, static_id: c.staticId || null,
        is_hidden: !!c.hidden,
        sort_order: ci
      });
      (c.items || []).forEach((it, ii) => {
        iid++;
        items.push({
          id: "i" + iid, course_id: "c" + cid, name: it.name, tag: it.tag || null,
          description: it.desc || null,
          price: it.price != null ? it.price : null,
          prices: it.prices != null ? it.prices : null,
          price_all_sizes: it.priceAllSizes != null ? it.priceAllSizes : null,
          no_price: !!it.noPrice, is_hidden: !!it.hidden,
          options_dom_id: it.optionsId || null, sort_order: ii,
          menu_item_pours: (it.pours || []).map((p, pi) => ({
            id: `p${iid}_${pi}`, label: p.label, price: p.price, sort_order: pi })),
          menu_item_options: (it.options || []).map((o, oi) => ({
            id: `o${iid}_${oi}`, name: o.name, price: o.price, sort_order: oi }))
        });
      });
    });
  }
  return { courses, items };
}

/* Every table data.js reads, filled from the seeds. `hours` replaces the week
   outright, which is how a harness says "the owner changed the hours" — the
   rows differ from data/seed-hours.js and everything on the page has to follow
   the rows rather than the file. */
/* seed-settings.js → the rows site_settings holds.

   These two do not share a vocabulary and it matters. The seed file is keyed
   the way the site reads it — `phoneDigits`, `businessName`, a nested
   `address` object — while the database is a flat key/value table keyed
   `phone_digits`, `business_name`, `address_street`. data.js owns the
   translation (SETTING_NAMES and ADDRESS_NAMES), and a key it does not
   recognise is **silently dropped**, which is the right behaviour for a stray
   row and a trap for a harness.

   An earlier version of this file handed back the seed file's own keys. Every
   one of them was discarded, `shapeSettings` returned an empty object,
   `renderContact` returned at its first guard, and the pages kept the phone
   number that was already in the markup — so the tests looked green while the
   contact renderer had never run at all. Found by a sabotage that should have
   broken the phone link and did not. */
function settingRows() {
  const s = seedEnv.SEED_SETTINGS;
  const rows = [
    ["phone_digits", s.phoneDigits],
    ["phone_country", s.phoneCountry],
    ["email", s.email],
    ["instagram_handle", s.instagramHandle],
    ["schema_type", s.schemaType],
    ["business_name", s.businessName],
    ["cuisine", s.cuisine],
    ["address_street", s.address.street],
    ["address_locality", s.address.locality],
    ["address_region", s.address.region],
    ["address_postal", s.address.postal],
    ["address_country", s.address.country]
  ];
  for (const service of Object.keys(s.orderingLinks || {})) {
    rows.push([`order_${service}_url`, s.orderingLinks[service]]);
  }
  return rows.map(([key, value]) => ({ key, value: String(value) }));
}

/* `exceptions` is the same shape data/seed-hours.js documents — a date keyed
   object — turned back into the rows hours_exceptions holds. Empty by default,
   which is both the shipped state and the state most weeks of the year are in. */
export function seedRows({ menu, hours, exceptions = {} } = {}) {
  const week = hours || seedEnv.SEED_HOURS;
  const { courses, items } = menuRows(menu);
  const builder = seedEnv.SEED_BREAKFAST_BUILDER || { base: [], bagel: [], add: [] };
  const builderOptions = [];
  ["base", "bagel", "add"].forEach((group_key) => {
    (builder[group_key] || []).forEach((option, i) => {
      builderOptions.push({
        id: `b_${group_key}_${i + 1}`, group_key, label: option.label,
        price: option.price == null ? null : String(option.price),
        hint: option.hint || null, sub_key: option.sub || null,
        is_hidden: false, sort_order: i
      });
    });
  });
  return {
    site_settings: settingRows(),
    business_hours: week.map((h, i) => ({
      day_of_week: i, is_closed: !!h.closed,
      opens_at: h.closed ? null : hhmmss(h.opens),
      closes_at: h.closed ? null : hhmmss(h.closes) })),
    hours_exceptions: Object.keys(exceptions).sort().map((on_date) => {
      const e = exceptions[on_date];
      return {
        on_date, is_closed: !!e.closed,
        opens_at: e.closed ? null : hhmmss(e.opens),
        closes_at: e.closed ? null : hhmmss(e.closes),
        note: e.note || null
      };
    }),
    site_copy: Object.keys(seedEnv.SEED_COPY).map((key) => ({ key, value: seedEnv.SEED_COPY[key] })),
    menu_courses: courses,
    menu_items: items,
    menu_builder_options: builderOptions,
    photos: []
  };
}

/* A fetcher over a table→rows map. It throws on a table it was not given,
   rather than answering `[]` — a new request added to data.js has to fail here
   loudly instead of being silently approximated as "no rows". */
export function serve(rows, { shuffle = null } = {}) {
  return async (url) => {
    const table = String(url).split("/rest/v1/")[1].split("?")[0];
    if (!(table in rows)) throw new Error(`the stub does not answer ${table}`);
    let out = rows[table];
    if (shuffle) out = shuffle(out.slice(), table);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(out)) };
  };
}

/* ── reporting, shared so two harnesses read the same ─────────────────────── */
export function reporter() {
  const state = { failures: 0 };
  const fail = (msg, detail) => {
    state.failures++;
    console.log(`  FAIL ${msg}`);
    if (detail) console.log(String(detail).split("\n").slice(0, 10).map((l) => `         ${l}`).join("\n"));
  };
  const pass = (msg) => console.log(`  ok   ${msg}`);
  /* By value, not by identity. Much of what is compared is a list of messages
     that should be empty, and `[] === []` is false — a check that can never
     pass is worse than no check, because it looks like coverage. */
  const check = (what, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) pass(what);
    else fail(what, `want: ${JSON.stringify(want)}\n got: ${JSON.stringify(got)}`);
  };
  return { state, fail, pass, check };
}
