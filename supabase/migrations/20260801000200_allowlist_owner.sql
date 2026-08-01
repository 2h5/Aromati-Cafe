-- ============================================================================
-- Allowlist the owner account — Phase 3, step 5.
--
-- Until this row exists, is_owner() returns false for everyone and every write
-- is denied. That is the intended fail-closed default of 20260801000000, not a
-- fault; this file is what ends it.
--
-- ORDER MATTERS. admin_users.user_id references auth.users (id), so the
-- account has to exist before this runs. It does: it was created by hand in
-- Dashboard -> Authentication -> Users on 2026-08-01, and public signups were
-- turned off at the same time. If this migration fails with a foreign key
-- violation, the account is missing or the UUID below is wrong — do not
-- "fix" it by dropping the reference.
--
-- There is deliberately no second account and no audit trail. Read
-- memory.md, "What's still open", item 3, before adding one: history that was
-- never recorded cannot be backfilled, so the columns have to come first.
--
-- Idempotent, because a migration that cannot be re-run is a migration that
-- makes restoring from scratch harder than it needs to be.
-- ============================================================================

insert into public.admin_users (user_id, label)
values ('a69c4370-3872-4b61-aba2-4049e34f9549', 'Aromati — owner')
on conflict (user_id) do nothing;

-- Fail loudly rather than leaving a project where nobody can edit anything.
-- Without this, a typo in the UUID above is a silent no-op that only shows up
-- later as "the save button does nothing".
do $$
begin
  if not exists (select 1 from public.admin_users) then
    raise exception
      'The owner was not allowlisted. Check that the account exists in Authentication -> Users and that its UUID matches this file.';
  end if;
end;
$$;
