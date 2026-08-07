-- ============================================================================
-- Aromati Café & Wine Bar — CMS schema + row level security
-- Phase 2. Written to be reviewed, not yet applied: no Supabase project exists.
--
-- Security model, in one sentence: every content table is world-readable and
-- writable only by accounts listed in admin_users, which is itself unwritable
-- through the API.
--
-- Times are wall-clock in America/New_York. The site already resolves "now" in
-- that zone; none of the opening-hours columns are timezone-aware, and that is
-- deliberate — 7:00 am means 7:00 am on the door, not an instant.
--
-- Shapes this schema has to carry, all of them real and all of them already on
-- the site (see memory.md, "Menu item shapes"):
--   1 flat price          2 priced by size      3 one price spanning sizes
--   4 supplementary pours 5 no price at all     6 expandable options
-- Getting these wrong does not raise an error at render time. It silently
-- overflows a CSS grid. That is why several of the rules below are triggers
-- with plain-language messages rather than quiet CHECK constraints.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Owner allowlist + is_owner()
--
-- One account for now: the owner holds a single login and may share it. The
-- allowlist still exists because it costs nothing and makes a second account an
-- INSERT rather than a migration. There is deliberately no audit trail — see
-- memory.md, "What's still open", item 3, before adding a second account.
--
-- The owner account does not exist yet, so its UUID cannot be written here.
-- Until the follow-up at the bottom of this file is done, is_owner() returns
-- false for everyone and every write is denied. That is the intended
-- fail-closed default, not a broken state.
-- ----------------------------------------------------------------------------

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Deliberately NO policies on this table. RLS on with no policy means anon and
-- authenticated both get zero rows and zero writes through PostgREST. Only the
-- service role and the SQL editor can touch it, so an editor who is logged in
-- cannot promote a second account through the app.

-- security definer so it can read admin_users despite that table's RLS.
-- search_path is pinned to defeat search_path-hijack attacks: without it, a
-- caller could create their own admin_users in a schema earlier on the path.
create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_owner() from public;
grant  execute on function public.is_owner() to authenticated;
-- Note: authenticated only, never anon. Uptown granted anon as well and needed
-- a second migration to take it back. There is no reason to let a logged-out
-- visitor ask whether it is the owner, and the answer is always false anyway.


-- ----------------------------------------------------------------------------
-- 1. Shared helpers
-- ----------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Used by site_settings and site_copy, where the row is a fixed slot defined by
-- the site's markup and only its value is content. RLS grants UPDATE on a row,
-- not on a column, so without this an editor could rename a field's label or
-- move its position. The editor never offers that; this makes it impossible
-- rather than merely unavailable.
create function public.only_value_may_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.key <> old.key then
    raise exception 'The field "%" cannot be renamed or moved. Only its text can be edited.', old.key;
  end if;
  new.label      = old.label;
  new.help       = old.help;
  new.sort_order = old.sort_order;
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. site_settings — contact details
--
-- One row per key rather than one wide row: it makes the editor a flat list of
-- labelled fields, and adding a setting is an INSERT in a migration rather than
-- a column change.
--
-- Everything is stored in the smallest form every display can be derived from,
-- never in a display form. The phone is ten digits because the site needs
-- "+1 (332) 207-3847" in the footer, "+13322073847" in an href and
-- "+1-332-207-3847" in the JSON-LD — deriving three formats from one value is
-- the only way they cannot drift apart. It appeared 24 times before Phase 1.
--
-- is_editable marks the rows the owner sees. The others (schema_type, cuisine)
-- are structured data about the business that happens to live with the address
-- it describes; they are not prose and the owner has no reason to touch them.
-- ----------------------------------------------------------------------------

create table public.site_settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label       text not null,          -- the owner's words, never the column name
  help        text,                   -- one-line hint under the field
  value       text not null default '',
  is_editable boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index site_settings_sort_idx on public.site_settings (sort_order, id);

create trigger site_settings_touch
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

create trigger site_settings_value_only
  before update on public.site_settings
  for each row execute function public.only_value_may_change();

