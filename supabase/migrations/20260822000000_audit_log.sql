-- ============================================================================
-- The audit trail.
--
-- Until this file, memory.md's "What's still open" item 3 applied: two
-- allowlisted accounts could each change anything, and nothing recorded which
-- of them had. This is the table that ends it. It answers three questions —
-- who signed in, who saved what, who asked for a rebuild — and it answers
-- them with rows nobody can edit or remove, because a log that can be
-- rewritten is not a log.
--
-- WHO CAN DO WHAT, in one paragraph. Any allowlisted account can ADD rows,
-- and only rows about itself — actor defaults to auth.uid() and the insert
-- policy refuses a row claiming to be anybody else. Only the owner account
-- can READ it: the select policy names the one UUID, so the second editor's
-- actions are recorded but the second editor cannot see the record. Nobody
-- through the API can update or delete, not even the owner — there are no
-- policies or grants for those, and with RLS on that is a refusal, not an
-- omission. The one escape hatch is the SQL editor, same as admin_users.
--
-- actor_email is what the editor reports, kept because auth.users is not
-- readable through the API and a log of bare UUIDs is a log nobody reads.
-- The enforced identity is actor; the email is a label beside it.
--
-- Like every migration in this folder, this file is written to run once, in
-- order, on a database being built forward — and test-sql.mjs replays the
-- whole folder from empty on every run, which is what keeps that true.
-- ============================================================================

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor       uuid not null references auth.users (id) default auth.uid(),
  actor_email text,
  action      text not null check (action in ('login', 'save', 'publish')),
  summary     text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- A new table arrives with default grants to anon and authenticated; hand
-- everything back first, then give out exactly the two permissions below.
revoke all on public.audit_log from anon, authenticated;

-- Writing: any allowlisted account, about itself only. is_owner() is the same
-- question every content write asks, so the day an account leaves the
-- allowlist it also loses the ability to write here.
create policy "editors record their own actions"
  on public.audit_log for insert to authenticated
  with check (public.is_owner() and actor = (select auth.uid()));

-- Reading: the owner account, and no other account — including the second
-- editor. The UUID is the one allowlisted in 20260801000200. It is written
-- here literally rather than looked up in admin_users because admin_users has
-- no roles: a row there means "may edit", and this policy's whole point is
-- that reading the history is a narrower permission than editing the site.
create policy "only the owner reads the history"
  on public.audit_log for select to authenticated
  using (auth.uid() = 'a69c4370-3872-4b61-aba2-4049e34f9549');

grant insert, select on public.audit_log to authenticated;

-- The viewer page asks this before it asks for rows, because RLS answers a
-- refused SELECT with an empty result — indistinguishable from an empty log.
-- Not security definer: it reads nothing but the caller's own claims, so
-- there is nothing to hijack. Same grant shape as is_owner(): authenticated
-- may ask, a logged-out visitor has no reason to.
create or replace function public.can_view_audit()
returns boolean
language sql
stable
as $$
  select auth.uid() = 'a69c4370-3872-4b61-aba2-4049e34f9549';
$$;

revoke execute on function public.can_view_audit() from public;
grant  execute on function public.can_view_audit() to authenticated;

-- Fail loudly rather than leaving a table the editor writes into and nobody
-- can read: if the owner allowlist row is missing, the select policy above
-- names an account that cannot sign in, and the log is a write-only memory
-- hole that looks exactly like the feature working.
do $$
begin
  if not exists (
    select 1 from public.admin_users
    where user_id = 'a69c4370-3872-4b61-aba2-4049e34f9549'
  ) then
    raise exception
      'The audit log names an owner account that is not allowlisted. Apply 20260801000200_allowlist_owner.sql first, and check the UUID matches the account in Authentication -> Users.';
  end if;
end;
$$;
