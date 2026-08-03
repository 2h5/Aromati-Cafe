# Aromati Cafe - current project memory

This file is the short technical handoff for the current state of the project.
`README.md` is the setup and deployment guide. `client-notes.md` is the
owner-facing guide.

Last updated: 2026-08-03.

## Current position

The CMS is built and usable. The next work is testing the editor and polishing
the features around it, not adding a new architecture.

**Current position: CMS and browser feature testing - ← next.**

- The public site is a plain HTML, CSS and JavaScript site.
- Supabase provides the editable content and the owner-facing editor.
- The site still renders from its local fallback data if the network or database
  is unavailable.
- There is one shared owner login for now.
- The FAQ decision is still pending. The FAQ panel exists, but its placeholder
  questions have not been moved into the database.
- Cloudflare deployment is working. A broader security review can happen later.
- Separate from the CMS work: the Wine 04 photo now appears on affected iOS
  portrait sizes, but it does not move as the page scrolls. The hero and kitchen
  reel issues are closed.

## Rules that must not regress

- The navigation and masthead must not jump when a page loads or changes.
- The public pages must render immediately from local data. Never make the first
  paint wait for the database.
- Keep the fallback order: network, then local storage, then the seed files.
- The site must keep working when opened directly from the files on disk.
- Owner-entered content must be inserted as text, never treated as HTML.
- The browser may contain the publishable Supabase key. It must never contain a
  service-role, secret, or other privileged key.
- Keep one owner account until there is a real need for more accounts.
- Do not break the hardcoded Build Your Own Breakfast block, the crêpe options,
  or the Reserve a Table placeholder without an explicit request.
- Prices are stored as text and their order is explicit. Do not turn them into
  numbers or rely on database order.
- A photo is not uploaded until the owner saves. Discard must remain safe, and
  restoring the original photo must remain possible.
- Framing is baked into the uploaded file. The public site must keep doing
  nothing but cover-fit a picture into its container — no focal-point columns,
  no new CSS on the public pages.
- Every upload keeps an unframed copy as its `source_path`. That file is what
  makes framing undoable, and nothing a visitor loads ever touches it.
- `FRAME_BY_SLOT` and `FRAME_BY_PREFIX` in `admin.js` mirror the `aspect-ratio`
  rules in `styles.css`. Change one and change the other, or the framing box
  crops to a different shape than the page does.

## Main pieces

- `index.html`, `menu-food.html`, `menu-drinks.html`, `menu-wine.html` and
  `faq.html` are the public pages.
- `admin.html`, `admin.js` and `admin.css` are the editor.
- `render.js` builds public menus, copy, hours, contact details and JSON-LD.
- `data.js` loads network data, cached data or seed data. It does not own the
  page markup.
- `script.js` owns navigation, reveals, scrolling, parallax, menu filters and
  the open/closed status.
- `config.js` identifies the Supabase project and contains only the publishable
  key.
- `data/seed-copy.js`, `data/seed-hours.js`, `data/seed-settings.js`,
  `data/seed-menu.js` and `data/seed-photos.js` are the offline fallback.
- `supabase/migrations/` contains the database setup and seed migrations.
- `supabase/POLICIES.md` explains the database permissions in plain language.
- `tools/` contains extractors, generators and checks. Nothing in it ships to
  visitors.
- `_headers` and `robots.txt` must be included in the Cloudflare upload.

## CMS map

| Editor area | Stored in | Fallback file |
| --- | --- | --- |
| Words | `site_copy` | `data/seed-copy.js` |
| Hours and one-off closures | `business_hours`, `hours_exceptions` | `data/seed-hours.js` |
| Contact details and links | `site_settings` | `data/seed-settings.js` |
| Menu courses and items | `menu_courses`, `menu_items`, related menu tables | `data/seed-menu.js` |
| Photos and descriptions | `photos` and the `site-photos` bucket | `data/seed-photos.js` |
| FAQ questions | `faq_entries` | Not populated yet |

The editor has panels for Words, Hours, Contact, Menus, Photos and FAQ. Save is
explicit; Discard restores the last confirmed values. Which panel was open is
kept in `localStorage` under `aromati.admin.tab`, and which section of it under
`aromati.admin.section`, so a reload lands where the owner was rather than on
Words.

## The editor's layout

