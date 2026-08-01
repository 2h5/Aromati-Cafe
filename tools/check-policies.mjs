/* Row level security, checked without a database.
   node tools/check-policies.mjs

   There is no Postgres here and no Supabase project yet, so this SQL cannot be
   executed and this is NOT a syntax check — it will not catch a missing comma.
   Assume the first real `supabase db push` finds something.

   What it does catch is the class of mistake that does not announce itself.
   A missing `enable row level security` produces a table that reads and writes
   perfectly in every test, from every account, including no account at all.
   Nothing fails. The data is simply public, and stays public until somebody
   thinks to look. The same goes for a write policy that forgets is_owner(), or
   a grant to anon that no policy was ever meant to back.

   Every rule below is one of those: silent when broken, cheap to assert.

   The rules:
     1. every table created has RLS enabled
     2. no table is left with RLS on and no policies, except by name
     3. no policy grants a write to anon
     4. every write policy is gated on is_owner()
     5. no table-level write grant to anon
     6. grants and policies agree — neither is useful alone
     7. every security definer function pins search_path                     */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* The directory is an argument so tools/test-policies.mjs can point this at a
   deliberately broken copy and watch each rule fire. A checker that has only
   ever returned "ok" has not been shown to be capable of anything else. */
const DIR = process.argv[2] || "supabase/migrations";

/* Tables that are meant to have RLS on and no policies at all. With RLS on,
   no policy means no permission, so this is the strictest setting there is —
   but it is indistinguishable from having forgotten to write them, which is
   why it has to be said out loud here. */
const NO_POLICIES_ON_PURPOSE = new Set(["admin_users"]);

let failures = 0;

function check(what, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok && detail) console.log(`         ${detail}`);
}

/* Comments would otherwise match every rule below — this file explains what it
   does NOT do at length, in SQL comments, using the words it is grepping for.
   Quote-aware so a -- inside a string literal survives. */
function stripComments(sql) {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inString) {
      out += c;
      if (c === "'") inString = sql[i + 1] === "'" ? (out += sql[++i], true) : false;
      continue;
    }
    if (c === "'") { inString = true; out += c; continue; }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
if (!files.length) throw new Error(`no migrations found in ${DIR}/`);

const sql = stripComments(files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n"));

const all = (re) => [...sql.matchAll(re)];

const tables  = all(/create table public\.(\w+)/g).map((m) => m[1]);
const rlsOn   = new Set(all(/alter table public\.(\w+)\s+enable row level security/g).map((m) => m[1]));

/* create policy "name" on public.table for select|insert|update|delete to roles
   ... up to the next statement. The body is kept so it can be searched for
   is_owner(). */
const policies = all(
  /create policy\s+"([^"]+)"\s+on public\.(\w+)\s+for (\w+)\s+to ([^\n]+?)\s+(using|with check)([\s\S]*?);/g
).map((m) => ({
  name: m[1], table: m[2], op: m[3].toLowerCase(),
  roles: m[4].split(",").map((r) => r.trim()),
  body: (m[5] + m[6])
}));

const WRITES = ["insert", "update", "delete"];

console.log(`\nreading ${files.length} migration(s): ${files.join(", ")}`);
console.log(`  ${tables.length} tables, ${policies.length} policies\n`);

console.log("1. every table has row level security enabled");
{
  const off = tables.filter((t) => !rlsOn.has(t));
  check("no table is left unprotected", off.length === 0,
        off.length ? `RLS never enabled on: ${off.join(", ")}` : "");
}

console.log("\n2. every table has policies, or is named as deliberately having none");
{
  const covered = new Set(policies.map((p) => p.table));
  const silent = tables.filter((t) => !covered.has(t) && !NO_POLICIES_ON_PURPOSE.has(t));
  check("no table is silently unreachable", silent.length === 0,
        silent.length ? `RLS on but no policies, and not declared: ${silent.join(", ")}` : "");

  for (const t of NO_POLICIES_ON_PURPOSE) {
    check(`${t} really has none`, !covered.has(t),
          covered.has(t) ? `${t} is declared policy-free but has one` : "");
  }
}

