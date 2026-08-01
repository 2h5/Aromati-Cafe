/* ═══════════════════════════════════════════════
   AROMATI — where the live content comes from
   ═══════════════════════════════════════════════

   Loaded before data.js on every page. Two values, and one of them still has
   to be pasted in.

   ── the anon key is public, and that is not a mistake ──
   It identifies the project the way a street address identifies a shop: it
   says which door, not who may come in. What a caller is actually allowed to
   do is decided server-side by row level security — see supabase/POLICIES.md,
   and tools/test-rls.mjs, which asks the database rather than taking that on
   trust. Shipping it in a <script> is its intended use.

   ── what must never appear in this file ──
   The `service_role` / `sb_secret_` key bypasses every policy in the project.
   It does not belong in this file, in any file the browser loads, in a commit,
   or in a screenshot. If one is ever pasted here by accident, rotate it in the
   dashboard — deleting the commit is not enough, it is in the reflog and in
   whatever was deployed.

   ── empty is a supported state ──
   With no key the site never touches the network and renders entirely from the
   seed files, which is exactly what happens today and what will keep happening
   if the database is ever unpaid, deleted or unreachable. That is not a
   degraded mode bolted on afterwards; it is the floor the whole design stands
   on. Opening these pages from file:// does the same thing. */

var AROMATI_CONFIG = {
  /* The project's REST origin. Already correct — this is the project created
     on 2026-08-01. */
  url: "https://yofoiqgknsqzsuwtlqvh.supabase.co",

  /* Dashboard → Project Settings → API Keys → the **publishable / anon** key.
     Paste it between the quotes. Until then the site runs from the seeds. */
  anonKey: ""
};
