-- ============================================================================
-- What the Supabase security advisor said — Phase 3, step 7.
--
-- Run against the live project on 2026-08-01, immediately after the three
-- migrations above. Five findings. One is fixed here; three are deliberate and
-- are argued rather than silenced; one cannot be fixed in SQL at all.
--
-- The advisor is a linter, not an oracle. A warning that is wrong for this
-- project should be answered in writing, not suppressed and not obeyed on
-- reflex. Every finding below is recorded with what it actually exposes, which
-- is the part a future reader needs and the part a linter cannot supply.
-- ============================================================================


-- ---- FIXED: public.rls_auto_enable() was callable by anon -------------------
--
-- WARN, twice: "Public Can Execute SECURITY DEFINER Function" and the
-- signed-in equivalent, both for public.rls_auto_enable().
--
-- This function is not ours. Supabase installs it on new projects as the
-- handler behind the `ensure_rls` event trigger, which switches RLS on for any
-- table created in `public` — a useful backstop, and it is why a table added
-- later cannot be world-writable by omission.
--
-- It should never have been callable over the API. It returns `event_trigger`,
-- so PostgREST cannot usefully invoke it and a direct call outside an event
-- trigger raises, which is why this is hygiene rather than a live hole. But an
-- EXECUTE grant nobody intended is exactly the sort of thing that stops being
-- harmless when the platform changes underneath it, and revoking costs nothing.
--
-- Event triggers fire as the system and do not consult EXECUTE, so the
-- `ensure_rls` backstop is unaffected. That was checked rather than assumed:
-- with the revoke in place, a freshly created table still came back with
-- relrowsecurity = true, and the probe table was dropped again.
--
-- `from public` is the whole fix, and the reason this line reads oddly.
--
-- The first attempt was `revoke execute ... from anon, authenticated`, which
-- ran without error and changed nothing at all. The grant was never to those
-- two roles: the ACL read `{=X/postgres, postgres=X/postgres}`, and a bare `=`
-- is the grant to PUBLIC. anon and authenticated held EXECUTE by way of being
-- members of the public, and revoking a privilege a role does not directly
-- hold is a silent no-op in Postgres — no error, no warning, no effect.
--
-- It was caught only because has_function_privilege() was checked afterwards
-- and still said true. Nothing else would have said so: the migration
-- succeeded, the advisor's own output is served from a cache keyed per finding
-- and went on reporting the pre-revoke state either way, and the comment above
-- already claimed the fix was verified. The check that mattered was of the
-- thing being changed, not of the thing being protected — verifying that the
-- event trigger still worked proved only that nothing broke, which is exactly
-- what a no-op guarantees.
--
-- anon and authenticated are named as well as public. They hold nothing
-- directly today, so those two words are strictly redundant; they are here so
-- that a future direct grant to either role is also taken back by this line.
--
-- This file is the corrected whole and applying it from scratch reaches the
-- right end state in one step. The live project records it as two entries —
-- `advisor_fixes` and `advisor_fixes_revoke_from_public` — because the first
-- was applied before the no-op was caught. Migration history is append-only,
-- so the mistake stays visible there rather than being edited away.
-- Guarded on the function existing, because it is Supabase's and not ours.
-- A hosted project has it; a plain Postgres does not, and neither does the
-- Postgres-in-WASM that tools/test-sql.mjs and tools/test-live.mjs build the
-- schema in. An unguarded revoke fails there with "function does not exist" and
-- takes the whole migration down — which is how this was caught. That is a real
-- portability bug and not a test artifact: the same failure would greet anyone
-- restoring this schema onto self-hosted Postgres.
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;


-- ---- ACCEPTED: public.is_owner() is callable by authenticated ---------------
--
-- WARN: "Signed-In Users Can Execute SECURITY DEFINER Function", because
-- is_owner() is reachable at /rest/v1/rpc/is_owner.
--
-- Intended, and not removable without breaking the security model. Every write
-- policy in 20260801000000 calls public.is_owner(), and a policy is evaluated
-- as the invoking role — so `authenticated` must hold EXECUTE or the owner
-- cannot write anything. The grant is already as narrow as it goes: it was
-- revoked from public and granted to authenticated only, never to anon.
--
-- What a caller can actually learn from it: whether they themselves are the
-- owner. It takes no arguments, reports only on the caller, and cannot be used
-- to enumerate the allowlist — admin_users has RLS on with no policies and all
-- privileges revoked from both API roles, so the table is unreachable and this
-- function is not a way around it. Signups are disabled, so today the only
-- account that can reach the endpoint at all is the owner's, and the answer it
-- gets is one it already has.
--
-- Moving the function to an unexposed schema would silence the warning and was
-- considered. Policies reference it by OID and would follow the move, so it
-- would work. It is not done here because the exposure is nil and the churn is
-- not: it would rewrite POLICIES.md, the RLS harness, the mutation guards and
-- the local Postgres shim, and it would take away a signal the Phase 5 editor
-- may legitimately want for deciding whether to render itself.
--
-- Revisit if any of that changes — specifically if a second account is ever
-- added (memory.md, "What's still open", item 3), or if is_owner() ever grows
-- an argument. An argument would turn it from a statement about the caller
-- into a question about someone else, which is a different function with a
-- different risk, and this reasoning would no longer cover it.


-- ---- ACCEPTED: admin_users has RLS enabled and no policies ------------------
--
-- INFO: "RLS Enabled No Policy".
--
-- This is the design, stated in section 0 of 20260801000000. RLS on with no
-- policy means anon and authenticated get zero rows and zero writes, so an
-- editor who is signed in cannot promote a second account through the app.
-- Adding a policy to satisfy the linter would create the hole the linter is
-- shaped to look for. The advisor cannot tell an empty policy list that was
-- forgotten from one that was chosen; this file is the record that it was
-- chosen.
--
-- Verified live, as the owner: INSERT into admin_users is refused at the grant
-- layer before RLS is consulted. Both layers hold independently.


-- ---- NOT FIXABLE HERE: leaked password protection is off -------------------
--
-- WARN: Supabase Auth can check new passwords against HaveIBeenPwned and is
-- not currently doing so.
--
-- A dashboard setting, not SQL — Authentication -> Policies. It cannot be
-- turned on from a migration, so this file cannot fix it and does not pretend
-- to. It matters less here than on most projects, because signups are disabled
-- and there is exactly one account, so the setting only ever applies when the
-- owner changes their own password. It is still worth switching on: that one
-- password is the whole editor.
--
-- Left for the owner, and recorded in memory.md rather than only here.


-- ---- The performance advisor -----------------------------------------------
--
-- Nine INFO findings, all "unused index", all on indexes created twenty
-- minutes earlier on a database that had not yet served a request. They say
-- nothing yet. Worth re-running once the site has been live for a while, at
-- which point they may genuinely mean the sort indexes are not earning their
-- keep on tables this small. Nothing to do now, and dropping an index on the
-- strength of a statistic with no traffic behind it would be worse than
-- keeping it.
--
-- Nothing raised a "function search_path mutable" warning, which is the usual
-- finding on a schema with this many trigger functions. Every function in
-- 20260801000000 pins `set search_path` at definition, so that class of
-- finding never appeared.
