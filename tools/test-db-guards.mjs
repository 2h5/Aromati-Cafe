/* Can test-rls.mjs and test-sql.mjs actually fail?
   node tools/test-db-guards.mjs

   Both of them passed every check the first time they ran, against SQL written
   weeks earlier. So does a harness whose assertions are all vacuous — and one
   of these very nearly was: the first draft of test-rls.mjs "proved" that a
   stranger could not change a price, using a statement that no one could
   execute because it violated a CHECK constraint. It would have passed with
   every policy in the file deleted.

   So each real mistake is put back here, on a copy of the migrations, and the
   harness has to fail. The mistakes are the ones that are silent when made:
   RLS forgotten on a table, a policy that says `true` where it meant
   `is_owner()`, the allowlist made readable, is_owner() handed to anon.

   Nothing is written to supabase/migrations — the copies go to a temp
   directory and the harness is pointed at it with MIGRATIONS_DIR. */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = "supabase/migrations";
const INIT = "20260801000000_init_cms.sql";
const PHOTOS = "20260801000400_photos.sql";

let failures = 0;

/* `file` names which migration to break — most of the silent mistakes live in
   the schema, the photograph ones live in their own migration. */
function run(what, harness, mutate, expect, file = INIT) {
  const dir = mkdtempSync(join(tmpdir(), "aromati-db-"));
  try {
    for (const f of readdirSync(SRC)) cpSync(join(SRC, f), join(dir, f));

    const before = readFileSync(join(dir, file), "utf8");
    writeFileSync(join(dir, file), mutate(before));
    const after = readFileSync(join(dir, file), "utf8");

    /* A mutation that matched nothing would pass for the wrong reason. This
       has already caught one: the RLS statements are whitespace-aligned, so
       the obvious search string missed by several spaces. */
    if (before === after) {
      failures++;
      console.log(`  FAIL ${what}`);
      console.log("         the mutation changed nothing — has the SQL been reformatted?");
      return;
    }

    let out = "";
    try {
      /* check-policies.mjs takes the directory as an argument and the two
         database harnesses take it from the environment. Both are given it,
         because a harness that quietly read the *real* migrations would pass
         every mutation and prove nothing. */
      out = execFileSync(process.execPath, [harness, dir], {
        encoding: "utf8",
        env: { ...process.env, MIGRATIONS_DIR: dir }
      });
      failures++;
      console.log(`  FAIL ${what}`);
      console.log(`         ${harness} passed a database that is broken`);
      return;
    } catch (err) {
      out = (err.stdout || "") + (err.stderr || "");
    }

    const named = out.split("\n").some((l) => l.includes("FAIL") && l.includes(expect));
    if (!named) {
      failures++;
      console.log(`  FAIL ${what}`);
      console.log(`         it failed, but not for "${expect}":`);
      console.log(out.split("\n").filter((l) => l.includes("FAIL"))
                     .map((l) => `         ${l.trim()}`).join("\n") || "         (no FAIL lines at all)");
      return;
    }
    console.log(`  ok   ${what}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\nputting each silent mistake back\n");

/* 1 — RLS forgotten on one table. The failure mode is invisible: every read
       and write works, from every account and from none. */
run("RLS left off menu_items", "tools/test-sql.mjs",
  (s) => s.replace("alter table public.menu_items         enable row level security;", ""),
  "row level security");

/* 2 — a write policy that says true where it meant is_owner(). This is the
       one a hurried edit produces, and it reads almost the same. */
run("the menu update policy open to any signed-in account", "tools/test-rls.mjs",
  /* Matched by regex, not by a literal block: the literal missed once because
     the working tree has CRLF line endings and the search string had LF. */
  (s) => s.replace(
    /(create policy "menu_items owner update"\s+on public\.menu_items for update to authenticated\s+using \()public\.is_owner\(\)(\) with check \()public\.is_owner\(\)/,
    "$1true$2true"),
  "change a price");

/* 3 — the allowlist opened up. Two things have to be defeated for this to be a
       real hole: the missing policy AND the revoked grant. Adding only the
       policy changes nothing, because the `revoke all ... from anon,
       authenticated` at the bottom of the file still stands — which is the
       whole argument for stating those grants explicitly, and is worth knowing
       is true rather than assumed. So this mutation removes both. */
run("the allowlist made readable", "tools/test-rls.mjs",
  (s) => s
    .replace(/revoke all on public\.admin_users from anon, authenticated;/, "")
    .replace(
      /alter table public\.admin_users enable row level security;/,
      `alter table public.admin_users enable row level security;
       create policy admin_users_read on public.admin_users
         for select to anon, authenticated using (true);
       grant select on public.admin_users to anon, authenticated;`),
  "read the allowlist");

/* 4 — is_owner() granted to anon. Exactly the mistake Uptown made and needed a
       second migration to undo. */
run("is_owner() granted to anon", "tools/test-rls.mjs",
  (s) => s.replace(
    "grant  execute on function public.is_owner() to authenticated;",
    "grant  execute on function public.is_owner() to authenticated, anon;"),
  "is_owner()");

/* 5 — the price-shape constraint relaxed. Not a security hole; it is the one
       that silently overflows the menu's CSS grid. */
run("the one-price-shape constraint relaxed", "tools/test-sql.mjs",
  (s) => s.replace(
    "  constraint menu_items_one_price_shape check (",
    "  constraint menu_items_one_price_shape check (true or "),
  "menu shape");

/* 6 — the bucket's write policy opened to any signed-in account. The same
       mistake as 2, on the newest policies in the project, and on the one table
       whose grants Supabase issues rather than these migrations — which is
       exactly the kind of thing a checker quietly stops covering. */
run("the photo bucket open to any signed-in account", "tools/check-policies.mjs",
  (s) => s.replace(
    /(create policy "site-photos owner insert"\s+on storage\.objects for insert to authenticated\s+with check \(bucket_id = 'site-photos' and )public\.is_owner\(\)/,
    "$1true"),
  "being logged in is not enough", PHOTOS);

/* 7 — the description rule dropped. Silent by construction: every photograph
       still uploads, still appears, and announces nothing to a screen reader.

       Both layers have to go, and finding that out was worth the detour. The
       CHECK constraint refuses the row and the trigger raises the sentence the
       owner reads; removing either one alone changes nothing observable,
       because the other still holds. Same shape as mutation 3, and the same
       lesson: a mutation that only defeats half of a defence proves the other
       half works and says nothing about the half it removed. */
run("a photograph allowed with no description", "tools/test-sql.mjs",
  (s) => s
    .replace(
      "  check (is_decorative or storage_path is null or length(btrim(alt)) > 0);",
      "  check (true);")
    .replace(
      "  if not new.is_decorative and new.storage_path is not null",
      "  if false and new.is_decorative and new.storage_path is not null"),
  "photograph rules", PHOTOS);

/* 8 — the bucket created with no limits. Nothing about the editor changes;
       what changes is what someone holding the owner's token can post. */
run("the bucket created without its size and type limits", "tools/test-sql.mjs",
  (s) => s.replace(
    /values \('site-photos', 'site-photos', true, 3145728,\s*\n\s*array\['image\/webp', 'image\/jpeg', 'image\/png'\]\)/,
    "values ('site-photos', 'site-photos', true, null, null)"),
  "size or type limit", PHOTOS);

console.log(failures
  ? `\n${failures} case(s) the database harnesses would have let through`
  : "\nevery silent mistake is caught, and named");
process.exit(failures ? 1 : 0);
