/* Do the migrations actually run?
   node tools/test-sql.mjs

   Until this existed, nothing in the repo had ever executed a line of the
   schema. `tools/check-policies.mjs` reads the SQL as *text* — it is good at
   "every table has RLS enabled" and structurally blind to a missing comma.
   memory.md said as much, and expected the first real apply to fail.

   This applies every migration, in filename order, to a real Postgres (PGlite:
   Postgres compiled to WebAssembly, no Docker, no server) on top of the
   smallest possible Supabase shim — see tools/supabase-shim.mjs for exactly
   what is faked and what that costs.

   Then it checks the things a syntax check cannot see:
     - the row counts the seed migration asserts are the counts that landed
     - every table named in the migration exists and has RLS on, read from
       pg_class rather than from the text that claims to have enabled it
     - each of the six menu price shapes survives an insert, because the
       triggers enforcing them are plain-language and have never run

   Cheap enough to run on every commit; it is in `npm test`. */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshDatabase, applyFile } from "./supabase-shim.mjs";

/* tools/test-db-guards.mjs points this at a mutated copy to prove the checks
   below can fail. Nothing else sets it. */
const DIR = process.env.MIGRATIONS_DIR || "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

/* PGlite ships as one minified line, so an escaping error prints the whole
   bundle as its stack frame and buries the message. Only the message is ever
   useful here. */
process.on("unhandledRejection", (e) => {
  console.log(`  FAIL the harness itself broke: ${e && e.message}`);
  if (e && e.query) console.log(`         while running: ${String(e.query).trim().split("\n")[0]}`);
  process.exit(1);
});

console.log("\napplying the migrations to a real Postgres\n");

const db = await freshDatabase();

/* One row back, for the many inserts below that need the id they just made. */
const one = async (sql) => (await db.query(sql)).rows[0];

for (const f of files) {
  const sql = readFileSync(join(DIR, f), "utf8");
  const r = await applyFile(db, f, sql);
  if (r.ok) {
    pass(`${f} applied`);
    continue;
  }
  fail(`${f} did not apply`, [
    r.message,
    r.detail,
    r.line ? `${DIR}/${f}:${r.line}` : "",
    r.source ? `  ${r.source.trim()}` : ""
  ].filter(Boolean).join("\n"));
  /* Everything after this point assumes the schema is there. */
  console.log(`\n${failures} problem(s) — the schema does not build`);
  process.exit(1);
}

