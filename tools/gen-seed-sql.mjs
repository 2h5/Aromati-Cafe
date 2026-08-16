/* The seed migration, generated from the Phase 1 seed data.
   node tools/gen-seed-sql.mjs

   113 menu items, 17 courses, 62 copy fields. Typing those into SQL by hand is
   the transcription risk Phase 1 spent an extractor to remove, and doing it at
   the seeding step would reintroduce it at the last possible moment — with the
   database as the new source of truth, so the mistake would then be permanent.

   Same principle as tools/extract-menus.mjs: the data is read, never retyped.
   Run it again whenever data/seed-*.js changes and commit the result.

   The counts moved on 2026-08-06, when the menu was resynced to the printed
   sheets in assets/menus/ — 84 items to 113, and the options table to empty,
   because the crêpe and its seven toppings are not on the current dessert
   sheet. The options block below is skipped when nothing needs it.

   Two things this file is careful about.

   Identifiers. Rows need stable primary keys so items can reference their
   course, so the ids are derived from the content's position rather than left
   to gen_random_uuid(). Running this twice produces byte-identical SQL, which
   is what makes the output reviewable in a diff.

   Counting. The file ends with a block that asserts the row counts, so a
   partial apply fails loudly instead of leaving a menu that is quietly missing
   its last section.                                                          */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { COPY_FIELDS } from "./copy-labels.mjs";

const OUT = "supabase/migrations/20260801000100_seed_content.sql";

/* The seed files are classic scripts declaring globals — the same property
   that lets them work over file:// makes them readable here without any
   parsing. */
function load(file, name) {
  const sandbox = {};
  runInNewContext(readFileSync(file, "utf8"), sandbox);
  if (!sandbox[name]) throw new Error(`${file} did not define ${name}`);
  return sandbox[name];
}

const MENU = load("data/seed-menu.js", "SEED_MENU");
const COPY = load("data/seed-copy.js", "SEED_COPY");

/* ── the labels and the data have to describe the same 62 fields ──────────
   A key in the data with no label reaches the editor as an unnamed blank row.
   A label with no key is a field that silently does nothing. Both are quiet,
   so neither is allowed. */
{
  const inData  = Object.keys(COPY);
  const labelled = Object.keys(COPY_FIELDS);
  const missing = inData.filter((k) => !COPY_FIELDS[k]);
  const extra   = labelled.filter((k) => !(k in COPY));

  if (missing.length || extra.length) {
    const say = [];
    if (missing.length) say.push(`no label in tools/copy-labels.mjs for:\n    ${missing.join("\n    ")}`);
    if (extra.length)   say.push(`labelled but not in data/seed-copy.js:\n    ${extra.join("\n    ")}`);
    throw new Error("copy labels and copy data disagree —\n  " + say.join("\n  "));
  }
}

