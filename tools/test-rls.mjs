/* Who can actually read and write what?
   node tools/test-rls.mjs

   `check-policies.mjs` reads the migration as text and asks whether the right
   policies were written. This asks the database. It applies the migrations to
   a real Postgres (see tools/supabase-shim.mjs), switches into `anon` and
   `authenticated` the way PostgREST does, and tries the reads and writes that
   matter — including the ones that must fail.

   These are the Security rows of the Phase 7 checklist in memory.md, minus the
   two that are not about SQL at all (signUp() being rejected, and the upload
   caps). Those stay manual: they are dashboard and storage settings, and no
   amount of local Postgres can answer them.

   Read the "WHAT THIS IS NOT" note in supabase-shim.mjs before trusting a green
   run further than it deserves. In particular a pass here says "a request
   claiming to be this user is refused", never "the claim could not be forged" —
   nothing here verifies a JWT signature. */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { freshDatabase, applyFile, OWNER_UID, EDITOR_UID } from "./supabase-shim.mjs";

/* tools/test-db-guards.mjs points this at a mutated copy to prove the checks
   below can fail. Nothing else sets it. */
const DIR = process.env.MIGRATIONS_DIR || "supabase/migrations";

/* The owner is allowlisted by 20260801000200_allowlist_owner.sql, applied
   below like any other migration — so these tests exercise that file rather
   than a convenient stand-in for it. The stranger is a second real account
   that is deliberately not on the list, which is the whole model in one line. */
const OWNER = OWNER_UID;
const STRANGER = "11111111-2222-3333-4444-555555555555";

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

process.on("unhandledRejection", (e) => {
  console.log(`  FAIL the harness itself broke: ${e && e.message}`);
  process.exit(1);
});

const db = await freshDatabase();
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".sql")).sort()) {
  const r = await applyFile(db, f, readFileSync(join(DIR, f), "utf8"));
  if (!r.ok) {
    fail(`${f} did not apply — run tools/test-sql.mjs`, r.message);
    process.exit(1);
  }
}

/* Both accounts exist in auth.users; only one is allowlisted, and it was
   allowlisted by the migration rather than by this file. That difference is the
   entire authorisation model, so it is the thing worth testing. */
await db.exec(
  `insert into auth.users (id, email) values ('${STRANGER}', 'someone-else@example.com')`);

{
  const { rows } = await db.query(`select label from public.admin_users where user_id = $1`, [OWNER]);
  if (!rows.length) {
    fail("the owner is not allowlisted after the migrations ran",
         "20260801000200_allowlist_owner.sql is what puts the row there");
    process.exit(1);
  }
}

console.log("\nwho can do what, asked of the database\n");

/* How PostgREST presents a request: it switches role and sets the verified
   JWT claims. `as` of null is a logged-out visitor — role anon, no claims. */
async function as(uid, body) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await db.exec(uid
      ? `set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`
      : `set local request.jwt.claims = ''`);
    return await body();
  } finally {
    await db.exec("rollback");   // never let one case leak into the next
  }
}

/* "Refused" is either an error or zero rows affected: RLS on a SELECT filters
   rows away rather than raising, and an UPDATE that matches no visible row
   succeeds having done nothing. Both are a denial and both must count as one,
   or an UPDATE policy that silently matches nothing reads as a pass. */
async function allowed(uid, sql) {
  return as(uid, async () => {
    try {
      const r = await db.query(sql);
      if (/^\s*select/i.test(sql)) return r.rows.length > 0;
      return r.affectedRows > 0;
    } catch {
      return false;
    }
  });
}

/* Every write below is run three times — as the owner, as a signed-in
   stranger, and logged out — using the *same* statement. That structure is the
   point, and it was arrived at by getting it wrong first.

   The first version wrote `update menu_items set price = '999'` with no WHERE.
   That fails for everyone, because setting a price on all 84 rows gives the
   items that are priced-by-size two shapes at once and trips
   menu_items_one_price_shape. It read as "the owner is refused" — but worse, it
   read as "the stranger is refused" for a reason that had nothing to do with
   RLS. A test that passes because the statement was invalid is a test that
   would keep passing with every policy dropped.

   So each statement must be one the owner genuinely can execute. The owner
   column is what proves it; the other two columns then mean something. */
