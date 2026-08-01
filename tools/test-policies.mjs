/* Does the policy checker actually catch anything?
   node tools/test-policies.mjs

   check-policies.mjs passed all seven of its rules the first time it was run,
   against SQL written the same afternoon. That is the least informative result
   a test can give: a checker whose rules never match anything passes exactly
   the same way.

   So each rule gets broken on purpose, one at a time, and has to fail. The
   break is a small edit to a copy of the real migration — a dropped `enable row
   level security`, a write policy quietly handed to anon — chosen to look like
   something a person would actually do by accident.

   Each case also has to leave the OTHER rules alone. A mutation that trips
   three checks proves nothing about which one was watching. */

import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const SOURCE = "supabase/migrations/20260801000000_init_cms.sql";
const clean = readFileSync(SOURCE, "utf8");

let failures = 0;

/* Run the checker against a directory holding `sql`, return its output and
   whether it exited non-zero. */
function run(sql) {
  const dir = mkdtempSync(join(tmpdir(), "policycheck-"));
  try {
    writeFileSync(join(dir, "test.sql"), sql);
    try {
      const out = execFileSync("node", ["tools/check-policies.mjs", dir], { encoding: "utf8" });
      return { failed: false, out };
    } catch (err) {
      return { failed: true, out: (err.stdout || "") + (err.stderr || "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* `expect` is a phrase from the failing check's line, so the test asserts which
   rule fired and not merely that something did. */
function mutation(what, sql, expect) {
  if (sql === clean) {
    failures++;
    console.log(`  FAIL ${what}`);
    console.log("         the mutation changed nothing — has the SQL been reworded?");
    return;
  }

  const r = run(sql);
  const named = r.out.split("\n").some((l) => l.startsWith("  FAIL") && l.includes(expect));
  const ok = r.failed && named;
  if (!ok) failures++;

  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) {
    console.log(`         expected a FAIL line mentioning ${JSON.stringify(expect)}`);
    console.log(`         exit was ${r.failed ? "non-zero" : "ZERO — the break went unnoticed"}`);
    const lines = r.out.split("\n").filter((l) => l.includes("FAIL"));
    console.log(`         FAIL lines seen: ${lines.length ? lines.join(" / ").trim() : "(none)"}`);
  }
}

console.log("\nthe real migration passes");
{
  const r = run(clean);
  if (r.failed) { failures++; console.log("  FAIL the committed SQL does not pass its own checker"); console.log(r.out); }
  else console.log("  ok   unmodified, every rule is satisfied");
}

console.log("\neach rule catches its own break");

mutation(
  "1. a table left without row level security",
  clean.replace(/alter table public\.menu_items\s+enable row level security;/, ""),
  "no table is left unprotected"
);

mutation(
  "2. a table with RLS on and every policy forgotten",
  clean.replace(/create policy "photos[\s\S]*?with check \(public\.is_owner\(\)\);/, "")
       /* the grant has to go too, or rule 6 fires first and masks this */
       .replace(/(grant update on\n  public\.site_settings, public\.business_hours, public\.menu_pages,\n  public\.site_copy), public\.photos/, "$1"),
  "no table is silently unreachable"
);

mutation(
  "3. a write policy handed to anon",
  clean.replace('on public.menu_items for insert to authenticated with check (public.is_owner());',
                'on public.menu_items for insert to anon, authenticated with check (public.is_owner());'),
  "anon can read, never write"
);

mutation(
  "4. a write policy that only checks you are logged in",
  clean.replace('on public.faq_entries for delete to authenticated using (public.is_owner());',
                'on public.faq_entries for delete to authenticated using (true);'),
  "being logged in is not enough"
);

mutation(
  "4b. an update policy that checks the way in but not the way out",
  clean.replace('  on public.site_copy for update to authenticated\n  using (public.is_owner()) with check (public.is_owner());',
                '  on public.site_copy for update to authenticated\n  using (public.is_owner()) with check (true);'),
  "update policies check both using and with check"
);

mutation(
  "5. a table-level write grant to anon",
  clean.replace("  public.site_copy, public.photos\n  to authenticated;",
                "  public.site_copy, public.photos\n  to anon, authenticated;"),
  "anon holds select and nothing else"
);

mutation(
  "6. a policy whose grant was never written",
  clean.replace("grant insert, update, delete on\n  public.hours_exceptions, ", "grant insert, update, delete on\n  "),
  "every write is allowed by both, or by neither"
);

mutation(
  "7. a security definer function with an open search_path",
  clean.replace("stable\nsecurity definer\nset search_path = ''", "stable\nsecurity definer"),
  "no hijackable definer function"
);

console.log(failures ? `\n${failures} check(s) failed` : "\nevery rule was shown to fire");
process.exit(failures ? 1 : 0);