-- Per-key format rules. A CHECK cannot do this — the rule depends on the key in
-- the same row, and the messages need to be readable by someone who is not a
-- developer. Every message says what is wrong and what good looks like.
create function public.check_setting_format()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text := btrim(new.value);
begin
  if new.key = 'phone_digits' and v !~ '^[0-9]{10}$' then
    raise exception 'The phone number needs exactly 10 digits and nothing else — no spaces, brackets or dashes. For (332) 207-3847 enter 3322073847.';
  end if;

  if new.key = 'phone_country' and v !~ '^[0-9]{1,3}$' then
    raise exception 'The country code should be 1 to 3 digits. For the United States enter 1.';
  end if;

  -- Deliberately loose. Strict email regexes reject addresses that work.
  if new.key = 'email' and v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address. It needs an @ and a dot after it, for example info@aromatinyc.com.';
  end if;

  if new.key = 'instagram_handle' then
    if v ~ '^@' then
      raise exception 'Leave the @ off the Instagram handle — enter aromatinyc, not @aromatinyc. The site adds the @ where it shows one.';
    end if;
    if v !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'An Instagram handle can only use letters, numbers, dots and underscores.';
    end if;
  end if;

  -- Delivery links. Loose on purpose: these are whole URLs pasted out of a
  -- browser, and the only thing worth insisting on is that it is a link.
  if new.key ~ '^order_[a-z0-9]+_url$' and length(v) > 0 and v !~ '^https://' then
    raise exception 'An ordering link has to be the whole web address, starting with https:// — paste it from the address bar. To remove the service from the site, clear this field instead.';
  end if;

  if new.key = 'address_region' and v !~ '^[A-Z]{2}$' then
    raise exception 'The state should be its two-letter abbreviation in capitals, for example NY.';
  end if;

  if new.key = 'address_postal' and v !~ '^[0-9]{5}(-[0-9]{4})?$' then
    raise exception 'The ZIP code should be 5 digits, for example 10016.';
  end if;

  -- Every editable field appears on a page, so blank means a page with a hole
  -- in it. The one exception is an ordering link: blank is how the owner says
  -- the café has left that service, and the site removes the link.
  if new.is_editable and length(v) = 0 and new.key !~ '^order_[a-z0-9]+_url$' then
    raise exception 'The field "%" cannot be left empty — it appears on every page.', new.label;
  end if;

  return new;
end;
$$;

create trigger site_settings_format
  before insert or update on public.site_settings
  for each row execute function public.check_setting_format();


-- ----------------------------------------------------------------------------
-- 3. business_hours — the weekly pattern
--
-- Exactly 7 rows. day_of_week uses JavaScript's Date.getDay() numbering
-- (0 = Sunday) so SEED_HOURS[d.getDay()] needs no translation table, and so it
-- maps straight onto the data-days attributes already in the hours table.
--
-- A closed day is a flag, never a missing row. A missing row is
-- indistinguishable from a bug that dropped one, and the old code could not
-- express a closed day at all (script.js had CLOSE = [22,22,22,23,23,23,23]
-- with a single hardcoded 7 am open).
--
-- Overnight hours are NOT supported: closes_at must be after opens_at. A wine
-- bar that starts closing at 1 am would need the open/closed logic reworked,
-- not just this constraint relaxed. Today the latest close is 11 pm.
-- ----------------------------------------------------------------------------

create table public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  day_of_week smallint not null unique check (day_of_week between 0 and 6),
  is_closed   boolean not null default false,
  opens_at    time,
  closes_at   time,
  note        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint business_hours_times_match_state check (
    (is_closed = true  and opens_at is null     and closes_at is null) or
    (is_closed = false and opens_at is not null and closes_at is not null)
  ),

  constraint business_hours_closes_after_opens
    check (is_closed = true or closes_at > opens_at)
);

create index business_hours_day_idx on public.business_hours (day_of_week);

