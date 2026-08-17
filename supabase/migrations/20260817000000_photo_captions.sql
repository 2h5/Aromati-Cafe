-- ============================================================================
-- The words over the Kitchen strip photographs
--
-- Each plate in the home page's scrolling Kitchen strip carries a short line
-- of text — "Khinkali", "Honey Cake" — in a <figcaption>. Until now those
-- words lived only in the markup, so the one part of a photograph the owner
-- could not change from the editor was its caption.
--
-- This adds a caption column and fills it with the words already on the page,
-- so the editor opens showing what visitors actually read rather than nine
-- empty boxes — the same choice the photos migration made for descriptions.
--
-- Only the Kitchen strip has captions today. Every other slot keeps NULL,
-- which means "this photograph has no words on it", and the build step
-- (tools/bake-photos.mjs) only rewrites a <figcaption> a caption exists for.
-- ============================================================================

alter table public.photos
  add column if not exists caption text;

comment on column public.photos.caption is
  'The short line of text shown over the photograph where the page displays one — today only the Kitchen strip. NULL means the words committed in the markup.';


-- The words already on the page, so the editor opens showing the truth.
-- These are written for existing projects (the original seed used ON CONFLICT
-- DO NOTHING, which never touches a row that is already there).

update public.photos set caption = 'Adjaruli Khachapuri'  where slot = 'kitchen.plate1';
update public.photos set caption = 'Khinkali'             where slot = 'kitchen.plate2';
update public.photos set caption = 'Imeruli Khachapuri'   where slot = 'kitchen.plate3';
update public.photos set caption = 'Eggplant Rolls'       where slot = 'kitchen.plate4';
update public.photos set caption = 'Assorted Pkhali'      where slot = 'kitchen.plate5';
update public.photos set caption = 'Shoti’s Puri & Ajika' where slot = 'kitchen.plate6';
update public.photos set caption = 'Tolma'                where slot = 'kitchen.plate7';
update public.photos set caption = 'The Georgian Salad'   where slot = 'kitchen.plate8';
update public.photos set caption = 'Honey Cake'           where slot = 'kitchen.plate9';


-- All nine plates, and only they, should carry a caption now. A guard rather
-- than a hope: if the slots were renamed someday, this says so here instead of
-- the strip going quietly uncaptioned.

do $$
declare n integer;
begin
  select count(*) into n from public.photos
    where slot like 'kitchen.plate%' and caption is not null;
  if n <> 9 then
    raise exception 'photos: expected 9 kitchen plates with a caption, found %', n;
  end if;
end $$;
