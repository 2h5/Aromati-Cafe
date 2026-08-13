-- The fixed Build Your Own Breakfast block can be temporarily held without
-- deleting its markup or its CMS choices. Existing menu-course policies already
-- protect this column, so this migration only adds the state and its contract.

alter table public.menu_courses
  add column if not exists is_hidden boolean not null default false;

comment on column public.menu_courses.is_hidden is
  'When true, the whole course is omitted from the public menu while its rows remain editable.';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'menu_courses'
      and column_name = 'is_hidden'
      and data_type = 'boolean'
      and is_nullable = 'NO'
  ) then
    raise exception 'menu_courses.is_hidden did not land';
  end if;
end $$;
