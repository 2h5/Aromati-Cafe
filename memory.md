# memory.md — Aromati CMS build

Persistent build plan and status for the Aromati Café & Wine Bar CMS.

**How to use this file.** Read it at the start of every session before touching
code. It holds the settled decisions, the content inventory, the phase plan and
the running status. When a decision gets made, write it into *Decisions made*
below. When the plan changes, write it into *Deviations from the plan* — do not
silently edit a phase to match what actually happened.

Modelled directly on the Uptown Coffee Co. CMS build (`Z:\cs lock\uptown
coffee - kimi`), which is the reference implementation for this project. Where
something here says "same as Uptown", that means: go read that code and port
the decision, don't re-derive it.

---

## Current phase / status

**Phase 1 — in progress**, on branch `phase1-content-as-data`.

Done — **the three menu pages now render from data, verified identical**:
- `tools/extract-menus.mjs` — strict markup→data extractor
- `data/seed-menu.js` — 84 items, 17 courses, all six price shapes
- `data/seed-hours.js`, `data/seed-settings.js` — written, not yet consumed
- `render.js` — builds the boards; `createElement`/`textContent` only
- `tools/strip-menu-markup.mjs` — removed the now-generated markup
- `tools/verify-phase1.mjs` — jsdom harness; runs the real renderer and diffs
  the board's visible text and class counts against commit `68ac715`
- `styles.css` — `$` now rendered for `.mi__pours b` / `.mi__opts li b`, and
  `.mi__cell--none` for a size an item is not offered in
- menu pages: 1245 lines → 739

Also done — **hours and contact details are single-source across all five
pages**:
- `render.js` writes the hours to all five consumers and the contact details
  wherever they appear, found by what the elements already are
  (`a[href^="tel:"]`, `.mmenu__hours`, `#hoursList`, the JSON-LD block) rather
  than by hooks. Only the footer's two anonymous `<p>`s needed marking.
- `script.js` reads `SEED_HOURS` instead of its own copy of the numbers, and
  now handles closed days — which the old one-opening-time/per-day-closing-array
  model could not express at all.
- `tools/test-hours.mjs` — behaviour tests for what is genuinely new: run
  grouping, closed days, the JSON-LD output, and the pill at its boundaries
  (opening minute, closing minute, last hour, closed-today rollover).

Also done — **all 62 section-copy fields come from one place**:
- `data/seed-copy.js` — every headline, lede, label, note and button word
  across the five pages, keyed `section.field`
- `tools/extract-copy.mjs` — reads the copy out of the markup *and* stamps the
  matching `data-copy="…"` onto the element it read from, in one pass, so the
  two sides cannot disagree. Idempotent; re-run it after editing the markup.
- `render.js` — `renderCopy()` / `writeCopy()`. Inline vocabulary is exactly
  two constructs: `"\n"` is a line break, `*word*` is emphasis. Both built with
  `createElement`.
- `tools/test-copy.mjs` — the vocabulary, the omitted-field fallback, and the
  XSS property

Also done — **a failure in one `script.js` block no longer kills the rest**.
Seven self-contained blocks run through `boot()`, the same shape as
`render.js`'s `step()`. Partial by design: see *Deviations*.

Also done — **`vite.config.js`**, which did not exist. `npm run build` was
producing a one-page site with no JavaScript at all. See *Deviations*.

### The four harnesses, and what each is for

`npm test` runs all four.

- `tools/verify-phase1.mjs` — all five pages, whole-body, running the real
  renderer, diffed against `53b3d5e` (pre-conversion). Proves nothing changed.
  `PHASE1_BASE` overrides the comparison commit.
- `tools/test-hours.mjs` — run grouping, closed days, the JSON-LD output, and
  the pill at its boundaries.
- `tools/test-copy.mjs` — the inline vocabulary, what happens to a field the
  data omits, and the property the whole design exists for: owner input is
  text, never markup.
- `tools/test-guards.mjs` — breaks each guarded block in turn and checks the
  last statement in `script.js` still runs.

The last three exist because verify-phase1 asserts the output is *unchanged*,
which is exactly the wrong test for a code path that never existed.

**Drift check.** The hours, phone, address, Instagram handle and all 62 copy
fields are still written in the markup as well as generated, on purpose: a
crawler or a reader with no JavaScript must still get them from the served
HTML. The cost is that those copies can drift from the seed data with nothing
looking wrong — the site right, the source lying. verify-phase1 therefore also
asserts that the page *as served* already says what the renderer would make it
say. Confirmed to fail when the two are made to disagree. **This reverses in
Phase 4** — see *What's still open*, item 2.

**Still to check in a real browser** (jsdom does not run the choreography): the
entrance cascade, the tab filter's height-lock and scroll correction, and
Build Your Own.

Remaining in Phase 1: the nav/mobile-menu/footer **markup** dedupe — deferred
because the chrome is more per-page bespoke than assumed (index has four footer
columns, faq five, the menu pages a `footer--menu` variant), and the *values*
problem is now solved without it. `seed-faq.js` is held back — see *What's
still open*, item 1. Everything else in Phase 1 is done.

No Supabase project exists yet. Phases 1 and 2 are deliberately ordered so that
all of the hard, high-value work happens *before* a database is needed.

