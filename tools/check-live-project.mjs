/* Does the deployed database still match what is in this repo?
   node tools/check-live-project.mjs

   tools/test-live.mjs already proves the round trip against a local Postgres
   built from the migration files. This asks the same question of the real
   project over the real network, with the real publishable key, which is a
   different question and the one that goes stale.

   Two things drift, and neither one announces itself:

     - **Content.** From Phase 4 the database is the source of truth. Once the
       owner edits anything, data/seed-*.js is out of date — and because the
       seeds are the offline fallback, a visitor who loads the site with the
       database unreachable is served the *old* menu, correctly and confidently.
       Nothing errors. This is memory.md, "What's still open", item 2, made
       checkable: a diff here is not necessarily a bug, but it is always
       something someone needs to know.

     - **Reach.** The publishable key is world-readable by design and the whole
       defence is server-side. That defence is a set of policies and grants that
       a later migration, or a dashboard click, can widen without anyone
       noticing. So this also tries to write, as a stranger would, and requires
       to be refused — over HTTP, through PostgREST, not in SQL where `set role`
       makes it easy to prove the wrong thing.

   NOT part of `npm test`, on purpose. It needs the network and a live project,
   so it cannot be a gate — a check that fails on a train is a check people
   learn to skip. Run it after applying a migration, before a deploy, and when
   the site looks wrong in a way the local tests say is impossible.

   Reads config.js for the origin and key rather than hardcoding them, so it
   checks the project the site actually talks to. */

import { readFileSync } from "node:fs";

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").slice(0, 12).map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

const SEEDS = ["data/seed-settings.js", "data/seed-hours.js", "data/seed-menu.js", "data/seed-copy.js"];
const seedSrc = SEEDS.map((f) => readFileSync(f, "utf8")).join("\n");
const dataSrc = readFileSync("data.js", "utf8");
const configSrc = readFileSync("config.js", "utf8");

/* A browser, reduced to what data.js touches — the same shape test-live.mjs
   uses, except that fetch is the real one. */
const store = new Map();
const warnings = [];
const g = {
  console: { warn: (...a) => warnings.push(a.join(" ")), error: (...a) => warnings.push(a.join(" ")) },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  fetch: (...a) => fetch(...a),
  JSON, Promise, Error, Object, String, Number, Boolean, Array, RegExp, isNaN
};
g.window = g;

const keys = Object.keys(g);
const fn = new Function(...keys,
  `${configSrc}\n${seedSrc}\n${dataSrc}\n` +
  `return { AROMATI_CONFIG, AROMATI_DATA, SEED_MENU, SEED_HOURS, SEED_SETTINGS, SEED_COPY };`);
const { AROMATI_CONFIG, AROMATI_DATA, SEED_MENU, SEED_HOURS, SEED_SETTINGS, SEED_COPY } =
  fn(...keys.map((k) => g[k]));

console.log(`\nthe live project against this working copy\n`);

if (!AROMATI_CONFIG.anonKey || AROMATI_CONFIG.anonKey.length <= 20) {
  console.log("  skip  config.js has no key — the site is running from seeds, nothing to compare\n");
  process.exit(0);
}
console.log(`  ${AROMATI_CONFIG.url}\n`);

/* ── 1. is the content still the content? ─────────────────────────────────── */
await new Promise((res) => AROMATI_DATA.refresh(res));

const cached = store.get(AROMATI_DATA.CACHE_KEY);
const live = cached ? JSON.parse(cached) : null;

