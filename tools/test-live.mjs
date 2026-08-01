/* Does the network path produce the same site as the seed path?
   node tools/test-live.mjs

   Phase 4 introduces a second source of truth for every word on the site. The
   failure that matters is not a crash — it is the database and the seed files
   quietly disagreeing, so that the site looks right locally and wrong once
   it is live, or right on a first visit and wrong on the second.

   So this closes the loop. The seed migration was generated from data/seed-*.js;
   this applies it to a real Postgres, serves those rows to data.js through a
   stubbed fetch shaped exactly like PostgREST, and requires what comes back
   out to equal the seed files it started as. A dropped pour, a shuffled
   course, "7.50" arriving as 7.5 — all of it shows up as a diff.

   It also exercises the parts that only matter when things go wrong, because
   those are the parts nobody notices are broken:

     - no key configured        → no request at all, seeds render
     - the request fails        → the page keeps what it had, quietly
     - the database is empty    → treated as a failure, not as new content
     - a corrupt cache          → ignored rather than half-read
     - nothing actually changed → no callback, so no cascade replay

   No jsdom: data.js needs a window with localStorage, a fetch and a console,
   and that is cheaper to build than to import. */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshDatabase, applyFile } from "./supabase-shim.mjs";

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").slice(0, 12).map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

/* ── a real database, seeded exactly as the project will be ───────────────── */
const db = await freshDatabase();
for (const f of readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort()) {
  const r = await applyFile(db, f, readFileSync(join("supabase/migrations", f), "utf8"));
  if (!r.ok) { fail(`${f} did not apply — run tools/test-sql.mjs`, r.message); process.exit(1); }
}

/* ── PostgREST, reduced to the five requests data.js actually makes ────────
   Deliberately not a general implementation. It answers those five and throws
   on anything else, so a new query added to data.js fails loudly here rather
   than being silently approximated. */
async function rest(path) {
  const table = path.split("?")[0];

  if (table === "site_settings") {
    return (await db.query(`select key, value from public.site_settings`)).rows;
  }
  if (table === "business_hours") {
    return (await db.query(
      `select day_of_week, is_closed, opens_at::text, closes_at::text from public.business_hours`)).rows;
  }
  if (table === "site_copy") {
    return (await db.query(`select key, value from public.site_copy`)).rows;
  }
  if (table === "menu_courses") {
    return (await db.query(
      `select id, page, course_key, tab_label, heading, sizes, is_static, static_id, sort_order
       from public.menu_courses order by sort_order`)).rows;
  }
  if (table === "menu_items") {
    const items = (await db.query(
      `select id, course_id, name, tag, description, price, prices, price_all_sizes,
              no_price, options_dom_id, sort_order
       from public.menu_items order by sort_order`)).rows;
    const pours = (await db.query(
      `select id, item_id, label, price, sort_order from public.menu_item_pours`)).rows;
    const options = (await db.query(
      `select id, item_id, name, price, sort_order from public.menu_item_options`)).rows;
    /* PostgREST returns embedded rows nested under the relation name, and in
       an order the join happened to produce — deliberately not sorted here,
       because data.js is supposed to sort them itself. */
    for (const it of items) {
      it.menu_item_pours = pours.filter((p) => p.item_id === it.id).reverse();
      it.menu_item_options = options.filter((o) => o.item_id === it.id).reverse();
    }
    return items;
  }
  throw new Error(`the stub does not answer ${table} — add it deliberately`);
}

/* ── a browser, reduced to what data.js touches ───────────────────────────── */
function sandbox({ key = "a".repeat(40), fetcher } = {}) {
  const store = new Map();
  const warnings = [];
  const g = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error: () => {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    JSON, Promise, Error, Object, String, Number, Boolean, Array, RegExp, isNaN
  };
  g.window = g;
  g.fetch = fetcher || (async (url) => {
    const path = String(url).split("/rest/v1/")[1];
    return { ok: true, status: 200, json: async () => rest(path) };
  });
  g.AROMATI_CONFIG = { url: "https://yofoiqgknsqzsuwtlqvh.supabase.co", anonKey: key };
  return { g, store, warnings };
}