---

## Goal

The owner can change everything on the site that changes in real life —
hours, contact details, the full menu across all three menu pages, the FAQ, the
section copy and the photographs — without a developer.

The site must stay exactly as fast, as animated and as good-looking as it is
today, and it must keep working if the database is down, deleted or unpaid.

---

## Scope

### In scope

| Content | Where it is today | Volume |
|---|---|---|
| Business hours | 5 places (see inventory) | 7 days |
| Phone number | 24 occurrences | 1 value |
| Email | footer, JSON-LD | 1 value |
| Instagram handle + URL | 17 occurrences | 1 value |
| Street address | footer, mobile menu, JSON-LD, Visit | 1 value |
| Food menu | `menu-food.html` | 25 items, 7 courses |
| Drinks menu | `menu-drinks.html` | 28 items, 4 courses |
| Wine menu | `menu-wine.html` | 31 items, 6 courses |
| FAQ | `faq.html` | 18 entries |
| Section copy (headings, ledes, labels) | all 5 pages | ~40 fields |
| Photographs | `assets/web/` | 27 in use |

### Explicitly out of scope — do not build, do not break

- **Build Your Own Breakfast** (`#build`, [script.js:630](script.js#L630)).
  Stays hardcoded exactly as it is. Its chips carry `data-price` / `data-name`
  and it has its own bagel sub-field and hint map; making it editable is a
  content type of its own and the owner has not asked for it. **The Phase 1
  conversion must leave this section untouched and still working.**
- **The crêpe options row** (`.mi--opts`, `#crepeOpts`) — see Constraints. It
  is modelled in the schema so it survives the conversion, but the editor does
  not expose it in the first pass.
- **Reservations.** [script.js:731](script.js#L731) is a deliberate placeholder.
  Leave it.
- **The `MARKS`-style annotation system** — Aromati has no equivalent. N/A.
- **Studio credit strip.** Hardcoded, ours, not the owner's to edit.

---

## Constraints — build to these, do not re-derive or re-litigate

### Workflow

- **Plain ES5, one IIFE per file, no build step, no framework.** This is the
  existing house style in [script.js](script.js) (`var`, function expressions,
  `═══` section banners) and it is also Uptown's. The CMS must not look bolted
  on.
- **No ES modules.** `import` does not work over `file://` and the public site
  must keep working when opened directly from disk.
- The public site keeps working from `file://` through the end of Phase 1.
  From Phase 4 the *live data path* needs an HTTP origin, but the seed
  fallback must still render a complete, correct site from `file://`. This is
  the local-development story and it is not optional.
- **The public site never loads the Supabase SDK.** It uses plain `fetch`
  against the REST endpoint. Only `admin.html` loads the SDK, and it loads it
  from `vendor/`, never a CDN. (Same as Uptown, same reason: the one page that
  holds owner credentials has no third-party script in it.)

### Data modelling

- **No table uses `name` as a key.** Duplicate names already exist in the live
  data — `Mtsvane` appears twice in the wine list at different vintages
  (`menu-wine.html:223` and `:238`), `Rkatsiteli` appears as both a qvevri
  white and a 2023. Surrogate `uuid` primary keys everywhere.
- **Every table has an explicit `sort_order`.** Postgres guarantees no
  ordering without it. The menu's printed order is meaningful.
- **Prices are `text`, never `numeric`.** `7.50` must not render as `7.5`, and
  `21` must not render as `21.00`. The live menu mixes both forms deliberately.
- **Prices are stored bare, without the `$`.** [styles.css:904](styles.css#L904)
  and [styles.css:944](styles.css#L944) add the `$` via `::before`. Today
  `.mi__pours` and `.mi__opts` contradict this and carry a literal `$` in the
  markup — **normalise those to bare numbers during Phase 1** so there is one
  rule, and let CSS render the symbol everywhere.
- **Six price shapes, one row per item** (see the shape table in the inventory).
  Not a separate prices table.
- **A course belongs to a page.** `data-course` is not unique across pages, and
  on `menu-food.html` two sections share `data-course="breakfast"` (the
  Breakfast course and the Build-Your-Own block). The tab filter reads it. The
  schema keys on `(page, course_key)`, not `course_key` alone.

### Design integrity

- **`data-split` headlines need a length ceiling, enforced in the editor.**
  [script.js:28](script.js#L28) chops these into individual words for the
  staggered entrance, and the whole opening choreography at
  [script.js:79](script.js#L79) is timed around them. A 40-word headline does
  not error — it silently wrecks the animation. This is the same class of check
  as Uptown's WCAG contrast validation: catch a *design* violation at edit time,
  in plain language. There are 6 such headlines on `index.html` and 1 per inner
  page.
- **`alt` text is required on every photo.** Same as Uptown. A photo with no
  description blocks the save with a plain-language message.
- **Nothing waits on the network to render.** Boot renders from
  cache-or-seed *synchronously*, then folds in fresh data only if it differs.
  Aromati needs this more than Uptown did: the entrance choreography, the
  reveal observers, the parallax and the menu tab cascade all need real DOM to
  exist before they run.
- **The menu tab cascade must be replayable.** [script.js:387](script.js#L387)
  through [script.js:614](script.js#L614) handles filtering, height-locking and
  scroll-position correction, and it is written around a masthead that is
  mid-entrance. When fresh data replaces the rendered menu, the cascade has to
  re-run against the new DOM without double-animating or losing scroll
  position. Uptown hit this once and solved it (commit *"Replay the intro
  cascade over rebuilt content"*). Aromati hits it on three menu pages.
- **Fallback chain: `network → localStorage → SEED_* arrays`.** The seed
  arrays are the site as it shipped. They are the floor, not dead weight. Never
  delete them; refresh them from live data at each release.
- **Every init step individually error-guarded.** Today one throw kills
  everything after it in the IIFE. Wrap each `(function () { … })()` block so a
  failure in the menu render cannot take out the hours, the nav or the reveals.

### Security

Full treatment in the Security section below. The non-negotiables:

- RLS write policies scoped to a **specific allowlisted `auth.uid()`**, never
  "any authenticated user".
- **Public signup disabled** in Supabase Auth → Providers. A dashboard setting;
  RLS does not stop account creation.
- Storage buckets carry `file_size_limit` and `allowed_mime_types` **at the
  bucket level**, not only in a policy.
- `is_owner()` is `SECURITY DEFINER` with `set search_path = ''`, and
  `execute` is revoked from `anon`.
- **CMS content is never written with `innerHTML`.** `textContent` and
  `createElement` only.

---

## Content inventory — where everything is hardcoded today

This section is the map Phase 1 works from. Verify it before relying on it; it
was taken at plan time and the site may have moved.

### Hours — 5 places, not 3

1. **`script.js:755–756`** — the live open/closed logic.
   ```js
   var OPEN  = 7 * 60;                          // 7:00 am, every day
   var CLOSE = [22, 22, 22, 23, 23, 23, 23];    // by day, Sun → Sat
   ```
   Note this model **cannot express a closed day** and assumes one opening time
   for all seven. The schema generalises it; the renderer must handle a closed
   day, and `CLOSE[NaN]` must not be reachable.
2. **`index.html:393–403`** — the Visit hours table, with `data-days="0,1,2"` /
   `data-days="3,4,5,6"` driving the "today" highlight. Day *grouping* is
   presentational and must be derived from the per-day data, not stored.
3. **Footer prose**, all 5 pages — `Sun – Tue  7:00 am – 10:00 pm` …
4. **Mobile menu prose**, all 5 pages — `Sun–Tue 7am–10pm · Wed–Sat 7am–11pm`
   (a *different* format from the footer — both must be generated).
5. **JSON-LD `openingHoursSpecification`**, on 4 pages (`index`, `menu-food`,
   `menu-drinks`, `menu-wine` — **not** `faq.html`). This is what Google reads.

There is also `index.html:405`, a free-text `hours__note` ("Mornings for
coffee, evenings for wine.") — editable copy, not hours data.

### Contact details

| Value | Occurrences | Notes |
|---|---|---|
| `+1 (332) 207-3847` / `tel:+13322073847` | 24 | display and `tel:` forms differ — store digits, generate both |
| `info@aromatiNY.com` | footer + JSON-LD | mixed case is intentional |
| `instagram.com/aromatinyc` | 17 | URL and `@aromatinyc` handle |
| Instagram SVG | 16 inline copies | markup, not content — dedupe in Phase 1 |
| `103 E 34th Street, New York, NY 10016` | footer, mobile menu, JSON-LD, Visit | |

### Menu item shapes — six, all real, all in use

| # | Shape | Markup today | Example |
|---|---|---|---|
| 1 | Flat price | `.mi__price` | Morning Plate — `21` |
| 2 | Priced by size | `.course--sized` + `.course__sizes` header, `.mi__cells` > 2 × `.mi__cell` | Drip Coffee — `4` / `5` |
| 3 | Size-spanning single | `.mi__cell--solo` (`grid-column: 1/-1`) | Espresso — `3` across both columns |
| 4 | Supplementary pours | `.mi__pours` alongside a flat price | Pirosmani White — glass `15`, `Bottle $60` |
| 5 | No price | `.mi--noprice` | 2 items on `menu-wine.html` |
| 6 | Expandable options | `.mi--opts[data-opts]` + `.mi__opts` | Aromati's Crêpe — `5` + 7 toppings |

Plus an orthogonal modifier: **`.mi__tag`** — an inline qualifier inside the
`<h3>`, used 11 times for vintages (`2022`), volumes (`750 ml`) and counts
(`7 toppings`). Not a separate shape; a nullable field on every item.

Sizes are declared **per course**, not per item (`.course__sizes` is a column
header). Only `menu-drinks.html` uses them, twice, both `Small` / `Large`.

### Courses

Each `<section class="course">` carries `data-course` (the filter key) and
`data-label` (the tab caption), and these **differ from the visible `<h2>`** —
e.g. `data-label="Khachapuri & Breads"` on a section headed *"Main Georgian
Dishes"*. Three distinct strings per course; all three are editable content.
`.course__count` is computed at runtime, not stored. One section carries
`data-full` (Build Your Own) — out of scope, but the renderer must preserve it.

### FAQ

18 `<details class="faq">` on `faq.html`, each a `.faq__q` summary and a
`.faq__a` paragraph. The page also opens with a **demo-content notice**
(`.notice`) saying the copy is placeholder and asking the owner whether to keep
the page — resolve that with the owner before building the FAQ panel.

### Copy

- 7 distinct `.section-head__label` values (`The Idea`, `The Kitchen`, …)
- 6 `data-split` headlines on `index.html`, 1 per inner page (**length-capped**)
- Ledes, story paragraphs, `.mhead__lede` on each inner page, `.carte__foot`
- `.hours__note`, `.wine__hours` ("Second floor · wine bar")

### Photographs

27 distinct `assets/` paths referenced across the 5 pages. `assets/web/` holds
hand-optimised `.jpg`; two `-outpainted.png` files are wider crops. Note the
source `assets/*-enhanced.png` originals are large and are *not* what the site
loads — do not point the CMS at them.

---

## Schema sketch

Not final. Phase 2 writes the real migration; this is the shape to write
toward. Every table gets `id uuid primary key default gen_random_uuid()`,
`sort_order integer not null default 0`, `created_at`, `updated_at` + a
`touch_updated_at()` trigger — same as Uptown.

```
admin_users          user_id uuid PK → auth.users, note text
                     (the allowlist. is_owner() reads this.)

site_settings        key text PK, value text
                     phone_digits, email, instagram_handle,
                     address_street, address_locality, address_region,
                     address_postal
                     (single-row-per-key. Simpler than one wide row and it
                     makes the editor a flat list of labelled fields.)

business_hours       day_of_week int 0–6 UNIQUE, closed bool,
                     opens time, closes time, note text
                     (7 rows, always. Closed days are a flag, not a missing
                     row — a missing row is indistinguishable from a bug.)

menu_pages           slug text UNIQUE ('food'|'drinks'|'wine'),
                     title, lede, masthead_photo_id
                     (fixed set; the editor does not create or delete these.)

menu_courses         page_id → menu_pages, course_key text, tab_label text,
                     heading text, sizes text[] NULL, is_static bool
                     UNIQUE (page_id, course_key) is NOT valid — food has two
                     sections keyed "breakfast". Key on id; course_key is data.
                     is_static marks Build-Your-Own: rendered from hardcoded
                     markup, never touched by the editor.
                     constraint: cardinality(sizes) <= 2   ← CSS grid is
                     repeat(2, var(--cell)); three sizes overflow it silently.

menu_items           course_id → menu_courses, name, tag text, desc text,
                     price text, prices jsonb, price_note text, no_price bool,
                     photo_id
                     constraint: exactly one of (price, prices, price_note)
                       is non-null, OR no_price is true and all three are null
                     constraint: prices is null or jsonb_typeof = 'array'
                     trigger:    prices length == course.sizes length, and
                                 every element is string-or-null
                                 (a CHECK cannot express either — same
                                 reasoning and same trigger shape as Uptown's
                                 check_prices_align())

menu_item_pours      item_id → menu_items, label text, price text
                     (the Bottle $60 lines. Ordered, 0..n per item.)

menu_item_options    item_id → menu_items, name text, price text
                     (the crêpe toppings. Modelled so Phase 1 does not lose
                     them; not exposed in the editor's first pass.)

faq_entries          question text, answer text, published bool

site_copy            page text, section text, key text, value text,
                     max_length int NULL
                     UNIQUE (page, section, key)
                     max_length is how the data-split ceiling is enforced —
                     stored next to the field, so the rule lives with the
                     content rather than hardcoded in the editor.

photos               bucket_path text, alt text NOT NULL, width int,
                     height int, source_path text
                     (source_path keeps the pre-crop original so a reframe can
                     be undone — Uptown learned this the hard way in Phase 6b.)
```

**Read policy** on every content table: `to anon using (true)`.
**Write policies**: `to authenticated`, `using (public.is_owner()) with check
(public.is_owner())`, one each for insert / update / delete.

---

## Phases

Phases 1 and 2 need **no Supabase project**. That is deliberate — it is most of
the hard work, and all of it is useful even if the CMS is never finished.

---

### Phase 0 — Plan. ← *you are here*

This document. Also: create the branch, and confirm the scope table above with
the owner (especially the FAQ demo-notice question).

**Done when:** this file is committed and the scope is agreed.

---

### Phase 1 — Content becomes data. **No Supabase.**

The big one. Content moves out of markup into seed arrays, and the pages render
from them.

1. Create `data/` with plain `var SEED_* = […]` files (classic scripts, not
   modules): `seed-menu.js`, `seed-hours.js`, `seed-settings.js`,
   `seed-faq.js`, `seed-copy.js`.
2. Extract all 84 menu items, 18 FAQ entries, 7 days of hours, the contact
   details and the copy fields into them. **Transcription is mechanical and
   must be verified item-by-item against the current pages, not eyeballed.**
3. Write `render.js` — builds the menu boards, the FAQ list, the hours table,
   the footer, the mobile menu and the JSON-LD from the seed data.
4. Strip the now-generated markup out of the 5 HTML pages.
5. Dedupe the nav / mobile menu / footer chrome while it is being generated
   anyway — this is where the 11-edits-to-change-the-hours problem dies.
6. Re-run every consumer of the old hardcoded values: the hours logic
   ([script.js:746](script.js#L746)) reads `SEED_HOURS` and learns to handle
   closed days; the JSON-LD is generated; both prose formats are generated.
7. Error-guard every init block.

**Constraints for this phase:** Build-Your-Own and the crêpe row keep working.
`file://` keeps working. Every animation, filter, height-lock and scroll
correction behaves exactly as it does today.

**Done when:** the site is byte-for-byte visually identical, opens from
`file://`, and no menu item, price, FAQ answer or copy string appears in any
`.html` file.

**Verification:** a diff harness — render the new pages, normalise whitespace,
and compare the visible text content against the current pages. Any difference
is a transcription bug. Do not skip this; 276 hand-copied prices will contain
mistakes.

---

### Phase 2 — Schema + RLS, written and reviewed. **No Supabase.**

Write `supabase/migrations/` as real, ordered, committed SQL. **Do not apply.**
There is nothing to apply it to yet, and that is the point — the SQL gets
reviewed on its merits first.

Deliverables: the migration files, plus a plain-English summary of what every
policy grants and to whom.

**Done when:** the SQL is committed and the policy summary has been read and
agreed.

---

### Phase 3 — Supabase project + apply. **First phase needing the DB.**

Owner/developer tasks, done together:

1. Create the Supabase project (free tier is fine).
2. **Auth → Providers → disable public signup.** Before anything else.
3. Create the single owner account by hand.
4. Apply the migrations.
5. Insert the owner's `auth.uid()` into `admin_users`.
6. Seed the content tables from the Phase 1 seed arrays.
7. Run the Supabase security advisor; fix what it flags, in its own migration
   with the reasoning written into the file (this is exactly what Uptown's
   `20260727000100_restrict_is_owner_to_authenticated.sql` is).

**Done when:** the advisor is clean and a logged-out `curl` can read the menu
but not write it.

---

### Phase 4 — The site reads from Supabase.

`render.js` gains the fallback chain: `network → localStorage → SEED_*`.
Nothing waits on the network. Fresh data folds in afterwards and only if it
differs. The menu cascade replays cleanly over rebuilt content on all three
menu pages.

**Done when:** the site renders correctly with the network killed, with
`localStorage` cleared, and with a deliberately broken Supabase URL.

---

### Phase 5 — The editor.

`admin.html` / `admin.css` / `admin.js`, ported from Uptown's structure —
gate → tabs → panels → savebar. Panels: **Menu** (all three pages), **Hours**,
**Contact**, **Copy**, **FAQ**.

Ported wholesale from Uptown, not re-derived:

- Nothing live until *Save changes*; Discard reverts.
- Labels are the owner's words, never column names.
- Validation reports *problems* in plain language and blocks the save.
- A blocked save opens the collapsed card holding the offending field.
- Panel open/closed state survives a save.
- Long panels collapse by default.

New for Aromati: the `data-split` length ceiling, the six price shapes, and a
menu list (84 items across 3 pages) to need search and per-course collapse.

---

### Phase 6 — Photos.

Bucket + policies, upload widget, client-side resize to webp, HEIC rejected
with a plain-language message, EXIF rotation corrected, `alt` required,
dimensions captured at upload, original kept for re-framing.

---

### Phase 7 — Full test pass.

Work the checklist below. **Report failures; do not silently work around them.**

---

### Phase 8 — Handoff.

Rewrite `README.md` to describe what the project *is* at that point — not what
it was. Write `client-notes.md`: an owner-facing guide in the owner's language.
Refresh the seed arrays from live data.

> ⚠️ Uptown's README still says *"Status: this is the demo build — pre-CMS"* and
> *"no schema, migrations, or storage buckets exist yet"* — seventeen commits
> and eight migrations later. That is the exact failure this phase exists to
> prevent. Doc drift is the thing that makes a handoff dangerous.

---

## Phase 7 test checklist

Ported from Uptown's, plus the Aromati-specific rows.

**Resilience**
- [ ] Kill the network after load, reload — seed data renders, hours still tick
- [ ] Break the Supabase URL — site renders, no console errors visible to a user
- [ ] Delete every item in a course — course renders an empty state, no crash
- [ ] Delete every course on a page — page renders, tabs do not throw
- [ ] Reload 5× — course and item order is stable
- [ ] Open every page from `file://` — complete site from seed

**Hours** (all five consumers must move together)
- [ ] Change hours in the editor → live status, Visit table, footer prose,
      mobile-menu prose and JSON-LD all update
- [ ] Boundary: exactly at opening minute (closed → open), exactly at closing
      minute (open → closed — the logic is `>= open && < close`, so the closing
      minute reads as closed)
- [ ] A day marked **closed** — status text, the "opens tomorrow" rollover from
      the previous day, and the table row
- [ ] Different opening times per day (today's model hardcodes one)

**Menu**
- [ ] Each of the six price shapes renders correctly after a round-trip
- [ ] A sized item with a blank size renders as "not offered", not `$`
- [ ] Three sizes on a course is **rejected** (CSS grid is 2 columns)
- [ ] Tab filter, height-lock and scroll correction behave after a data refresh
- [ ] A course alone on its row still spans and centres
      ([script.js:478](script.js#L478))
- [ ] Build-Your-Own and the crêpe row still work, untouched

**Design integrity**
- [ ] An over-long `data-split` headline is refused with a plain message
- [ ] Long item names / descriptions on the public site — ⚠️ **owner's test**
- [ ] A photo with no alt text blocks the save

**Security** — see the section below for the full list
- [ ] Logged out, attempt to read admin data — blocked
- [ ] Logged out, attempt to write any content table — blocked
- [ ] `signUp()` from the browser console — rejected
- [ ] A second, non-allowlisted account can log in but cannot write anything
- [ ] `<script>alert(1)</script>` as an item name — renders as literal text
- [ ] Upload a 10 MB file — rejected at the bucket, not just in the client
- [ ] Upload a `.exe` renamed `.jpg` — rejected by MIME type

---

## Security

Asked for directly, so here is the honest list. The good news is that the
Uptown model is sound and most of this is "port it correctly". The risks that
remain are mostly *operational*, not architectural.

### The short version, in plain words

For explaining this to anyone who is not going to read the rest of the section
— including the client.

Today the site is a poster in a window: nobody can change it, so there is
nothing to steal. A CMS puts a back office in the building. Six things matter.

1. **Someone types something nasty into the menu.** If owner-typed text is put
   onto the page as *code* rather than as *text*, an item named
   `<script>…</script>` runs in every visitor's browser. Fix: text goes in as
   text, everywhere, no exceptions.
2. **The sign-up sheet left on the counter.** Supabase allows account creation
   by default. Turn it off. Strangers would still be blocked from changing
   anything, but there is no reason to allow the accounts.
3. **The owner's password is the key to the building.** One account can rewrite
   the site. This is how things actually go wrong in the real world — phishing
   or a reused password, not a clever exploit.
4. **Two keys, one public, one secret.** The *publishable* key is like the
   shop's street address: it identifies the project and unlocks nothing. The
   *service_role* key ignores every rule and must never touch the site's code.
5. **The bouncer must be on every door.** Row Level Security is a bouncer per
   table: anyone may read the menu, only the owner may change it. The danger is
   forgetting one table — it looks fine and is wide open. Run Supabase's
   advisor to confirm.
6. **Uploads.** Size and file-type caps must be set on the *server*. A check in
   the upload form is a convenience, not a lock.

### What is actually achievable

Two buckets, and the honest answer differs between them.

- **Decided once, then permanently fine** — items 1, 2, 4, 5, 6 above. Design
  decisions and dashboard toggles. Get them right and they stay right. The
  Uptown audit below is proof this is reachable.
- **Reducible, never eliminable** — item 3, and backups. No code prevents the
  owner being phished, and no hosted database is guaranteed never to have a bad
  day.

So "no security concerns" is not a state that exists. **"Nothing wrong with the
code, and the realistic failures are survivable"** is, and it is the target.

The single biggest safety decision on this project is already made and is not
in the list above: the `network → localStorage → SEED_*` fallback means that if
the database is wiped, hacked or deleted, the site still serves the correct
menu from files in git. Worst case becomes "restore from git, lose the last few
edits" instead of "the client's site is down and the menu is gone".

### Uptown audit — run 2026-08-01

Audited before porting, rather than assuming. **Uptown has no known security
problems in its code.**

| Checked | Result |
|---|---|
| `innerHTML` / `insertAdjacentHTML` in `main.js`, `admin.js` | **Zero** across ~170 KB. `main.js:1565` states the rule in a comment. |
| Third-party resources on the admin page | None. `admin.css`, vendored Supabase SDK, `config.js`, `admin.js` — all local. Fonts self-hosted. |
| Admin page hidden from search engines | `<meta name="robots" content="noindex, nofollow">` present |
| `service_role` / secret key in the repo | Absent; only a comment warning against it |
| JSON-LD built from owner data | Safe — `textContent` assignment, phone digits validated |
| RLS | Bouncer on every table + allowlist + `search_path` pinned + a follow-up migration fixing what the advisor flagged |
| Upload caps | `file_size_limit` + `allowed_mime_types` at bucket level |

**Gaps found — both minor, both to be fixed in Aromati from the start:**

- **No CSP header.** A seatbelt, not a hole. Add to both projects.
- **No `robots.txt`.** The meta tag is the part that matters, so this is
  cosmetic.

**Not verifiable from the repo** (dashboard state, not code): whether public
signup is actually disabled, and whether MFA is on. Uptown's own Phase 5
checklist records `signUp()` being rejected, so it was tested at least once.
For Aromati these are Phase 3 steps with a checklist line each.

### Not a concern

**The publishable key in `config.js` is public by design.** It identifies the
project and grants nothing on its own; what a caller may actually do is decided
server-side by RLS. Shipping it in a `<script>` is its intended use. Uptown's
`config.js` says exactly this and is correct.

**Anon can read all content.** That is a public menu. It is the point.

### Real concerns, in rough order of how likely they are to bite

**1. Stored XSS — the biggest one.**
A CMS means text the owner typed gets rendered into a public page. If any of it
goes in via `innerHTML`, a compromised or careless owner account becomes
persistent script execution on every visitor's browser.

The existing code already uses `innerHTML` in places —
[script.js:30](script.js#L30) (`el.innerHTML = ""`) and the Build-Your-Own
render both do, though currently only to *clear* nodes, which is safe.

> **Rule: CMS-sourced content is written with `textContent` and
> `createElement`, never `innerHTML`, never `insertAdjacentHTML`.** No
> exceptions, including for the FAQ answers, which are the most tempting place
> to allow markup. If emphasis is needed later, add a constrained formatter
> that builds nodes — do not accept HTML.

The JSON-LD block looks like an exception but is not. Write it the way Uptown
does (`main.js:1041`): parse the existing block, mutate the object, and assign
back with `node.textContent = JSON.stringify(data)`. Setting `textContent` on a
`<script>` element does not re-parse HTML, so a `</script>` inside an address
field is stored as literal text and cannot break out. **What would be unsafe is
building the block as an HTML string** — so don't. Same rule as everywhere
else; no special case needed.

**2. Public signup left enabled.**
RLS does **not** stop account creation. If signup is on, anyone can create an
account — they would still fail `is_owner()` and be unable to write, but it is
free defence to turn it off and it keeps the auth table meaningful. This is a
dashboard setting, easy to forget, and invisible in the code. **Phase 3, step 2,
before anything else.**

**3. The owner's password is the whole perimeter.**
One account, one password, and it can rewrite the public site. This is the most
likely real-world compromise — phishing or reuse, not a clever exploit.
Mitigations: a strong unique password, email OTP / MFA if available on the
plan, and the seed arrays in git as a known-good restore point.

**4. `service_role` key leakage.**
It bypasses RLS entirely. It must never appear in `config.js`, in any file the
browser loads, in a commit, or in a screenshot. Consider a pre-commit grep for
`service_role` and `sb_secret_`.

**5. `SECURITY DEFINER` + `search_path`.**
`is_owner()` runs with the definer's privileges. Without `set search_path = ''`
it is vulnerable to search-path hijacking. Uptown pins it and revokes `execute`
from `anon`; port both. Every function in the migration needs the same
treatment.

**6. Storage abuse.**
`file_size_limit` and `allowed_mime_types` must be set **at the bucket level**.
Client-side checks are a UX nicety, not a control — an attacker with the owner's
token posts straight to the API. Cap size, allow only `image/webp` and
`image/jpeg`, scope writes and listing to `is_owner()`, and keep public read on
`/object/public/` (which does not consult RLS at all — so do **not** grant
`select` to `anon`, or the bucket becomes enumerable).

Use a **separate bucket per feature**. Uptown's reasoning is worth quoting:
sharing a bucket means one feature's orphan-cleanup pass decides the fate of
another feature's files.

**7. Token theft via the admin page.**
The Supabase session token lives in `localStorage`. XSS on `admin.html` steals
it. This is why the SDK is vendored rather than pulled from a CDN — and it is
why **`admin.html` must not load Google Fonts or any other third-party
resource**, even though the public pages do. Self-host the fonts on that page
or accept a system font.

**8. `admin.html` indexed by search engines.**
Add `<meta name="robots" content="noindex, nofollow">` and a `robots.txt`
entry. It is not a security control — the page is protected by auth — but a
login form for a client's site sitting in Google results invites attention.

**9. RLS silently missing on a table.**
The failure mode is invisible: everything works, and anyone can write. Every
new table needs `enable row level security` **and** its policies in the same
migration, and the security advisor run afterwards. Add "advisor clean" to the
definition of done for any phase that adds a table.

**10. Backups.**
Free-tier point-in-time recovery is limited. The seed arrays in git are a real
backup and should be refreshed at each release (Phase 8). Beyond that, a
periodic `pg_dump` — or accept that the git seeds are the recovery floor and
write that down so nobody is surprised.

**11. Orphaned storage objects.**
Deleting an item does not delete its photo. Needs a cleanup pass scoped to one
bucket, and it must run *after* a successful save, never speculatively.

### Worth adding, not in Uptown

- **A Content-Security-Policy header** on both the public site and the admin
  page. It is the second line of defence for concern 1, and it turns a mistake
  into a blocked request instead of a breach.
- **`rel="noopener"`** — already correct throughout the existing markup; keep
  it that way in generated links.

---

## Decisions made

*(Append here as decisions land. Format: date — decision — why.)*

- **2026-08-01** — Build Your Own Breakfast stays hardcoded. The owner has not
  asked for it, and it is a bespoke content type whose editor would cost as
  much as a menu page.
- **2026-08-01** — Phases 1 and 2 are ordered before any Supabase work so that
  the valuable, reusable half of the project does not depend on a database
  existing, and so the schema gets reviewed before it is applied.
- **2026-08-01** — Prices normalise to bare numbers; `$` is rendered by CSS
  everywhere, resolving the current `.mi__pours` / `.mi__price` inconsistency.
- **2026-08-01** — JSON-LD needs no special escaping rule. Written via
  `node.textContent = JSON.stringify(data)` as Uptown does, it is covered by
  the same "text goes in as text" rule as everything else. Corrected from an
  earlier over-broad note in this file that called for escaping `<`.
- **2026-08-01** — Uptown audited before porting (results in the Security
  section). Clean, with two minor gaps: no CSP, no `robots.txt`. Aromati adds
  a CSP from the start rather than inheriting the gap.

---

## What's still open / needs input

1. ⏸️ **The FAQ demo notice — DEFERRED 2026-08-01, awaiting the owner.**
   `faq.html` opens with a note saying its 18 questions are placeholder copy and
   asking whether to keep the page at all. Until the owner answers:
   - **Do not transcribe the FAQ into seed data.** If the page is cut, the work
     is wasted; if it is rewritten, the work is wasted twice.
   - `faq.html` still gets its nav / mobile menu / footer / hours generated like
     every other page in Phase 1 — only the 18 Q&A entries are held back.
   - `seed-faq.js` is the last file written in Phase 1, not the first.
   - Phase 5's FAQ panel is contingent on the same answer.

   Nothing else in Phase 1 depends on this. The menus are the bulk of the work
   and are unaffected.
2. **Phase 4 needs a write-back tool, and it does not exist yet.** The hours,
   contact details and all 62 copy fields are kept in the markup as well as in
   the data — on purpose, for crawlers and readers with no JavaScript — and
   `verify-phase1.mjs` asserts the two agree. Today the markup is the source of
   truth and `extract-copy.mjs` reads from it. From Phase 4 the database is the
   source of truth, and the arrow reverses: something has to write the current
   values *back into* the markup and the seed files, or the drift check starts
   failing the moment the owner edits anything. Design it as part of Phase 4,
   not as an afterthought. The menus do not have this problem — their markup was
   removed rather than kept.
3. **Hosting.** Where does this run once it needs an HTTP origin? Affects the
   CSP work and the fonts decision on `admin.html`.
4. **Does the owner need per-day opening times**, or is 7:00 am every day
   permanent? The schema supports it either way; it changes how much the Hours
   panel shows.
5. **Wine attributes.** The wine list currently encodes vintage in `.mi__tag`
   and region inside the description prose. Does the owner want those as real
   fields (filterable, consistently formatted), or is free text fine?
6. **Multiple editors, ever?** The allowlist table supports it. Worth knowing
   now, because "the owner" vs "staff" changes whether an audit trail matters.

---

## Deviations from the plan

- **2026-08-01 — the menu is 84 items, not 276.** The planning figure came from
  `grep -c 'class="mi'`, which counts every line containing `mi__row`,
  `mi__desc`, `mi__cell` and so on, not just `<li class="mi">`. Real counts:
  food 25, drinks 28, wine 31. Corrected throughout this file. The scale
  argument in favour of the CMS is unchanged, but the transcription risk is a
  third of what was assumed — and the extractor removes it anyway.

- **2026-08-01 — Phase 1 step 2 is extraction, not transcription.** The plan
  said "transcribe". Writing `tools/extract-menus.mjs` to parse the existing
  markup instead means the seed data cannot disagree with the site by
  construction, and the parser is strict — it throws on any shape it does not
  recognise rather than guessing, so an unhandled case fails loudly at build
  time instead of silently vanishing from a menu.

  It earned its keep immediately: the item-count assertion caught two real
  parser bugs (items with nested `<li>` — every wine with a pour line and the
  crêpe — being truncated, and `<li class="mi mi--opts" data-opts>` not matching
  a regex that assumed `>` followed the class attribute). Both would have
  silently dropped items from the live menu.

  The Phase 1 diff harness still gets built. Extraction protects against
  mis-copied *data*; the harness protects against a renderer that puts correct
  data on the page wrongly. Different failure, still needed.

- **2026-08-01 — the copy hooks are generated, not hand-written.**
  `tools/extract-copy.mjs` writes `data/seed-copy.js` *and* stamps the matching
  `data-copy="…"` onto the element it read from, in one pass. Doing those
  separately is how you get `cafe.lede` in one file and `cafe.lead` in the
  other, and the symptom is invisible: the field renders its stale markup and
  the page looks fine.

- **2026-08-01 — section copy has an inline vocabulary, and it is two
  constructs.** `"\n"` is a line break, `*word*` is emphasis. Nothing else, and
  no path to `innerHTML` — both are built with `createElement`, so an owner who
  types `<script>` gets those seven characters rendered as text. The one place
  the site needed emphasis is `story.lead` ("the Georgian word for *aroma*").
  Extending this later means adding a case to `writeCopy`, never relaxing the
  rule.

- **2026-08-01 — Phase 1 step 7 is partial, and deliberately so.** The seven
  self-contained blocks in `script.js` run through `boot()`. The rest declare
  names their neighbours close over (`splitWords`, `lockNav`, `isInnerPage`,
  `MENU_T`) and cannot be wrapped without hiding those declarations from the
  code that reads them. Restructuring the file to guard them too is not worth
  the regression risk against a choreography that has no automated coverage.

- **2026-08-01 — the build was shipping a site with no JavaScript at all.**
  Worse than the recorded "drops 4 pages": there was no `vite.config.js`, so
  Vite built one entry *and* copied no scripts, because it only processes
  `<script type="module">` and ours are classic on purpose. Every `src` in
  `dist/` pointed at a file that was never written. The build printed
  "✓ built" throughout. Now fixed, and the copy step asserts every referenced
  script reached `dist/` — this failed silently for the whole life of the
  project, so it needed to become loud rather than merely correct.