if (!live) {
  fail("nothing came back from the project", warnings.join("\n") ||
       "the request failed, or every table came back empty (which data.js treats as failure)");
} else {
  /* Through data.js's own `stable`, so this cannot pass under a looser rule
     than the site itself uses to decide whether anything changed. */
  const canon = (v) => JSON.stringify(AROMATI_DATA.stable(v), null, 1);

  for (const [what, got, want] of [
    ["the menu", live.menu, SEED_MENU],
    ["the hours", live.hours, SEED_HOURS],
    ["the settings", live.settings, SEED_SETTINGS],
    ["the copy", live.copy, SEED_COPY]
  ]) {
    const a = canon(got), b = canon(want);
    if (a === b) { pass(`${what} in the project is identical to data/seed-*.js`); continue; }

    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    fail(`${what} in the project differs from data/seed-*.js`,
         `at character ${i}\n  project: …${a.slice(Math.max(0, i - 60), i + 60)}…` +
         `\n  seed:    …${b.slice(Math.max(0, i - 60), i + 60)}…\n` +
         `If the owner edited this, the seed file is stale and the offline\n` +
         `fallback now serves the old wording. Regenerate it.`);
  }
}

/* ── 2. can the public key do anything but read? ──────────────────────────── */
const rest = (path, init) => fetch(AROMATI_CONFIG.url + "/rest/v1/" + path, {
  ...init,
  headers: {
    apikey: AROMATI_CONFIG.anonKey,
    Authorization: "Bearer " + AROMATI_CONFIG.anonKey,
    "Content-Type": "application/json",
    ...(init && init.headers)
  }
});

/* Each of these is a write a defaced site would need. A refusal is any
   non-2xx; what matters is that nothing lands, not which layer said no.
   `value=value` style edits are used where possible so that a *pass* — which
   would mean the write succeeded — still leaves the content intact. */
const writes = [
  ["edit a headline", () => rest("site_copy?key=eq.hero.eyebrow",
      { method: "PATCH", body: JSON.stringify({ value: "defaced" }) })],
  ["add a menu item", () => rest("menu_items",
      { method: "POST", body: JSON.stringify({ name: "probe", price: "0", course_id: null }) })],
  ["delete the menu", () => rest("menu_items?name=neq.__nothing__", { method: "DELETE" })],
  ["close the café", () => rest("business_hours?day_of_week=eq.1",
      { method: "PATCH", body: JSON.stringify({ is_closed: true }) })],
  ["read the owner allowlist", () => rest("admin_users?select=user_id")],
  ["ask whether it is the owner", () => rest("rpc/is_owner", { method: "POST", body: "{}" })]
];

/* ── the control ──────────────────────────────────────────────────────────
   Every probe below expects a refusal, and a run where all of them are refused
   looks identical to a run where the requests never really happened — a typo in
   the origin, an expired key, a network that answers everything with a 401.
   Six confident passes, all meaningless.

   So one request that must SUCCEED is checked first, and it is not an
   artificial one: it is the public read of site_copy, which is how every
   visitor gets the words on the page. If this fails the site is broken in a way
   worth knowing about on its own, and the refusals below prove nothing until it
   passes. */
{
  const res = await rest("site_copy?select=key,value&limit=1");
  const body = res.ok ? await res.text() : "";
  if (res.ok && body !== "[]" && body !== "") {
    pass("the public key can still read the site copy (so the checks below are live)");
  } else {
    fail("the public key cannot read the site copy",
         `${res.status} ${body.slice(0, 200)}\n` +
         `The site itself is broken — and until this passes, every "cannot write"\n` +
         `below is unproven, because a request that never lands is also refused.`);
  }
}

for (const [what, run] of writes) {
  let res;
  try { res = await run(); }
  catch (e) { fail(`could not test "${what}" — the request itself failed`, e.message); continue; }

  if (!res.ok) { pass(`the public key cannot ${what} (${res.status})`); continue; }

  /* PostgREST answers a PATCH or DELETE that RLS filtered down to nothing with
     204 and an empty body. That is a refusal, not a success, and it is the
     shape most of these take — a policy denies by making the rows invisible
     rather than by raising. */
  const body = await res.text();
  if (res.status === 204 || body === "" || body === "[]") {
    pass(`the public key cannot ${what} (${res.status}, no rows affected)`);
  } else {
    fail(`the public key CAN ${what}`, `${res.status} ${body.slice(0, 300)}`);
  }
}

console.log(failures
  ? `\n${failures} problem(s) — the live project and this working copy do not agree`
  : "\nthe live project matches this working copy, and the public key can only read");
process.exit(failures ? 1 : 0);
