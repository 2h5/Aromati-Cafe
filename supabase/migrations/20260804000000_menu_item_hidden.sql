-- ============================================================================
-- Taking an item off the menu without destroying it
--
-- Until now the only way to remove an item was Delete, which is permanent and
-- takes its children with it: menu_item_options is ON DELETE CASCADE, and the
-- crêpe's seven toppings are not rebuildable through the editor. So an owner
-- whose salmon is off for a week had two bad choices — delete and retype it on
-- Friday, or leave it up and disappoint people at the table.
--
-- is_hidden is the third choice. The item stays whole in the database and stops
-- being published. Nothing about it is lost, and nothing about it is shown.
--
-- Deliberately not modelled: a "sold out" state. That is a visible badge on the
-- public menu, which is design work on two pages and a promise the owner has to
-- remember to undo. Hidden has no such tail.
-- ============================================================================

alter table public.menu_items
  add column if not exists is_hidden boolean not null default false;

comment on column public.menu_items.is_hidden is
  'The item is kept but not published. The public site prunes it in data.js before anything renders; the editor still shows it so it can be brought back.';

-- The public menu is read by anon on every page load and the overwhelming
-- majority of rows are visible, so this is a partial index on the exception:
-- it stays small, and it is the shape the "what is hidden" question asks.
create index if not exists menu_items_hidden_idx
  on public.menu_items (course_id)
  where is_hidden;

-- ----------------------------------------------------------------------------
-- The write grant
--
-- RLS on menu_items is already correct — public read, owner-only write through
-- public.is_owner() — and a new column inherits the table's policies, so there
-- is nothing to add there. What does need saying is that the column is the
-- owner's to set, unlike photos.is_decorative, which the markup owns. The
-- editor's WRITABLE list is the enforcement; this comment is the reason.
-- ----------------------------------------------------------------------------

do $$
declare n integer;
begin
  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'menu_items' and column_name = 'is_hidden';
  if n <> 1 then
    raise exception 'menu_items.is_hidden did not land';
  end if;
end $$;
