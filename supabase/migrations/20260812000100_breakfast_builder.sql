-- Build Your Own Breakfast choices.
--
-- The page keeps its hand-written layout and interaction code because that is
-- what keeps the bagel disclosure and ticket animation stable on iOS. This
-- table owns only the rows inside the three groups: base, bagel and add-ons.
-- The public reader prunes hidden rows and falls back to the seed file if the
-- table is unavailable or has no usable base choices.

create table public.menu_builder_options (
  id         uuid primary key default gen_random_uuid(),
  group_key  text not null check (group_key in ('base', 'bagel', 'add')),
  label      text not null check (length(btrim(label)) > 0),
  price      text,
  hint       text,
  sub_key    text,
  is_hidden  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Bagel varieties are included in the base price. Base and add-on rows need
  -- a price because the ticket cannot calculate them otherwise.
  constraint menu_builder_price_required check (
    group_key = 'bagel' or length(btrim(coalesce(price, ''))) > 0
  ),

  -- Only a base can open the "Which bagel?" sub-group. A bad relationship here
  -- would leave a choice visible that the page can never reach.
  constraint menu_builder_sub_key_valid check (
    sub_key is null or (group_key = 'base' and sub_key = 'bagel')
  )
);

create index menu_builder_options_group_idx
  on public.menu_builder_options (group_key, sort_order, id);

create trigger menu_builder_options_touch
  before update on public.menu_builder_options
  for each row execute function public.touch_updated_at();

alter table public.menu_builder_options enable row level security;

create policy "menu_builder_options public read"
  on public.menu_builder_options for select to anon, authenticated using (true);

create policy "menu_builder_options owner insert"
  on public.menu_builder_options for insert to authenticated
  with check (public.is_owner());

create policy "menu_builder_options owner update"
  on public.menu_builder_options for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "menu_builder_options owner delete"
  on public.menu_builder_options for delete to authenticated
  using (public.is_owner());

grant select on public.menu_builder_options to anon, authenticated;
grant insert, update, delete on public.menu_builder_options to authenticated;

-- The seed is intentionally kept beside the schema change rather than folded
-- into the older menu seed migration, which predates this table.
insert into public.menu_builder_options
  (group_key, label, price, hint, sub_key, sort_order)
values
  ('base', 'Avocado toast', '6', 'Smashed avocado on grilled sourdough.', null, 1),
  ('base', 'Croissant sandwich', '7', 'Smashed avocado on a plain croissant.', null, 2),
  ('base', 'Bagel of your choice', '3', 'Plain or everything, toasted to order.', 'bagel', 3),
  ('bagel', 'Plain', null, null, null, 1),
  ('bagel', 'Everything', null, null, null, 2),
  ('add', 'Cream cheese', '2', null, null, 1),
  ('add', 'Sliced cheese — mozzarella, American or Swiss', '2', null, null, 2),
  ('add', 'Scrambled eggs', '4', null, null, 3),
  ('add', 'Salmon', '4', null, null, 4),
  ('add', 'Prosciutto', '2', null, null, 5),
  ('add', 'Avocado', '2', null, null, 6),
  ('add', 'Vegetables — red onion, tomato, cucumber, capers', '0.50', null, null, 7);

do $$
declare n integer;
begin
  select count(*) into n from public.menu_builder_options;
  if n <> 12 then
    raise exception 'menu_builder_options: expected 12 rows, found %', n;
  end if;
end $$;