The editor is three panes and the document itself does not scroll:

- a dark **rail** on the left for the six areas,
- a light **section index** listing that area's sections — flat, nothing folds,
  one click selects, a dot per row for unsaved work,
- an **editor pane** showing the selected section with its fields already open,
  and the savebar sticky at its foot.

Under 1200px the rail lies down under the topbar. Under 900px the index and the
editor take turns and `.shell--editing` says which is showing.

There is no accordion anywhere except inside a menu section, where the items
still expand one at a time. `CMS-REDESIGN.md` is the working spec for this
layout and the interpretation calls behind it; delete it once the redesign has
settled.

Things that are easy to break here:

- The desktop time picker is unchanged apart from where it lands. It now hangs
  below its input instead of pushing the layout down, anchored to the right so
  the last column of the hours grid cannot push it out of the pane. Mobile
  still gets the operating system's own picker.
- The savebar no longer hides. It stays and goes quiet (`.savebar--clean`), and
  both its buttons are disabled when there is nothing to save. It and the
  problems list are children of the shell, not of the editor: under 900px the
  index and the editor take turns, and a savebar inside the editor would
  disappear whenever the owner went back to the list with work still unsaved.
- The hours grid says Opens and Closes once, as column headers. The per-field
  labels are still in the markup at `font-size: 0` — they are what a screen
  reader announces, and the "edited" badge hangs off them.
- The gold wash behind the chosen area in the rail, and the tan fill behind the
  chosen section in the index, are each one element that slides — positioned
  from the chosen element's own geometry through the CSSOM in
  `positionRailMark` and `positionIndexMark`. Setting either through a `style`
  attribute instead would be dropped by `style-src 'self'` in production and
  work perfectly on a laptop. The rows themselves stay transparent, so the
  fill and the row can never disagree about what is selected.
- There is no "last saved" or "last published" anywhere, deliberately. Every
  content table does carry `updated_at`, so if it is ever wanted it is one
  `max()` away and needs no migration.

The Opens and Closes boxes are still `input[type=time]` — that is what holds the
value, what can be typed into, and what opens the phone's own wheel. Only the
browser's dropdown is replaced: its indicator is hidden and a clock button opens
the editor's own three-column panel. The panel is placed on the row rather than
inside the field, because the row bottom-aligns its boxes and a field that grew
would drag its neighbour down.

## Framing a photograph

Every picked file goes through a framing box before it becomes an upload, and
`Adjust framing` reopens it on a photograph already in a slot. The frame holds
still and the picture moves behind it: drag or arrow-key to pan, a slider or
`+`/`-` to zoom to 4×, Escape to back out. The crop is written into the file
that gets uploaded, which is why nothing on the public site had to change.

Where the box gets its unframed pixels from decides what can be done next, and
this is the part that is easy to get wrong:

| The slot is showing | The box opens | Afterwards |
| --- | --- | --- |
| A file picked this sitting | the copy held in memory | its queued original goes up once, unchanged |
| An upload with a `source_path` | that original, out of the bucket | the original stays where it is; only the framed copy is replaced and swept |
| The photograph the site was built with | the committed file under `assets/`, same origin | the crop gets an original of its own, so it can be widened again |
| An upload with no `source_path` | the framed copy on the site | framing works inwards only, and the panel says so before the button is pressed |

The last row is the one that cannot be fixed after the fact, and today it is
empty: `photos` has no row with a `storage_path`, so every slot is still on its
built-in file and every future upload keeps an original. It can only be reached
by an upload whose 2600px original came out over the bucket's 3 MB limit.

Do not treat a CMS-to-files sync tool as current work. The CMS is the editing
surface. Revisit that only if the project later needs offline fallback files to
include every live edit.

## What to test next

### Editor basics

- Sign in with the owner account and confirm an unapproved account cannot edit.
- Change a word, save it, reload, and confirm the public page shows it.
- Change a word, discard it, reload, and confirm the old value remains.
- Test hours, closed days and one-off closures. The open/closed pill, Visit
  section, footer, mobile menu and search-engine hours must agree.
- Change contact details and confirm every public location updates together.
- Edit, reorder, hide and restore menu content. Confirm filters and the two
  hardcoded special menu blocks still work.
- Pick a photo, preview it, discard it, save it, and restore the original. Check
  that it lands in the right place and keeps a useful description.