/* ── SQL literals ─────────────────────────────────────────────────────── */

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  const s = String(v);
  /* A newline inside '...' is legal but invisible in a diff, and a backslash
     would be silently literal. E'' makes both explicit. */
  if (!/[\n\r\\]/.test(s)) return "'" + s.replace(/'/g, "''") + "'";
  return "E'" + s.replace(/\\/g, "\\\\").replace(/'/g, "''")
                 .replace(/\r/g, "\\r").replace(/\n/g, "\\n") + "'";
};

const arr  = (a) => (a && a.length ? `array[${a.map(lit).join(", ")}]` : "null");
const json = (a) => (a ? `${lit(JSON.stringify(a))}::jsonb` : "null");

/* UUIDv5 over a fixed namespace: the same input always gives the same id, so
   re-running the generator does not churn every key in the diff. */
const NS = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
function uuid(name) {
  const h = createHash("sha1").update(Buffer.concat([NS, Buffer.from(name, "utf8")])).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;         // version 5
  b[8] = (b[8] & 0x3f) | 0x80;         // RFC 4122 variant
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/* ── walk the menu ─────────────────────────────────────────────────────── */

const courses = [];
const items   = [];
const pours   = [];
const options = [];

for (const page of ["food", "drinks", "wine"]) {
  const list = MENU[page];
  if (!list) throw new Error(`data/seed-menu.js has no "${page}" page`);

  list.forEach((course, ci) => {
    const courseId = uuid(`course:${page}:${ci}`);
    courses.push({
      id: courseId, page, ci,
      key: course.key, tabLabel: course.tabLabel, heading: course.heading,
      sizes: course.sizes || null,
      isStatic: !!course.isStatic, staticId: course.staticId || null
    });

    (course.items || []).forEach((item, ii) => {
      const itemId = uuid(`item:${page}:${ci}:${ii}`);

      /* Exactly one price shape reaches the database. The schema enforces this
         too; asserting it here means a bad seed file fails at generation, with
         the item's name, rather than halfway through applying a migration. */
      const shapes = ["price", "prices", "priceAllSizes"].filter((k) => item[k] != null);
      if (shapes.length + (item.noPrice ? 1 : 0) !== 1) {
        throw new Error(
          `${page} / ${course.heading} / ${item.name}: ` +
          `has ${shapes.length + (item.noPrice ? 1 : 0)} price shapes (${shapes.join(", ") || "none"}` +
          `${item.noPrice ? ", noPrice" : ""}), needs exactly 1`
        );
      }
      if (item.prices && (!course.sizes || item.prices.length !== course.sizes.length)) {
        throw new Error(
          `${page} / ${course.heading} / ${item.name}: ${item.prices.length} prices ` +
          `but the section has ${course.sizes ? course.sizes.length : 0} size columns`
        );
      }

      items.push({ id: itemId, courseId, ii, ...item });

      (item.pours || []).forEach((p, pi) =>
        pours.push({ id: uuid(`pour:${page}:${ci}:${ii}:${pi}`), itemId, pi, ...p }));
      (item.options || []).forEach((o, oi) =>
        options.push({ id: uuid(`opt:${page}:${ci}:${ii}:${oi}`), itemId, oi, ...o }));
    });
  });
}

/* ── build the file ────────────────────────────────────────────────────── */

const out = [];
const w = (s = "") => out.push(s);

w("-- ============================================================================");
w("-- Aromati — content seed");
w("--");
w("-- GENERATED by tools/gen-seed-sql.mjs from data/seed-*.js. Do not hand-edit:");
w("-- the next run overwrites it, and the site would keep the old values anyway.");
w("-- To change something here, change the seed data and run the generator.");
w("--");
w(`-- ${courses.length} sections, ${items.length} items, ${pours.length} pours, ` +
  `${options.length} options, ${Object.keys(COPY).length} copy fields.`);
w("--");
w("-- Runs once, at Phase 3 step 6. The ids are derived from each row's position");
w("-- in the seed data rather than generated, so this file is stable in a diff --");
w("-- but it also means re-running it after reordering the menu would collide.");
w("-- If it has to be applied twice, empty the tables first.");
w("--");
w("-- Not seeded here: the photos (Phase 6 defines the slots).");
w("-- ============================================================================");
w();

w("-- ---- sections --------------------------------------------------------------");
w("insert into public.menu_courses (id, page, course_key, tab_label, heading, sizes, is_static, static_id, sort_order) values");
w(courses.map((c, i) =>
  `  (${lit(c.id)}, ${lit(c.page)}, ${lit(c.key)}, ${lit(c.tabLabel)}, ${lit(c.heading)}, ` +
  `${arr(c.sizes)}, ${c.isStatic}, ${lit(c.staticId)}, ${c.ci + 1})` +
  (i === courses.length - 1 ? ";" : ",")).join("\n"));
w();

w("-- ---- items -----------------------------------------------------------------");
w("-- Prices are text, never numeric: 3.90 stored as a number renders as 3.9.");
w("insert into public.menu_items (id, course_id, name, tag, description, price, prices, price_all_sizes, no_price, options_dom_id, sort_order) values");
w(items.map((it, i) =>
  `  (${lit(it.id)}, ${lit(it.courseId)}, ${lit(it.name)}, ${lit(it.tag)}, ${lit(it.desc)}, ` +
  `${lit(it.price)}, ${json(it.prices)}, ${lit(it.priceAllSizes)}, ${!!it.noPrice}, ` +
  `${lit(it.optionsId)}, ${it.ii + 1})` +
  (i === items.length - 1 ? ";" : ",")).join("\n"));
w();

if (pours.length) {
  w("-- ---- pours (the \"Bottle $60\" lines) -----------------------------------------");
  w("insert into public.menu_item_pours (id, item_id, label, price, sort_order) values");
  w(pours.map((p, i) =>
    `  (${lit(p.id)}, ${lit(p.itemId)}, ${lit(p.label)}, ${lit(p.price)}, ${p.pi + 1})` +
    (i === pours.length - 1 ? ";" : ",")).join("\n"));
  w();
}

if (options.length) {
  w("-- ---- options (the crêpe toppings) -------------------------------------------");
  w("-- Modelled so nothing is lost on the way in. Not exposed in the editor.");
  w("insert into public.menu_item_options (id, item_id, name, price, sort_order) values");
  w(options.map((o, i) =>
    `  (${lit(o.id)}, ${lit(o.itemId)}, ${lit(o.name)}, ${lit(o.price)}, ${o.oi + 1})` +
    (i === options.length - 1 ? ";" : ",")).join("\n"));
  w();
}

w("-- ---- section copy ----------------------------------------------------------");
w("-- Labels come from tools/copy-labels.mjs and are the owner's words, not keys.");
w("-- max_length is set on the animated headlines only, and is provisional.");
w("insert into public.site_copy (key, page, section, label, help, value, max_length, sort_order) values");
{
  const keys = Object.keys(COPY);
  w(keys.map((k, i) => {
    const f = COPY_FIELDS[k];
    return `  (${lit(k)}, ${lit(f.page)}, ${lit(f.section)}, ${lit(f.label)}, ` +
           `${lit(f.help)}, ${lit(COPY[k])}, ${f.maxLength ?? "null"}, ${(i + 1) * 10})` +
           (i === keys.length - 1 ? ";" : ",");
  }).join("\n"));
}
w();

w("-- ---- did it all land? ------------------------------------------------------");
w("-- A partial apply leaves a menu quietly missing its last section. This turns");
w("-- that into an error at the moment it happens.");
w("do $$");
w("declare n integer;");
w("begin");
for (const [table, n] of [
  ["menu_courses", courses.length], ["menu_items", items.length],
  ["menu_item_pours", pours.length], ["menu_item_options", options.length],
  ["site_copy", Object.keys(COPY).length]
]) {
  w(`  select count(*) into n from public.${table};`);
  w(`  if n <> ${n} then raise exception '${table}: expected ${n} rows, found %', n; end if;`);
}
w("end $$;");

const sql = out.join("\n") + "\n";
const tally = `${courses.length} sections, ${items.length} items, ${pours.length} pours, ` +
              `${options.length} options, ${Object.keys(COPY).length} copy fields`;

/* --check asks whether the committed file is what this data produces, without
   writing anything. Editing data/seed-copy.js and forgetting to regenerate
   would otherwise leave the site saying one thing and the database seeding
   another, with nothing to notice until the two are compared by hand. */
if (process.argv.includes("--check")) {
  const onDisk = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : null;
  if (onDisk === sql) {
    console.log(`ok   ${OUT} is up to date (${tally})`);
    process.exit(0);
  }
  console.log(`FAIL ${OUT} does not match the seed data`);
  console.log(onDisk === null
    ? "       the file does not exist"
    : "       data/seed-*.js or tools/copy-labels.mjs changed after it was generated");
  console.log("       run: npm run gen:seed");
  process.exit(1);
}

writeFileSync(OUT, sql);
console.log(`wrote ${OUT}`);
console.log(`  ${tally}`);