const WRITES = [
  ["change a price",
   `update public.menu_items set price = '999'
    where id = (select id from public.menu_items where price is not null order by name limit 1)`],

  ["close a day",
   `update public.business_hours set is_closed = true, opens_at = null, closes_at = null
    where day_of_week = 1`],

  ["change the phone number",
   `update public.site_settings set value = '5551234567' where key = 'phone_digits'`],

  ["change a breakfast builder choice",
   `update public.menu_builder_options set label = 'Updated topping'
    where id = (select id from public.menu_builder_options where group_key = 'add'
                order by sort_order limit 1)`],

  ["add a breakfast builder choice",
   `insert into public.menu_builder_options (group_key, label, price, sort_order)
    values ('add', 'New topping', '1', 99)`],

  ["delete a breakfast builder choice",
   `delete from public.menu_builder_options
    where id = (select id from public.menu_builder_options where group_key = 'add'
                order by sort_order desc limit 1)`],

  ["rewrite a headline",
   `update public.site_copy set value = 'Rewritten'
    where key = (select key from public.site_copy order by key limit 1)`],

  ["add a menu item",
   `insert into public.menu_items (course_id, name, price, sort_order)
    select id, 'New dish', '12', 99 from public.menu_courses order by sort_order limit 1`],

  ["delete a menu item",
   `delete from public.menu_items
    where id = (select id from public.menu_items order by name limit 1)`],

  ["add a course",
   `insert into public.menu_courses (page, course_key, tab_label, heading, sort_order)
    values ('food', 'zz-new', 'New', 'New', 500)`],

  ["change which photograph is in a slot",
   `update public.photos set storage_path = 'hero.main/1.webp', alt = 'A room'
    where slot = 'hero.main'`],

  /* The bucket, through the same three actors as everything else. This is a
     policy on storage.objects rather than on a table these migrations created,
     and it is the only place where the thing being protected is a file rather
     than a row — which is exactly why it is worth running the same three
     columns over. See the shim's note on what this does and does not prove:
     the policy is real, the upload endpoint above it is not here. */
  ["put a file in the photo bucket",
   `insert into storage.objects (bucket_id, name) values ('site-photos', 'hero.main/1.webp')`],

  ["take a file out of the photo bucket",
   `delete from storage.objects where bucket_id = 'site-photos'`]
];

const READS = [
  ["the menu",     `select 1 from public.menu_items limit 1`],
  ["the hours",    `select 1 from public.business_hours limit 1`],
  ["the copy",     `select 1 from public.site_copy limit 1`],
  ["the settings", `select 1 from public.site_settings limit 1`],
  ["the pours",    `select 1 from public.menu_item_pours limit 1`],
  ["the breakfast builder", `select 1 from public.menu_builder_options limit 1`]
];

const ACTORS = [
  ["the owner",              OWNER,    true],
  ["a signed-in stranger",   STRANGER, false],
  ["a logged-out visitor",   null,     false]
];

let checks = 0;

for (const [what, sql] of READS) {
  for (const [who, uid] of ACTORS) {
    checks++;
    const got = await allowed(uid, sql);
    if (got) pass(`can     ${who} read ${what}`);
    else fail(`${who} cannot read ${what} — the public site would render empty`);
  }
}

/* Something for the delete case to delete. Every actor's statement runs inside
   a transaction that is rolled back, so the file an earlier case inserted is
   not there for a later one — and a DELETE that matches nothing is a DELETE
   that reads as refused, for everybody, which would have quietly turned the
   three storage rows below into three passes about nothing. Inserted here,
   outside the actor transactions, so it survives all three. */
await db.exec(
  `insert into storage.objects (bucket_id, name) values ('site-photos', 'seeded/photo.webp')`);

