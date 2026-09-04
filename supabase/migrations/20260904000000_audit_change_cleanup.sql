-- Per-card audit-history cleanup.
--
-- The history viewer already lets an allowlisted admin clear an individual
-- login row. Give the same confirmation-gated UI control the matching,
-- narrowly scoped ability to clear one content-history row at a time. The
-- viewer still cannot update rows, and the API cannot clear any other action
-- vocabulary if one is added later without an explicit policy change.

drop policy if exists "allowlisted accounts clear change rows" on public.audit_log;

create policy "allowlisted accounts clear change rows"
  on public.audit_log for delete to authenticated
  using (public.is_owner() and action in ('save', 'publish', 'unsaved'));