const SEEDS = ["data/seed-settings.js", "data/seed-hours.js", "data/seed-menu.js", "data/seed-copy.js"];
const dataSrc = readFileSync("data.js", "utf8");
const seedSrc = SEEDS.map((f) => readFileSync(f, "utf8")).join("\n");

function load(env) {
  /* The seeds and data.js are classic scripts declaring `var` globals — the
     same way the browser loads them. Function-scoped eval reproduces that
     without a module wrapper changing the semantics under test. */
  const keys = Object.keys(env.g);
  const fn = new Function(...keys, `${seedSrc}\n${dataSrc}\nreturn { AROMATI_DATA, SEED_MENU, SEED_HOURS, SEED_HOURS_NOTE, SEED_SETTINGS, SEED_COPY };`);
  return fn(...keys.map((k) => env.g[k]));
}

const refresh = (api) => new Promise((res) => api.refresh(res));

console.log("\nthe live path against the seed path\n");

/* ── 1. the round trip ─────────────────────────────────────────────────────
   The one that matters. Everything below is about failure modes; this is
   about the site being the same site. */
{
  const env = sandbox();
  const { AROMATI_DATA, SEED_MENU, SEED_HOURS, SEED_SETTINGS, SEED_COPY } = load(env);
  await refresh(AROMATI_DATA);

  /* Read what was cached rather than what was handed to the callback. The
     callback fires only when something *changed*, and the whole point of this
     test is that nothing should have — the database was seeded from these very
     files. A null callback here is the success case, not a missing result. */
  const cached = env.store.get(AROMATI_DATA.CACHE_KEY);
  const fresh = cached ? JSON.parse(cached) : null;

  if (!fresh) {
    fail("nothing was cached, so the request never completed", env.warnings.join("\n"));
  } else {
    const parts = [
      ["the menu", fresh.menu, SEED_MENU],
      ["the hours", fresh.hours, SEED_HOURS],
      ["the settings", fresh.settings, SEED_SETTINGS],
      ["the copy", fresh.copy, SEED_COPY]
    ];
    /* Compared through data.js's own `stable`, so the test cannot pass under a
       looser rule than the site uses to decide whether anything changed.
       Object key order is not content — the seed files are hand-ordered and
       the database returns rows in query order — but array order is, and
       stable() leaves arrays alone. */
    const canon = (v) => JSON.stringify(AROMATI_DATA.stable(v), null, 1);

    for (const [what, got, want] of parts) {
      const a = canon(got), b = canon(want);
      if (a === b) { pass(`${what} comes back from the database exactly as the seed file has it`); continue; }

      /* A whole-object diff is unreadable at 84 items, so point at the first
         place they part company. */
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      fail(`${what} differs between the database and the seed file`,
           `at character ${i}\n  database: …${a.slice(Math.max(0, i - 60), i + 60)}…` +
           `\n  seed:     …${b.slice(Math.max(0, i - 60), i + 60)}…`);
    }
  }
}

/* ── 2. unchanged content must not trigger a repaint ───────────────────────
   render.js replays the entrance cascade when the board changes. If "changed"
   is computed wrongly, every visitor gets the whole menu animating again a
   second after it settled, for no reason. */
{
  const env = sandbox();
  const { AROMATI_DATA } = load(env);
  await refresh(AROMATI_DATA);              // first call fills the cache
  const second = await refresh(AROMATI_DATA);
  if (second === null) pass("a second load with identical content asks for no repaint");
  else fail("identical content was reported as fresh — the cascade would replay on every visit");
}