console.log("\n3. no write policy is granted to anon");
{
  const bad = policies.filter((p) => WRITES.includes(p.op) && p.roles.includes("anon"));
  check("anon can read, never write", bad.length === 0,
        bad.map((p) => `"${p.name}" grants ${p.op} to anon`).join("\n         "));
}

console.log("\n4. every write policy is gated on is_owner()");
{
  const bad = policies.filter((p) => WRITES.includes(p.op) && !/is_owner\(\)/.test(p.body));
  check("being logged in is not enough", bad.length === 0,
        bad.map((p) => `"${p.name}" does not call is_owner()`).join("\n         "));

  /* An update policy needs BOTH: using() decides which rows may be targeted,
     with check() decides what they may become. With only using(), an owner
     check can be passed on the way in and abandoned on the way out. */
  const half = policies.filter((p) => p.op === "update" &&
    !(/using\s*\(\s*public\.is_owner\(\)\s*\)/.test(p.body) &&
      /with check\s*\(\s*public\.is_owner\(\)\s*\)/.test(p.body)));
  check("update policies check both using and with check", half.length === 0,
        half.map((p) => `"${p.name}" is missing one half`).join("\n         "));
}

console.log("\n5. no table-level write grant to anon");
{
  const bad = all(/grant\s+([\s\S]*?)\s+on\s+([\s\S]*?)\s+to\s+([^;]+);/g)
    .filter((m) => /insert|update|delete/i.test(m[1]) && /\banon\b/i.test(m[3]));
  check("anon holds select and nothing else", bad.length === 0,
        bad.map((m) => `grant ${m[1].trim()} ... to ${m[3].trim()}`).join("\n         "));
}

console.log("\n6. grants and policies agree");
{
  /* Two independent layers, and a write needs both. Either one alone is a
     silent no-op: a policy with no grant never fires, a grant with no policy
     is refused by RLS. Both are dead code that reads as protection. */
  const granted = new Map();       // table -> Set(op) granted to authenticated
  for (const m of all(/grant\s+([\s\S]*?)\s+on\s+([\s\S]*?)\s+to\s+([^;]+);/g)) {
    if (!/\bauthenticated\b/.test(m[3])) continue;
    const ops = m[1].toLowerCase().split(",").map((s) => s.trim()).filter((o) => WRITES.includes(o));
    if (!ops.length) continue;
    for (const t of m[2].matchAll(/public\.(\w+)/g)) {
      if (!granted.has(t[1])) granted.set(t[1], new Set());
      ops.forEach((o) => granted.get(t[1]).add(o));
    }
  }

  const policied = new Map();
  for (const p of policies.filter((x) => WRITES.includes(x.op))) {
    if (!policied.has(p.table)) policied.set(p.table, new Set());
    policied.get(p.table).add(p.op);
  }

  const problems = [];
  for (const t of new Set([...granted.keys(), ...policied.keys()])) {
    const g = granted.get(t) || new Set();
    const p = policied.get(t) || new Set();
    for (const op of WRITES) {
      if (g.has(op) && !p.has(op)) problems.push(`${t}: ${op} granted but no policy allows it`);
      if (p.has(op) && !g.has(op)) problems.push(`${t}: ${op} policy exists but the grant is missing`);
    }
  }
  check("every write is allowed by both, or by neither", problems.length === 0,
        problems.join("\n         "));
}

console.log("\n7. every security definer function pins its search_path");
{
  /* A security definer function runs as its creator. Without a pinned
     search_path, a caller can put their own table earlier on the path and have
     it consulted instead — which for is_owner() means supplying their own
     admin_users. */
  const bad = all(/create function public\.(\w+)([\s\S]*?)\bas\s+\$\$/g)
    .filter((m) => /security definer/i.test(m[2]) && !/set search_path\s*=\s*''/.test(m[2]))
    .map((m) => m[1]);
  check("no hijackable definer function", bad.length === 0,
        bad.length ? `security definer without a pinned search_path: ${bad.join(", ")}` : "");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall policy checks passed");
process.exit(failures ? 1 : 0);
