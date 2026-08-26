-- ============================================================================
-- Temporary audit-log session cleanup.
--
-- The viewer may clear the login rows that make up the Sessions rail, but it
-- must never turn the rest of the audit history into editable content. The
-- policy is row-scoped and the grant is explicit: an allowlisted admin can
-- delete action = 'login' only. Saves, publishes, and unsaved-work records
-- remain append-only through the API.
-- ============================================================================

drop policy if exists "allowlisted accounts clear session rows" on public.audit_log;

create policy "allowlisted accounts clear session rows"
  on public.audit_log for delete to authenticated
  using (public.is_owner() and action = 'login');

grant delete on table public.audit_log to authenticated;