/* ── 3. an edit does come through ──────────────────────────────────────────
   The complement of the check above, and the reason it cannot simply always
   return null. */
{
  const env = sandbox();
  const { AROMATI_DATA } = load(env);
  await refresh(AROMATI_DATA);
  await db.exec(`update public.site_settings set value = '5551234567' where key = 'phone_digits'`);
  const after = await refresh(AROMATI_DATA);
  if (after && after.settings.phoneDigits === "5551234567") pass("an edit in the database reaches the page");
  else fail("an edit in the database did not come through", JSON.stringify(after && after.settings));
  await db.exec(`update public.site_settings set value = '3322073847' where key = 'phone_digits'`);
}

/* ── 4. the failure modes, which are the normal case ───────────────────────── */
{
  const cases = [
    ["no key configured", { key: "" }, "no request should be made at all"],
    ["the network is down", { fetcher: async () => { throw new Error("offline"); } }, ""],
    ["the project answers 401", { fetcher: async () => ({ ok: false, status: 401, json: async () => ({}) }) }, ""],
    ["the response is not JSON", { fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }) }, ""],
    ["the database is empty", { fetcher: async () => ({ ok: true, status: 200, json: async () => [] }) }, ""]
  ];

  for (const [what, opts] of cases) {
    const env = sandbox(opts);
    let requested = 0;
    const inner = env.g.fetch;
    env.g.fetch = (...a) => { requested++; return inner(...a); };

    const { AROMATI_DATA, SEED_MENU } = load(env);
    let result, threw = null;
    try { result = await refresh(AROMATI_DATA); } catch (e) { threw = e; }

    if (threw) { fail(`${what}: refresh() threw instead of falling back`, threw.message); continue; }
    if (result !== null) { fail(`${what}: reported content as fresh when it is not usable`); continue; }
    if (opts.key === "" && requested) { fail(`${what}: a request went out with no key configured`); continue; }

    /* And the page is still whole: current() must still hand back a complete
       site, because that is the entire promise of the fallback chain. */
    const now = AROMATI_DATA.current();
    if (JSON.stringify(now.menu) !== JSON.stringify(SEED_MENU)) {
      fail(`${what}: the seed menu is no longer what current() returns`);
      continue;
    }
    pass(`${what} — falls back, and the site is still complete`);
  }
}

/* ── 5. a corrupt cache is ignored, not half-read ──────────────────────────
   A truncated localStorage entry renders a site that is subtly wrong, which is
   worse than one that is obviously falling back. */
{
  const bad = [
    ["not JSON at all", "{{{"],
    ["JSON, but not content", '{"hello":"world"}'],
    ["content missing the menu", '{"hours":[1,2,3,4,5,6,7],"settings":{},"copy":{}}'],
    ["hours truncated to five days", '{"menu":{},"hours":[1,2,3,4,5],"settings":{},"copy":{}}']
  ];
  for (const [what, raw] of bad) {
    const env = sandbox({ key: "" });
    const { AROMATI_DATA, SEED_MENU } = load(env);
    env.store.set(AROMATI_DATA.CACHE_KEY, raw);
    const now = AROMATI_DATA.current();
    if (JSON.stringify(now.menu) === JSON.stringify(SEED_MENU)) pass(`a cache that is ${what} is ignored`);
    else fail(`a cache that is ${what} was used anyway`);
  }
}

/* ── 6. localStorage refusing to work is not an error ──────────────────────
   Safari private browsing, storage disabled by policy, a full quota, an opaque
   file:// origin. All of them throw, and none of them mean stop rendering. */
{
  const env = sandbox({ key: "" });
  env.g.localStorage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("SecurityError"); }
  };
  const { AROMATI_DATA, SEED_MENU } = load(env);
  let ok = true;
  try {
    const now = AROMATI_DATA.current();
    ok = JSON.stringify(now.menu) === JSON.stringify(SEED_MENU);
  } catch { ok = false; }
  if (ok) pass("storage that throws on every call still renders the whole site");
  else fail("storage that throws took the page down");
}

console.log(failures
  ? `\n${failures} problem(s) — the live path and the seed path do not agree`
  : "\nthe database renders the same site the seed files do, and every failure falls back");
process.exit(failures ? 1 : 0);
