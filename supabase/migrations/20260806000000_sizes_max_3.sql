-- ============================================================================
-- A third size column
--
-- menu_courses.sizes was capped at two entries, and the reason was honest: the
-- price cells are a CSS grid, the grid was grid-template-columns: repeat(2,
-- var(--cell)), and a third size does not error — it overflows the row and the
-- price lands under the next item. A constraint was the right place to stop it.
--
-- The printed coffee sheet (assets/menus/menu – A5 - COFFEE.pdf) is priced in
-- three columns: Americano 4/5/6, Latte 6/6.50/7, the iced lattes 7/7.50/8.
-- Two columns cannot carry that, so the grid was made to count instead of
-- assume — styles.css now lays both the header row and the price rows out from
-- repeat(var(--cols), var(--cell)), and render.js sets --cols from the course's
-- own sizes array so the two grids cannot disagree.
--
-- The cap moves to 3 rather than going away. It is still a real limit: --cell
-- narrows once at data-cols="3" to keep the long drink names off a second line,
-- and there is no fourth step. An unbounded column count would go back to
-- failing silently in the layout, which is what the original constraint existed
-- to prevent.
-- ============================================================================

-- ── this file has to be a no-op on a fresh build ──
-- The cap is part of the schema, so 20260801000000_init_cms.sql declares it at
-- 3 directly. A database created from these migrations in order therefore
-- arrives here already correct, and only a database created before 2026-08-06
-- — the deployed one — has anything to do. Both paths run this file, so both
-- steps are guarded rather than assumed.
alter table public.menu_courses
  drop constraint if exists menu_courses_sizes_max_2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.menu_courses'::regclass
      and conname = 'menu_courses_sizes_max_3'
  ) then
    alter table public.menu_courses
      add constraint menu_courses_sizes_max_3
        check (sizes is null or cardinality(sizes) <= 3);
  end if;
end $$;

comment on constraint menu_courses_sizes_max_3 on public.menu_courses is
  'The price cells are repeat(var(--cols), var(--cell)) and styles.css sizes the cell for up to three columns. A fourth would overflow the row silently.';

-- ---- did it land? ----------------------------------------------------------
-- Asserted rather than assumed: a dropped-but-not-re-added constraint would
-- leave the column unbounded, which is worse than where this started.
do $$
declare n integer;
begin
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.menu_courses'::regclass
    and conname = 'menu_courses_sizes_max_3';
  if n <> 1 then
    raise exception 'menu_courses_sizes_max_3 did not land';
  end if;

  select count(*) into n
  from pg_constraint
  where conrelid = 'public.menu_courses'::regclass
    and conname = 'menu_courses_sizes_max_2';
  if n <> 0 then
    raise exception 'the old 2-size constraint is still present';
  end if;
end $$;
