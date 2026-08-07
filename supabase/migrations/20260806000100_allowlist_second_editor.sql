-- ============================================================================
-- Allowlist a second editor.
--
-- Same shape, and the same warnings, as 20260801000200_allowlist_owner.sql.
--
-- ORDER MATTERS. admin_users.user_id references auth.users (id), so the account
-- has to exist before this runs. It does: aragvelipalazzolo@gmail.com was
-- created in Dashboard -> Authentication -> Users on 2026-08-06 and had already
-- signed in when this was written. If this fails with a foreign key violation
-- the account is missing or the UUID below is wrong — do not "fix" it by
-- dropping the reference.
--
-- WHAT THIS GRANTS. admin_users has no roles and no scopes: a row in it is
-- is_owner() returning true, which every write policy in 20260801000000 keys
-- off. This account can therefore edit and delete anything in the CMS exactly
-- as the owner can. There is still no audit trail — see memory.md — so after
-- this there is no way to tell which of the two made a given change.
--
-- Idempotent, because a migration that cannot be re-run makes restoring from
-- scratch harder than it needs to be.
-- ============================================================================

insert into public.admin_users (user_id, label)
values ('e47472aa-730d-46b3-b648-cc1dfd4ccaaa', 'Aromati — editor')
on conflict (user_id) do nothing;

-- Fail loudly rather than reporting success on a typo. The owner's file checks
-- that the table is non-empty, which cannot work here: the owner row already
-- satisfies that. This checks for the row it just claimed to write.
do $$
begin
  if not exists (
    select 1 from public.admin_users
    where user_id = 'e47472aa-730d-46b3-b648-cc1dfd4ccaaa'
  ) then
    raise exception
      'The second editor was not allowlisted. Check that the account exists in Authentication -> Users and that its UUID matches this file.';
  end if;
end;
$$;
