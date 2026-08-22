-- ============================================================================
-- The audit trail learns the word "unsaved".
--
-- The day this file exists for: the owner says a bunch of changes were made,
-- the editor says nothing was saved, and neither can prove it. The audit log
-- already records saves, publishes and sign-ins; what it could not record was
-- work that never reached the database. Now it can, at the two moments that
-- work becomes a fact worth recording — the editor throws the changes away,
-- or the tab goes away with them still in it. A row written per keystroke
-- would be a diary of hesitation; a row written at the exit is an answer.
--
-- Nothing else about the table changes. The insert policy already permits any
-- allowlisted account to add rows about itself; only the allowed values of
-- "action" were narrower than what the editor now sends. This file widens
-- that one check.
--
-- Like every migration in this folder, this file is written to run once, in
-- order, on a database being built forward — and test-sql.mjs replays the
-- whole folder from empty on every run, which is what keeps that true.
-- ============================================================================

alter table public.audit_log
  drop constraint audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check
  check (action in ('login', 'save', 'publish', 'unsaved'));