create trigger business_hours_touch
  before update on public.business_hours
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 4. hours_exceptions — one-off dates
--
-- "Closed December 25" is not a weekday pattern, and it is the likeliest thing
-- an owner actually wants to change. Cheap to add now, awkward to retrofit
-- once the editor and the renderer are both assuming seven rows.
--
-- One row per date, overriding business_hours for that date only. Same
-- closed/times rules as the weekly pattern, for the same reasons.
-- ----------------------------------------------------------------------------

create table public.hours_exceptions (
  id         uuid primary key default gen_random_uuid(),
  on_date    date not null unique,
  is_closed  boolean not null default true,
  opens_at   time,
  closes_at  time,
  note       text,                    -- "Christmas Day", "Closing early for a private event"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint hours_exceptions_times_match_state check (
    (is_closed = true  and opens_at is null     and closes_at is null) or
    (is_closed = false and opens_at is not null and closes_at is not null)
  ),

  constraint hours_exceptions_closes_after_opens
    check (is_closed = true or closes_at > opens_at)
);

create index hours_exceptions_date_idx on public.hours_exceptions (on_date);

create trigger hours_exceptions_touch
  before update on public.hours_exceptions
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 5. menu_courses
--
-- There is no menu_pages table, deliberately. One was drafted, with title and
-- lede columns, before anyone checked what site_copy already held — which is
-- food.headline ("The Food Menu"), food.lede, and the same pair for drinks and
-- wine. Two tables owning one string is a bug waiting for them to disagree, and
-- site_copy is the better owner: those strings are already reachable from the
-- same editor panel as every other headline on the site.
--
-- What was left of menu_pages after removing them was a slug and a sort order,
-- which is a column, not a table. Same reasoning that dropped faq.footButton
-- from the copy set in Phase 1.
--
-- Three distinct strings per course, all editable, all different in the real
-- data: course_key is the filter key ("mains"), tab_label is the tab caption
-- ("Khachapuri & Breads") and heading is the visible <h2> ("Main Georgian
-- Dishes"). They are not derivable from each other.
--
-- UNIQUE (page, course_key) is NOT valid — the food page has two sections
-- keyed "breakfast". The surrogate id is the only key; course_key is data.
--
-- sizes is the per-course column header, e.g. ARRAY['Small','Large']. NULL
-- means the course has no size columns. Only the drinks page uses them, twice.
--
-- is_static marks Build Your Own Breakfast: rendered from hardcoded markup,
-- never touched by the editor, but modelled so the renderer keeps its place in
-- the running order. static_id is the DOM hook that markup is found by.
-- ----------------------------------------------------------------------------

create table public.menu_courses (
  id         uuid primary key default gen_random_uuid(),
  page       text not null check (page in ('food', 'drinks', 'wine')),
  course_key text not null check (course_key ~ '^[a-z][a-z0-9-]*$'),
  tab_label  text not null check (length(btrim(tab_label)) > 0),
  heading    text not null check (length(btrim(heading))   > 0),
  sizes      text[],
  is_static  boolean not null default false,
  static_id  text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The price cells are grid-template-columns: repeat(var(--cols), var(--cell)),
  -- and styles.css sizes the cell for up to three columns (the coffee list is
  -- Small/Medium/Large; everything else is Small/Large). A fourth does not
  -- error, it overflows the row and the price lands under the next item.
  --
  -- This was <= 2 until 2026-08-06, when the grid learned to count. A database
  -- created before then is brought here by 20260806000000_sizes_max_3.sql;
  -- that migration is a no-op against a database built from this file.
  constraint menu_courses_sizes_max_3
    check (sizes is null or cardinality(sizes) <= 3),

  -- An empty array is not "no sizes", it is a course whose header row renders
  -- blank. Use NULL.
  constraint menu_courses_sizes_not_empty
    check (sizes is null or cardinality(sizes) > 0),

  -- No blank size labels: they render as an empty column header.
  constraint menu_courses_sizes_named
    check (sizes is null or array_position(sizes, null) is null),

  constraint menu_courses_static_has_id
    check (is_static = false or length(btrim(coalesce(static_id, ''))) > 0)
);

create index menu_courses_page_idx on public.menu_courses (page, sort_order, id);

create trigger menu_courses_touch
  before update on public.menu_courses
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 6. menu_items
--
-- Four mutually exclusive price shapes, one row per item:
--
--   price           a single flat price                     -> "21"
--   prices          jsonb array, index-aligned with the      -> ["4", "5"]
--                   course's sizes, nulls allowed for
--                   "that size isn't poured"
--   price_all_sizes one price spanning every size column     -> "3"
--                   (Espresso: .mi__cell--solo, grid-column 1/-1)
--   no_price        no price shown at all                    -> 2 wine entries
--
-- Prices are TEXT, not numeric, on purpose: numeric would render 3.9 where the
-- posted menu says 3.90, and "21" would become 21.00.
--
-- name is NOT unique. The real menu repeats names across courses.
-- tag is the inline qualifier inside the <h3> — a vintage ("2022"), a volume
-- ("750 ml") or a count ("7 toppings"). One nullable field, not three: it is
-- free text by decision, so the wine list can say "NV" or "2019/2020 blend"
-- without a migration. See memory.md, "Decisions made".
-- ----------------------------------------------------------------------------

create table public.menu_items (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.menu_courses (id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  tag             text,
  description     text,
  price           text,
  prices          jsonb,
  price_all_sizes text,
  no_price        boolean not null default false,
  options_dom_id  text,        -- the .mi--opts[data-opts] hook, e.g. "crepeOpts"
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- exactly one shape, never two, never zero
  constraint menu_items_one_price_shape check (
    num_nonnulls(price, prices, price_all_sizes)
      + (case when no_price then 1 else 0 end) = 1
  ),

  -- prices must be a JSON array. Element types are checked in the trigger
  -- below: a CHECK cannot contain a subquery, and jsonb_array_elements is one.
  constraint menu_items_prices_is_array
    check (prices is null or jsonb_typeof(prices) = 'array')
);

create index menu_items_course_idx on public.menu_items (course_id, sort_order, id);

create trigger menu_items_touch
  before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- Three rules a CHECK constraint cannot express, all three silent at render
-- time rather than loud:
--   1. element types inside prices (needs a subquery)
--   2. prices must line up 1:1 with the course's sizes (crosses tables)
--   3. a size-spanning price is meaningless in a course with no size columns
create function public.check_prices_align()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  course_sizes text[];
  bad_types    integer;
begin
  if new.prices is null and new.price_all_sizes is null then
    return new;
  end if;

  select c.sizes into course_sizes
    from public.menu_courses c where c.id = new.course_id;

  if course_sizes is null or cardinality(course_sizes) = 0 then
    raise exception
      'Item "%" has a price per size, but its section has no size columns. Give the section its sizes, or use a single price instead.',
      new.name;
  end if;

  if new.price_all_sizes is not null then
    return new;             -- one price across whatever the columns are
  end if;

  select count(*) into bad_types
    from jsonb_array_elements(new.prices) e
    where jsonb_typeof(e) not in ('string', 'null');

  if bad_types > 0 then
    raise exception
      'Item "%": every price must be text (for example "3.90") or empty. Numbers are rejected because 3.90 must not render as 3.9.',
      new.name;
  end if;

  if jsonb_array_length(new.prices) <> cardinality(course_sizes) then
    raise exception
      'Item "%" has % prices but its section has % size columns (%). They must match one to one.',
      new.name, jsonb_array_length(new.prices), cardinality(course_sizes),
      array_to_string(course_sizes, ' / ');
  end if;

  return new;
end;
$$;

create trigger menu_items_prices_align
  before insert or update on public.menu_items
  for each row execute function public.check_prices_align();


-- ----------------------------------------------------------------------------
-- 7. menu_item_pours — the "Bottle $60" lines
--
-- A supplementary price alongside the item's own, 0..n per item. Its own table
-- rather than a jsonb column because they are ordered, individually editable,
-- and the editor wants to add and remove them one at a time.
-- ----------------------------------------------------------------------------

create table public.menu_item_pours (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.menu_items (id) on delete cascade,
  label      text not null check (length(btrim(label)) > 0),   -- "Bottle"
  price      text not null check (length(btrim(price)) > 0),   -- "60"
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_item_pours_item_idx on public.menu_item_pours (item_id, sort_order, id);

create trigger menu_item_pours_touch
  before update on public.menu_item_pours
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 8. menu_item_options — the crêpe toppings
--
-- Modelled so Phase 1's data has somewhere to live and nothing is lost on the
-- way into the database. NOT exposed in the editor's first pass: the toppings
-- row is out of scope by decision (memory.md, "Explicitly out of scope"). The
-- table exists so that staying out of scope does not mean being dropped.
-- ----------------------------------------------------------------------------

create table public.menu_item_options (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.menu_items (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),    -- "Nutella"
  price      text not null check (length(btrim(price)) > 0),   -- "2.00"
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_item_options_item_idx on public.menu_item_options (item_id, sort_order, id);

create trigger menu_item_options_touch
  before update on public.menu_item_options
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 9. faq_entries
--
-- The table is created; no rows are seeded. faq.html currently opens with a
-- notice saying its 18 questions are placeholder copy and asking the owner
-- whether to keep the page at all. Until that is answered the content is not
-- transcribed — if the page is cut the work is wasted, if it is rewritten the
-- work is wasted twice. See memory.md, "What's still open", item 1.
--
-- Creating an empty table costs fifteen lines and commits to nothing. is_published
-- lets a question be taken down without being destroyed, which is the difference
-- between an owner editing confidently and an owner editing carefully.
-- ----------------------------------------------------------------------------

create table public.faq_entries (
  id           uuid primary key default gen_random_uuid(),
  question     text not null check (length(btrim(question)) > 0),
  answer       text not null check (length(btrim(answer))   > 0),
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index faq_entries_sort_idx on public.faq_entries (sort_order, id);

create trigger faq_entries_touch
  before update on public.faq_entries
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- 10. site_copy — the 62 editable strings
--
-- One row per [data-copy] hook in the markup. The set of slots is defined by
-- the site, not by the owner: adding one means adding markup to render it,
-- which is a developer change. Owners edit values only, enforced by granting
-- update but not insert or delete.
--
-- The value uses the same two-construct vocabulary the renderer already
-- implements in render.js writeCopy():
--
--   a newline    -> a <br>
--   *asterisks*  -> an <em> run
--
-- Both are built with createElement and textContent, so owner-entered text can
-- never inject markup no matter what it contains. The balance check below is
-- about appearance, not safety: an odd number of asterisks renders one as a
-- stray literal character.
--
-- max_length carries the data-split ceiling. Those headlines are split into
-- per-word spans and animated; past a certain length they wrap into the
-- section below. The limit lives next to the content it constrains rather than
-- hardcoded in the editor, so the two cannot disagree.
-- ----------------------------------------------------------------------------

create table public.site_copy (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique check (key ~ '^[a-zA-Z0-9]+(\.[a-zA-Z0-9_]+)+$'),
  page       text not null check (page in ('index', 'food', 'drinks', 'wine', 'faq')),
  section    text not null,          -- admin grouping, e.g. "The Kitchen"
  label      text not null,          -- the owner's words, never the column name
  help       text,                   -- one-line hint under the field
  value      text not null default '',
  max_length integer check (max_length is null or max_length > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_copy_emphasis_balanced
    check ((length(value) - length(replace(value, '*', ''))) % 2 = 0),

  constraint site_copy_within_max_length
    check (max_length is null or length(value) <= max_length)
);

create index site_copy_section_idx on public.site_copy (page, sort_order, id);

create trigger site_copy_touch
  before update on public.site_copy
  for each row execute function public.touch_updated_at();

create trigger site_copy_value_only
  before update on public.site_copy
  for each row execute function public.only_value_may_change();


-- ----------------------------------------------------------------------------
-- 11. photos
--
-- Keyed by slot — the position in the site that shows the photo — for the same
-- reason site_copy is keyed by hook: the set of places a photo can go is the
-- markup's business, and the owner's job is choosing which photo goes there.
--
-- alt is NOT NULL with a non-empty check. A photo with no alt text is a photo
-- a screen reader announces as nothing at all, and "required later" means
-- "never" once there are twenty rows.
--
-- source_path keeps the pre-crop original so a reframe can be undone. Uptown
-- learned this the hard way and added it in a later migration; it is here from
-- the start.
-- ----------------------------------------------------------------------------

create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  slot        text not null unique check (slot ~ '^[a-zA-Z0-9]+(\.[a-zA-Z0-9_]+)+$'),
  label       text not null,          -- "The hero photograph", for the editor
  storage_path text,                  -- in the site-photos bucket; null = use the built-in
  source_path text,                   -- the uncropped upload, kept for reframing
  alt         text not null default '' ,
  width       integer check (width  is null or width  > 0),
  height      integer check (height is null or height > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- alt is required, but only once there is a photo to describe
  constraint photos_alt_required_with_image
    check (storage_path is null or length(btrim(alt)) > 0),

  -- dimensions travel together or not at all, else aspect-ratio breaks and the
  -- page reflows as the image loads
  constraint photos_dims_complete
    check (num_nonnulls(width, height) <> 1)
);

create index photos_sort_idx on public.photos (sort_order, id);

create trigger photos_touch
  before update on public.photos
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
--
-- The same pattern on every content table:
--   read  -> anyone, signed in or not
--   write -> only accounts listed in admin_users
--
-- admin_users itself has RLS on with no policies at all (section 0).
--
-- Where a table's row set is fixed by the site's markup rather than chosen by
-- the owner, the insert and delete policies are omitted. A missing policy is
-- not an oversight here: with RLS on, no policy means no permission, so those
-- operations fail closed. Each omission is commented where it happens.
-- ============================================================================

alter table public.site_settings      enable row level security;
alter table public.business_hours     enable row level security;
alter table public.hours_exceptions   enable row level security;
alter table public.menu_courses       enable row level security;
alter table public.menu_items         enable row level security;
alter table public.menu_item_pours    enable row level security;
alter table public.menu_item_options  enable row level security;
alter table public.faq_entries        enable row level security;
alter table public.site_copy          enable row level security;
alter table public.photos             enable row level security;


-- ---- site_settings ---------------------------------------------------------
create policy "site_settings public read"
  on public.site_settings for select to anon, authenticated using (true);

create policy "site_settings owner update"
  on public.site_settings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- No insert or delete: the set of settings is defined by what the site renders.


-- ---- business_hours --------------------------------------------------------
create policy "business_hours public read"
  on public.business_hours for select to anon, authenticated using (true);

create policy "business_hours owner update"
  on public.business_hours for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- No insert or delete: there are seven weekdays and there will continue to be
-- seven weekdays. To close a day you set is_closed. Deleting a row would leave
-- the renderer with a gap it cannot tell apart from a bug.


-- ---- hours_exceptions ------------------------------------------------------
create policy "hours_exceptions public read"
  on public.hours_exceptions for select to anon, authenticated using (true);

create policy "hours_exceptions owner insert"
  on public.hours_exceptions for insert to authenticated with check (public.is_owner());

create policy "hours_exceptions owner update"
  on public.hours_exceptions for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "hours_exceptions owner delete"
  on public.hours_exceptions for delete to authenticated using (public.is_owner());

-- Full CRUD here, unlike business_hours: holidays genuinely come and go.


-- ---- menu_courses ----------------------------------------------------------
create policy "menu_courses public read"
  on public.menu_courses for select to anon, authenticated using (true);

create policy "menu_courses owner insert"
  on public.menu_courses for insert to authenticated with check (public.is_owner());

create policy "menu_courses owner update"
  on public.menu_courses for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "menu_courses owner delete"
  on public.menu_courses for delete to authenticated using (public.is_owner());


-- ---- menu_items ------------------------------------------------------------
create policy "menu_items public read"
  on public.menu_items for select to anon, authenticated using (true);

create policy "menu_items owner insert"
  on public.menu_items for insert to authenticated with check (public.is_owner());

create policy "menu_items owner update"
  on public.menu_items for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "menu_items owner delete"
  on public.menu_items for delete to authenticated using (public.is_owner());


-- ---- menu_item_pours -------------------------------------------------------
create policy "menu_item_pours public read"
  on public.menu_item_pours for select to anon, authenticated using (true);

create policy "menu_item_pours owner insert"
  on public.menu_item_pours for insert to authenticated with check (public.is_owner());

create policy "menu_item_pours owner update"
  on public.menu_item_pours for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "menu_item_pours owner delete"
  on public.menu_item_pours for delete to authenticated using (public.is_owner());


-- ---- menu_item_options -----------------------------------------------------
create policy "menu_item_options public read"
  on public.menu_item_options for select to anon, authenticated using (true);

create policy "menu_item_options owner insert"
  on public.menu_item_options for insert to authenticated with check (public.is_owner());

create policy "menu_item_options owner update"
  on public.menu_item_options for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "menu_item_options owner delete"
  on public.menu_item_options for delete to authenticated using (public.is_owner());


-- ---- faq_entries -----------------------------------------------------------
create policy "faq_entries public read"
  on public.faq_entries for select to anon, authenticated using (true);

create policy "faq_entries owner insert"
  on public.faq_entries for insert to authenticated with check (public.is_owner());

create policy "faq_entries owner update"
  on public.faq_entries for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "faq_entries owner delete"
  on public.faq_entries for delete to authenticated using (public.is_owner());

-- Note: unpublished entries are readable by anyone. is_published controls what
-- the site renders, not who can see the row. Hiding a draft answer from the
-- public would need the read policy narrowed to
--   using (is_published or public.is_owner())
-- which is a real option if drafts ever hold anything sensitive. Today they
-- would hold placeholder café copy, and a narrower policy costs the ability to
-- preview an unpublished answer on the live site.


-- ---- site_copy -------------------------------------------------------------
create policy "site_copy public read"
  on public.site_copy for select to anon, authenticated using (true);

create policy "site_copy owner update"
  on public.site_copy for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- No insert or delete: one row per [data-copy] hook in the markup.


-- ---- photos ----------------------------------------------------------------
create policy "photos public read"
  on public.photos for select to anon, authenticated using (true);

create policy "photos owner update"
  on public.photos for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- No insert or delete: one row per photo slot in the markup. Changing the
-- picture is an update to storage_path; removing the slot is a markup change.


-- ============================================================================
-- GRANTS
--
-- Supabase's defaults usually cover these. Stated explicitly so the table-level
-- privileges are auditable rather than assumed — a grant nobody wrote down is a
-- grant nobody reviews. RLS still gates everything above; these two layers have
-- to agree before a write happens.
-- ============================================================================

grant select on
  public.site_settings, public.business_hours, public.hours_exceptions,
  public.menu_courses, public.menu_items,
  public.menu_item_pours, public.menu_item_options,
  public.faq_entries, public.site_copy, public.photos
  to anon, authenticated;

-- Tables whose rows the owner may create and destroy
grant insert, update, delete on
  public.hours_exceptions, public.menu_courses, public.menu_items,
  public.menu_item_pours, public.menu_item_options, public.faq_entries
  to authenticated;

-- Tables whose row set is fixed: values change, rows do not
grant update on
  public.site_settings, public.business_hours,
  public.site_copy, public.photos
  to authenticated;

-- The allowlist is not reachable through the API at all.
revoke all on public.admin_users from anon, authenticated;


-- ============================================================================
-- SEED — hours and contact details, verbatim from the Phase 1 seed files.
--
-- Only the values that are small, stable and already verified go here: seven
-- rows of hours and twelve settings, all of them checkable at a glance.
--
-- The menus (84 items), the copy (62 fields) and the photos are NOT seeded
-- here. They get a generated migration in Phase 3, written by a tool that reads
-- data/seed-*.js — hand-copying them is exactly the transcription risk Phase 1
-- spent an extractor to remove, and doing it here would reintroduce it at the
-- last possible moment. The copy also needs a plain-language label for each of
-- its 62 fields, and those are editorial, not derivable from the key.
-- ============================================================================

-- Sun–Tue close at 10 pm, Wed–Sat at 11 pm; 7 am every day. Sunday sorts last
-- for display, matching the footer's "Sun – Tue" grouping being derived rather
-- than stored.
insert into public.business_hours (day_of_week, is_closed, opens_at, closes_at, sort_order) values
  (1, false, '07:00', '22:00', 1),   -- Monday
  (2, false, '07:00', '22:00', 2),   -- Tuesday
  (3, false, '07:00', '23:00', 3),   -- Wednesday
  (4, false, '07:00', '23:00', 4),   -- Thursday
  (5, false, '07:00', '23:00', 5),   -- Friday
  (6, false, '07:00', '23:00', 6),   -- Saturday
  (0, false, '07:00', '22:00', 7);   -- Sunday

insert into public.site_settings (key, label, help, value, is_editable, sort_order) values
  ('phone_digits',     'Phone number',      'Ten digits, no country code, no punctuation. The site formats it for display, for the tel: link and for Google.', '3322073847', true,  10),
  ('phone_country',    'Country code',      'Digits only. 1 for the United States.',                         '1',                    true,  11),
  ('email',            'Email address',     'Shown in the footer and given to Google.',                      'info@aromatinyc.com',  true,  12),
  ('instagram_handle', 'Instagram handle',  'Without the @. The site builds both the @name and the link.',   'aromatinyc',           true,  13),

  ('order_doordash_url', 'DoorDash link',   'The whole web address of the DoorDash page, pasted from the address bar. Clear this field to take DoorDash off the site.', 'https://www.doordash.com/store/aromati-caf%C3%A9-&-wine-bar-103-e-34th-st-new-york-40842579/97188347/', true, 14),
  ('order_grubhub_url',  'Grubhub link',    'The whole web address of the Grubhub page, pasted from the address bar. Clear this field to take Grubhub off the site.',   'https://www.grubhub.com/restaurant/aromati-103-east-34th-street-new-york/13363936', true, 15),

  ('address_street',   'Street address',    null,                                                            '103 E 34th Street',    true,  20),
  ('address_locality', 'City',              null,                                                            'New York',             true,  21),
  ('address_region',   'State',             'Two letters, capitals.',                                        'NY',                   true,  22),
  ('address_postal',   'ZIP code',          null,                                                            '10016',                true,  23),
  ('address_country',  'Country',           'Two-letter country code.',                                      'US',                   true,  24),

  ('business_name',    'Business name',     'As it should appear in search results.',                        'Aromati Café & Wine Bar', true, 30),
  ('cuisine',          'Cuisine',           'Given to Google. One word is usually right.',                   'Georgian',             true,  31),
  ('schema_type',      'Search listing type', 'Structured-data category. Changing this affects how Google files the business; leave it alone unless you know why.', 'CafeOrCoffeeShop', false, 32);


-- ============================================================================
-- FOLLOW-UP — required, and deliberately NOT part of this SQL
--
-- 1. Create the single owner account: Dashboard -> Authentication -> Users ->
--    Add user. Then allowlist it:
--
--       insert into public.admin_users (user_id, label)
--       values ('<the-new-user-uuid>', 'Aromati — owner');
--
--    Until this row exists, is_owner() returns false for everyone and every
--    write is denied. That is the intended default, not a fault.
--
-- 2. Disable public signup: Dashboard -> Authentication -> Providers -> Email
--    -> turn OFF "Enable signups", and confirm no other provider is on.
--
--    THIS IS A DASHBOARD SETTING, NOT SQL, and it is the one that matters most.
--    RLS does not stop signUp() from creating accounts — it only stops those
--    accounts from writing anything. Without this, anyone can make themselves
--    an account on this project; they just cannot do anything with it. Both
--    controls are needed and neither substitutes for the other.
--
-- 3. Run the Supabase security advisor and fix what it flags in its own
--    migration, with the reasoning written into the file.
-- ============================================================================