for (const [what, sql] of WRITES) {
  for (const [who, uid, mayWrite] of ACTORS) {
    checks++;
    const got = await allowed(uid, sql);
    if (got === mayWrite) pass(`${mayWrite ? "can    " : "cannot "} ${who} ${what}`);
    else if (mayWrite) {
      fail(`${who} cannot ${what}`,
           "the owner must be able to run this, or the two rows below it prove nothing");
    } else {
      fail(`${who} can ${what}`, "this is a write policy that is not holding");
    }
  }
}

/* The allowlist itself: RLS on, no policies at all, and the grants revoked. It
   must be unreachable from the API for everyone — including the owner, so that
   a stolen owner session cannot mint a second admin. */
const ALLOWLIST = [
  ["read the allowlist",       `select 1 from public.admin_users limit 1`],
  ["add themselves to it",     `insert into public.admin_users (user_id, label) values ('${STRANGER}', 'me')`]
];
for (const [what, sql] of ALLOWLIST) {
  for (const [who, uid] of ACTORS) {
    checks++;
    const got = await allowed(uid, sql);
    if (!got) pass(`cannot  ${who} ${what}`);
    else fail(`${who} can ${what}`,
              "admin_users is meant to be reachable only from the SQL editor and the service role");
  }
}

/* is_owner() is granted to authenticated only. A logged-out caller has no
   reason to ask, and Uptown needed a second migration to take this grant back
   after giving it to anon — so it is worth asserting rather than assuming. */
{
  const anonCan = await as(null, async () => {
    try { await db.query("select public.is_owner()"); return true; } catch { return false; }
  });
  const authCan = await as(STRANGER, async () => {
    try { await db.query("select public.is_owner()"); return true; } catch { return false; }
  });
  if (anonCan) fail("a logged-out visitor can call is_owner()",
                    "granted to authenticated only — see the note at init_cms.sql:67");
  else if (!authCan) fail("a signed-in account cannot call is_owner()",
                          "every write policy calls it; refused here means no one can ever write");
  else pass("cannot  a logged-out visitor call is_owner(), and a signed-in one can");
}

/* The property the whole no-innerHTML rule exists for, checked at the other
   end: the database stores markup as the literal characters the owner typed.
   render.js is what keeps it text on the page; this only proves the store does
   not mangle, strip or interpret it. */
{
  const payload = `<script>alert(1)</script>`;
  const stored = await as(OWNER, async () => {
    await db.query(`update public.site_copy set value = $1
                    where key = (select key from public.site_copy order by key limit 1)`, [payload]);
    const r = await db.query(`select value from public.site_copy
                              where key = (select key from public.site_copy order by key limit 1)`);
    return r.rows[0].value;
  });
  if (stored !== payload) fail("markup typed into a copy field did not round-trip verbatim",
                               `stored: ${stored}`);
  else pass("stores    a script tag as the literal text it is");
}