/* ── RLS is on, read from the catalog rather than from the SQL text ────────
   This is the failure check-policies.mjs exists to catch, checked here the
   only way that cannot be fooled by a comment or a reworded statement. */
{
  const { rows } = await db.query(`
    select c.relname as table_name, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);
  const naked = rows.filter((r) => !r.rls).map((r) => r.table_name);
  if (naked.length) {
    fail(`${naked.length} table(s) have no row level security`, naked.join("\n") +
         "\nRLS off is invisible: every read and write works, from every account and none");
  } else pass(`${rows.length} tables, every one with RLS enabled`);
}

/* ── the seed landed, in full ───────────────────────────────────────────────
   The seed migration ends with its own count assertions, so a partial apply
   raises there. These are the same numbers checked from outside, which also
   catches the assertions themselves being wrong. */
{
  const expected = {
    business_hours: 7,
    site_settings: 14,
    menu_courses: 17,
    /* Resynced to the printed sheets in assets/menus/ on 2026-08-06: 84 items
       became 113, and the options table emptied — the crêpe and its seven
       toppings are not on the current dessert sheet. Zero is asserted rather
       than dropped, so an options row reappearing without a decision is still
       something this notices. */
    menu_items: 113,
    menu_item_pours: 31,
    menu_item_options: 0,
    menu_builder_options: 12,
    /* 62 until 2026-08-06, when the hero's "Café ✦ Wine Bar" line stopped
       being copy. Four more page-specific fields left with the retired page. */
    site_copy: 57
  };
  const wrong = [];
  for (const [table, n] of Object.entries(expected)) {
    const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
    if (rows[0].n !== n) wrong.push(`${table}: ${rows[0].n} rows, expected ${n}`);
  }
  if (wrong.length) {
    fail("the seeded row counts are not what the data says", wrong.join("\n") +
         "\nregenerate: node tools/gen-seed-sql.mjs");
  } else pass("every seeded table holds the number of rows the seed data has");
}

/* ── the six price shapes, inserted for real ────────────────────────────────
   Every one of these is on the live site. `menu_items_one_price_shape` counts
   non-nulls to enforce exactly one, and `check_prices_align()` does the three
   rules a CHECK cannot express. None of it had ever run.

   The shape numbering matches memory.md, "Menu item shapes". */
{
  /* The breakfast builder has three deliberately small groups. These checks
     keep bad rows from reaching the public fallback: a typo in the group would
     disappear, a blank label would leave an empty chip, and an invalid special
     link would make the bagel disclosure unreachable. */
  const builderMustRefuse = [
    ["an unknown builder group",
     `insert into public.menu_builder_options (group_key, label, price, sort_order)
      values ('sideways', 'Nope', '1', 90)`],
    ["a builder choice without a label",
     `insert into public.menu_builder_options (group_key, label, price, sort_order)
      values ('add', '   ', '1', 91)`],
    ["a base without a price",
     `insert into public.menu_builder_options (group_key, label, sort_order)
      values ('base', 'No price', 92)`],
    ["an add-on without a price",
     `insert into public.menu_builder_options (group_key, label, sort_order)
      values ('add', 'No price', 93)`],
    ["a bagel base link on an add-on",
     `insert into public.menu_builder_options (group_key, label, price, sub_key, sort_order)
      values ('add', 'Wrong link', '1', 'bagel', 94)`],
    ["an unsupported base sub-choice",
     `insert into public.menu_builder_options (group_key, label, price, sub_key, sort_order)
      values ('base', 'Wrong link', '1', 'not-bagel', 95)`]
  ];
  const builderSlipped = [];
  for (const [what, sql] of builderMustRefuse) {
    try { await db.exec(sql); builderSlipped.push(what); } catch { /* refused, as intended */ }
  }
  if (builderSlipped.length) {
    fail("the breakfast builder stored an invalid choice", builderSlipped.join("\n"));
  } else pass("invalid breakfast builder choices are refused");
}

{
  const plain = await one(`
    insert into public.menu_courses (page, course_key, tab_label, heading, sort_order)
    values ('food', 'zz-shapes', 'Shapes', 'Shapes', 990) returning id`);
  const sized = await one(`
    insert into public.menu_courses (page, course_key, tab_label, heading, sizes, sort_order)
    values ('drinks', 'zz-sized', 'Sized', 'Sized', array['Small','Large'], 991) returning id`);

  const broke = [];
  const shape = async (what, sql) => {
    try { await db.exec(sql); } catch (e) { broke.push(`${what} — ${e.message}`); }
  };

  /* Three columns, which the coffee and tea lists have used since 2026-08-06.
     Asserted here as well as in the refusal list below, because "four is
     refused" would still pass if the real cap had slipped back to two — and
     two is the shape that silently drops a price off the live coffee board. */
  try {
    const three = await one(`
      insert into public.menu_courses (page, course_key, tab_label, heading, sizes, sort_order)
      values ('drinks', 'zz-three', 'Three', 'Three', array['Small','Medium','Large'], 992)
      returning id`);
    await shape("2 priced by size, across three columns",
      `insert into public.menu_items (course_id, name, prices, sort_order)
       values ('${three.id}', 'Latte', '["6","6.50","7"]'::jsonb, 1)`);
    /* The gap case on a three-column course: the printed sheet prices the
       cappuccino in two of them. */
    await shape("2 priced by size, with the third column empty",
      `insert into public.menu_items (course_id, name, prices, sort_order)
       values ('${three.id}', 'Cappuccino', '["5","6",""]'::jsonb, 2)`);
  } catch (e) { broke.push(`a three-column course — ${e.message}`); }

  await shape("1 flat price",
    `insert into public.menu_items (course_id, name, price, sort_order)
     values ('${plain.id}', 'Morning Plate', '21', 1)`);
  await shape("2 priced by size",
    `insert into public.menu_items (course_id, name, prices, sort_order)
     values ('${sized.id}', 'Drip Coffee', '["4","5"]'::jsonb, 1)`);
  await shape("3 one price spanning the sizes",
    `insert into public.menu_items (course_id, name, price_all_sizes, sort_order)
     values ('${sized.id}', 'Espresso', '3', 2)`);
  await shape("5 no price at all",
    `insert into public.menu_items (course_id, name, no_price, sort_order)
     values ('${plain.id}', 'Ask us', true, 2)`);
  await shape("a tag alongside a price",
    `insert into public.menu_items (course_id, name, tag, price, sort_order)
     values ('${plain.id}', 'Pirosmani', '2022', '15', 3)`);

  /* Shapes 4 and 6 hang off a parent item. */
  try {
    const it = await one(`insert into public.menu_items (course_id, name, price, sort_order)
                          values ('${plain.id}', 'With pours', '15', 4) returning id`);
    await db.exec(`insert into public.menu_item_pours (item_id, label, price, sort_order)
                   values ('${it.id}', 'Bottle', '60', 1)`);
  } catch (e) { broke.push(`4 supplementary pours — ${e.message}`); }

  try {
    const it = await one(`insert into public.menu_items (course_id, name, price, options_dom_id, sort_order)
                          values ('${plain.id}', 'Crêpe', '5', 'shapesOpts', 5) returning id`);
    await db.exec(`insert into public.menu_item_options (item_id, name, price, sort_order)
                   values ('${it.id}', 'Nutella', '2', 1)`);
  } catch (e) { broke.push(`6 expandable options — ${e.message}`); }

  if (broke.length) {
    fail("a menu price shape the site already uses cannot be stored", broke.join("\n"));
  } else pass("all six price shapes, and a tag, insert cleanly");

  /* ── and the shapes that must be refused ──────────────────────────────────
     Each of these renders as a broken layout rather than an error — a price
     too many overflows a two-column CSS grid. The messages are written for the
     owner to read, so they have to actually fire. */
  const mustRefuse = [
    ["two price shapes at once",
     `insert into public.menu_items (course_id, name, price, no_price, sort_order)
      values ('${plain.id}', 'Both', '5', true, 90)`],
    ["no price shape at all",
     `insert into public.menu_items (course_id, name, sort_order)
      values ('${plain.id}', 'Neither', 91)`],
    ["three prices in a two-size section",
     `insert into public.menu_items (course_id, name, prices, sort_order)
      values ('${sized.id}', 'Too many', '["1","2","3"]'::jsonb, 92)`],
    ["a price stored as a number, which would render 3.90 as 3.9",
     `insert into public.menu_items (course_id, name, prices, sort_order)
      values ('${sized.id}', 'Numeric', '[3.90, 4]'::jsonb, 93)`],
    ["a per-size price in a section with no size columns",
     `insert into public.menu_items (course_id, name, prices, sort_order)
      values ('${plain.id}', 'Sizeless', '["1","2"]'::jsonb, 94)`],
    ["an item with a blank name",
     `insert into public.menu_items (course_id, name, price, sort_order)
      values ('${plain.id}', '   ', '5', 95)`]
  ];

  /* The size columns themselves, which is a different constraint from the
     prices that fill them and belongs on menu_courses. The ceiling is four, not
     three: `.mi__cells` is repeat(var(--cols), var(--cell)) and styles.css
     narrows the cell once, at data-cols="3", to keep the long drink names on
     one line. There is no fourth step, so a fourth size does not overflow —
     it wraps under the first and the board silently stops lining up. The empty
     array is the subtler one — it is not "no sizes", it is a course that
     renders a size header with nothing in it. */
  const coursesMustRefuse = [
    ["four size columns on one course",
     `insert into public.menu_courses (page, course_key, tab_label, heading, sizes, sort_order)
      values ('drinks', 'zz-four', 'Four', 'Four', array['S','M','L','XL'], 995)`],
    ["a course with an empty size array",
     `insert into public.menu_courses (page, course_key, tab_label, heading, sizes, sort_order)
      values ('drinks', 'zz-empty', 'Empty', 'Empty', array[]::text[], 996)`],
    ["a size column with no name",
     `insert into public.menu_courses (page, course_key, tab_label, heading, sizes, sort_order)
      values ('drinks', 'zz-null', 'Null', 'Null', array['Small', null], 997)`]
  ];
  for (const c of coursesMustRefuse) mustRefuse.push(c);

  const slipped = [];
  for (const [what, sql] of mustRefuse) {
    try { await db.exec(sql); slipped.push(what); } catch { /* refused, as intended */ }
  }
  if (slipped.length) {
    fail("the schema stored a menu shape that breaks the layout", slipped.join("\n") +
         "\nthese do not raise at render time — they silently overflow the grid");
  } else pass(`${mustRefuse.length} malformed menu shapes all refused`);

  await db.exec(`delete from public.menu_courses where course_key in ('zz-shapes', 'zz-sized')`);
}

/* ── the plain-language triggers refuse what they promise to refuse ─────────
   Each of these is a message the owner will one day read. If the trigger does
   not fire, the message is decoration and the bad value reaches the site. */
{
  const mustRefuse = [
    ["an ordering link that is not https",
     `update public.site_settings set value = 'javascript:alert(1)' where key = 'order_doordash_url'`],
    ["an editable setting left empty",
     `update public.site_settings set value = '' where key = 'phone_digits'`]
  ];
  const allowed = [];
  for (const [what, sql] of mustRefuse) {
    try {
      await db.exec(sql);
      allowed.push(what);
    } catch { /* refused, which is the point */ }
  }

  /* And the exemption that has to hold: clearing an ordering link is how the
     owner removes the service. See memory.md, "Delivery links". */
  let exemption = true;
  try {
    await db.exec(`update public.site_settings set value = '' where key = 'order_grubhub_url'`);
  } catch { exemption = false; }

  if (allowed.length) {
    fail("a value the schema promises to refuse was stored", allowed.join("\n"));
  } else if (!exemption) {
    fail("clearing an ordering link was refused",
         "empty is how a service is removed — the empty-value check must exempt order_*_url");
  } else pass("the format triggers refuse what they say they refuse, and allow what they must");
}

/* ── the photographs ────────────────────────────────────────────────────────
   Three rules, all of which look like they hold and none of which had run: a
   photograph with a file needs a description, decoration is exempt from that,
   and a slot cannot be renamed out from under the markup that reads it. */
{
  const problems = [];

  const refused = async (what, sql) => {
    try { await db.exec(sql); problems.push(what); } catch { /* as intended */ }
  };
  const allowed = async (what, sql) => {
    try { await db.exec(sql); } catch (e) { problems.push(`${what} — ${e.message}`); }
  };

  await refused("a described photograph saved with no description",
    `update public.photos set storage_path = 'hero.main/1.webp', alt = '   '
     where slot = 'hero.main'`);

  await allowed("a described photograph with a description",
    `update public.photos set storage_path = 'hero.main/1.webp', alt = 'The dining room'
     where slot = 'hero.main'`);

  await allowed("decoration, which needs none",
    `update public.photos set storage_path = 'wine.backdrop/1.webp', alt = ''
     where slot = 'wine.backdrop'`);

  /* Renaming a slot is how a photograph silently stops appearing: the markup
     asks for "gallery.g1" and the database no longer has one. */
  await refused("a slot renamed",
    `update public.photos set slot = 'gallery.gone' where slot = 'gallery.g1'`);

  /* The label and the decorative flag describe the markup, not the picture, so
     an update that tries to change them has to come back unchanged rather than
     be refused — the editor sends whole rows. */
  await db.exec(`update public.photos set label = 'Renamed', is_decorative = true
                 where slot = 'gallery.g2'`);
  const g2 = await one(`select label, is_decorative from public.photos where slot = 'gallery.g2'`);
  if (g2.label === "Renamed" || g2.is_decorative) {
    problems.push("the label or the decorative flag was writable from an update");
  }

  if (problems.length) {
    fail("the photograph rules do not hold", problems.join("\n"));
  } else pass("a photograph needs a description, decoration does not, and a slot cannot move");

  /* The limits that are the actual control. A bucket created without them is a
     bucket anyone holding the owner's token can put a 200 MB file into. */
  const bucket = await one(`select public, file_size_limit, allowed_mime_types
                            from storage.buckets where id = 'site-photos'`);
  const types = bucket && (bucket.allowed_mime_types || []);
  if (!bucket) {
    fail("the site-photos bucket was not created", "uploads would fail and nothing would say why");
  } else if (!bucket.file_size_limit || !types.length) {
    fail("the bucket has no size or type limit",
         `file_size_limit: ${bucket.file_size_limit}\nallowed_mime_types: ${types.join(", ") || "(none)"}\n` +
         "the editor's own checks are a courtesy — anyone with the token posts straight at the API");
  } else if (types.includes("image/svg+xml")) {
    fail("the bucket allows SVG",
         "SVG can contain a script, and this bucket is served publicly from the site's own origin");
  } else {
    pass(`the bucket caps uploads at ${Math.round(bucket.file_size_limit / 1024 / 1024)} MB ` +
         `and allows ${types.join(", ")}`);
  }

  await db.exec(`update public.photos set storage_path = null, source_path = null
                 where storage_path is not null`);
}

console.log(failures
  ? `\n${failures} problem(s) in SQL that has now actually run`
  : "\nevery migration applies, seeds correctly, and enforces what it claims");
process.exit(failures ? 1 : 0);
