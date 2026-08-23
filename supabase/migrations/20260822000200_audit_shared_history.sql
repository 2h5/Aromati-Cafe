-- ============================================================================
-- The history belongs to every admin.
--
-- 20260822000000_audit_log.sql made reading the log a narrower permission
-- than editing the site: the select policy named one account literally, and
-- can_view_audit() answered true for that account alone. That was written
-- for a house with one owner and one editor. The house has three admins,
-- and the rule they asked for is simpler: admins are equal, and anything an
-- admin may do — including reading the history of what admins did — every
-- admin may do.
--
-- So reading now asks the same question writing already asked: is_owner().
-- One allowlist, one meaning. An account that leaves the allowlist loses
-- the history on the same day it loses the editor, and a fourth admin
-- joining the allowlist gets both without a migration.
--
-- Nothing else changes. Writes are still about-oneself only, nobody through
-- the API can update or delete a row, and a stranger still gets nothing —
-- is_owner() is false for them, as it always was.
--
-- Like every migration in this folder, this file is written to run once, in
-- order, on a database being built forward — and test-sql.mjs replays the
-- whole folder from empty on every run, which is what keeps that true.
-- ============================================================================

drop policy "only the owner reads the history" on public.audit_log;

create policy "allowlisted accounts read the history"
  on public.audit_log for select to authenticated
  using (public.is_owner());

create or replace function public.can_view_audit()
returns boolean
language sql
stable
as $$
  select public.is_owner();
$$;