/* The audit log (20260822000000_audit_log.sql, read side widened by
   20260822000200_audit_shared_history.sql) is a different shape from every
   table above, and it gets a fourth actor to prove it: the second editor.
   Any allowlisted account can add a row about itself, any allowlisted
   account can read the rows — admins are equal, and the history belongs to
   all of them — and nobody through the API can change or remove one,
   because a log that can be rewritten is a note board. */
{
  /* Non-empty before anybody reads it: a refused SELECT and an empty table
     are both zero rows, and only one of them proves a policy is holding.
     Seeded outside as() — as() rolls back, which is exactly right for the
     cases and exactly wrong for the fixture. */
  await db.exec(
    `insert into public.audit_log (actor, action, summary)
     values ('${OWNER}', 'save', 'Seeded so the reads below mean something')`);

  const NOBODY = { owner: false, editor: false, stranger: false, visitor: false };
  const FOUR = [
    ["the owner",            OWNER,      "owner"],
    ["the second editor",    EDITOR_UID, "editor"],
    ["a signed-in stranger", STRANGER,   "stranger"],
    ["a logged-out visitor", null,       "visitor"]
  ];

  const AUDIT = [
    ["read the history",
     `select 1 from public.audit_log limit 1`,
     { owner: true, editor: true, stranger: false, visitor: false }],
    ["record their own action",
     `insert into public.audit_log (action, summary) values ('login', 'Signed in')`,
     { owner: true, editor: true, stranger: false, visitor: false }],
    ["rewrite a history row",
     `update public.audit_log set summary = 'Rewritten'`,
     NOBODY],
    ["erase the history",
     `delete from public.audit_log`,
     NOBODY]
  ];

  for (const [what, sql, may] of AUDIT) {
    for (const [who, uid, kind] of FOUR) {
      checks++;
      const got = await allowed(uid, sql);
      if (got === may[kind]) pass(`${may[kind] ? "can    " : "cannot "} ${who} ${what}`);
      else fail(`${who} ${got ? "can" : "cannot"} ${what}`,
                "20260822000000_audit_log.sql is not holding the shape POLICIES.md describes");
    }
  }

  /* The editor may record actions, but only as themselves: a row naming the
     owner written from the editor's session fails the with check half of the
     insert policy. */
  checks++;
  const forged = await allowed(EDITOR_UID,
    `insert into public.audit_log (actor, action, summary)
     values ('${OWNER}', 'save', 'Not the editor')`);
  if (!forged) pass("cannot  the second editor write a history row in the owner's name");
  else fail("the second editor wrote a history row in the owner's name",
            "the insert policy checks actor = auth.uid() for exactly this");

  /* The check constraint is the list of things that can be said. "unsaved"
     joined it in 20260822000100_audit_unsaved.sql — and anything else stays
     unsayable, because a log that accepts any word is a log that says
     nothing. */
  checks++;
  const unsavedRow = await allowed(EDITOR_UID,
    `insert into public.audit_log (action, summary)
     values ('unsaved', 'Discarded 1 unsaved change; nothing was written')`);
  if (unsavedRow) pass("can     the second editor record unsaved work");
  else fail("the second editor could not record unsaved work",
            "20260822000100_audit_unsaved.sql has not been run — the editor sends this word now");
  checks++;
  const teleported = await allowed(OWNER,
    `insert into public.audit_log (action, summary) values ('teleport', 'Left the building')`);
  if (!teleported) pass("cannot  the owner record an action the editor never sends");
  else fail("the owner recorded an action outside the list",
            "audit_log_action_check did not hold — the constraint is the vocabulary");

  /* can_view_audit() is how the /audit-log page tells "not your page" apart
     from "nothing yet" — RLS answers a refused SELECT with zero rows, same
     as an empty log. Since 20260822000200 it is is_owner() under another
     name: true for every allowlisted account, uncallable logged out. The
     page no longer calls it — admit() asks is_owner() directly — but the
     grant shape is worth asserting all the same. */
  checks++;
  const ownerAnswer = await as(OWNER, async () =>
    (await db.query("select public.can_view_audit()")).rows[0].can_view_audit);
  const editorAnswer = await as(EDITOR_UID, async () =>
    (await db.query("select public.can_view_audit()")).rows[0].can_view_audit);
  const anonCanCall = await as(null, async () => {
    try { await db.query("select public.can_view_audit()"); return true; } catch { return false; }
  });
  if (ownerAnswer === true && editorAnswer === true && !anonCanCall)
    pass("can_view_audit() answers every admin and is uncallable logged out");
  else fail("can_view_audit() does not treat admins as equals",
            `owner: ${ownerAnswer}, editor: ${editorAnswer}, anon could call it: ${anonCanCall}`);
}

console.log(failures
  ? `\n${failures} of ${checks + 2} authorisation checks are not what POLICIES.md promises`
  : `\nall ${checks + 2} authorisation checks behave as POLICIES.md describes`);
process.exit(failures ? 1 : 0);