- Decide whether the FAQ stays, is removed, or gets real questions. Do not move
  placeholder questions into live data before that decision.

### Public-site checks

- Turn off the network and confirm the site still opens with its fallback data.
- Reload after a CMS change and check that the change survives.
- Check the navigation, long headings, menu filtering, mobile layout and photo
  placement in a real browser.
- On a real iPhone, revisit the Wine 04 scrolling photo separately from CMS
  testing. It should remain visible and should move gently with the page.
- Check the browser console after changes that affect rendering or saving.

### Later, not a current blocker

- Do the full security sweep around database permissions, storage, headers and
  preview access.
- Decide whether the FAQ page stays.
- Revisit multiple staff accounts only if they become necessary.
- Back up uploaded photos outside the live storage bucket.

## Local and deployment workflow

- The source tree is the site and must keep working as plain files.
- `npm run dev` starts the local preview server.
- `npm run build` checks the local build and produces `dist/`; follow
  `README.md` for the current Cloudflare upload workflow.
- After a deploy, confirm the public pages, `admin.html`, `_headers` and
  `robots.txt` are actually present.
- Safari can hold an old stylesheet. Use a private tab when checking a CSS
  change on iOS.

## Verification before release

Run `npm test` after code or data changes. For changes involving the live CMS,
also run `node tools/check-live-project.mjs`. For headline or responsive layout
changes, run `node tools/measure-headlines.mjs` and inspect the result in a real
browser. Automated checks cannot replace the browser pass for visual behavior.

### The twenty-six harnesses

`npm test` currently covers: `check:fonts`, `test:fonts`, `check:csp`,
`check:vendor`, `test:pages`, `test:hours`, `test:copy`, `test:ordering`,
`test:guards`, `test:admin`, `test:photos`, `test:sql`, `test:rls`,
`test:dbguards`, `test:live`, `test:policies`, `check:policies`, `check:seed`,
`check:photosql`, `check:memory`, `check:layout`, `test:replay`,
`test:resilience`, `test:hourslive`, `test:menushapes` and `test:hostile`.

The Phase 1 snapshot check is `tools/verify-phase1.mjs` and uses baseline
`53b3d5e`. Do not silently change that baseline when changing the renderer.

## Reference inventory

These names are kept here so the project checks can detect missing or renamed
support files without requiring a long explanation for each one.

Tools: `tools/add-content-hooks.mjs`, `tools/check-csp.mjs`,
`tools/check-fonts.mjs`, `tools/check-live-project.mjs`,
`tools/check-memory.mjs`, `tools/check-policies.mjs`, `tools/check-vendor.mjs`,
`tools/copy-labels.mjs`, `tools/extract-copy.mjs`, `tools/extract-menus.mjs`,
`tools/extract-photos.mjs`, `tools/fetch-fonts.mjs`, `tools/gen-photo-sql.mjs`,
`tools/gen-seed-sql.mjs`, `tools/measure-font-shift.mjs`,
`tools/measure-headlines.mjs`, `tools/page-boot.mjs`, `tools/photo-slots.mjs`,
`tools/strip-menu-markup.mjs`, `tools/supabase-shim.mjs`,
`tools/test-admin.mjs`, `tools/test-copy.mjs`, `tools/test-db-guards.mjs`,
`tools/test-fonts.mjs`, `tools/test-guards.mjs`, `tools/test-hostile-content.mjs`,
`tools/test-hours-live.mjs`, `tools/test-hours.mjs`, `tools/test-live.mjs`,
`tools/test-menu-shapes.mjs`, `tools/test-ordering.mjs`, `tools/test-photos.mjs`,
`tools/test-policies.mjs`, `tools/test-replay.mjs`, `tools/test-resilience.mjs`,
`tools/test-rls.mjs`, `tools/test-sql.mjs`, `tools/verify-phase1.mjs` and
`tools/wire-scripts.mjs`.

Migrations: `supabase/migrations/20260801000000_init_cms.sql`,
`supabase/migrations/20260801000100_seed_content.sql`,
`supabase/migrations/20260801000200_allowlist_owner.sql`,
`supabase/migrations/20260801000300_advisor_fixes.sql` and
`supabase/migrations/20260801000400_photos.sql`.
