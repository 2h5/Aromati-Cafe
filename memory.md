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
- A one-off date is added to the week, never merged into it. It appears on its
  own line in the Visit card, the footer and the mobile menu from seven days
  ahead (`NOTICE_DAYS` in `render.js`), drives the open/closed pill on the day,
  and goes to Google as `specialOpeningHoursSpecification` immediately. What
  must not happen is a closure being folded into the grouped runs — "Sun — Tue"
  with a holiday inside it reads as a new weekly rule.
- `hours_exceptions` had a full editor panel and a promise in its help text for
  the whole of Phases 5–8 while no file on the public site read the table — the
  pill would have said "Open now" on a day the owner had marked closed.
  Anything that reads the week must read the one-off dates beside it.
  `tools/test-hours-exceptions.mjs` starts by checking that the request is made
  at all, because twenty-six harnesses were green the entire time it was not.
- `menu_item_options` is the one thing in the database the editor cannot
  rebuild: the crêpe's seven toppings, deliberately not exposed, carried off by
  `ON DELETE CASCADE` when the item or its section is deleted. Any confirm that
  can reach them must name them — `optionsWarning()` in `admin.js` is the single
  place that sentence is written, and `test:admin` checks both delete paths say
  it and that an ordinary item does not. Hiding is the escape route: it is the
  reason the toggle sits directly above the Delete button.
- A hidden menu item is pruned in `shapeMenu` (`data.js`) and nowhere else.
  Every public reader is downstream of that one point, so none of them can leak
  one. Do not add `if (!item.hidden)` to a renderer — a forgotten branch there
  publishes a withdrawn item silently, and the likeliest place for it to surface
  is the JSON-LD, where nobody looks. A section whose items are *all* hidden is
  not published either, and neither is its filter tab — but a section with no
  rows at all keeps both, because that is an interrupted edit rather than a
  decision. Case 3 of `tools/test-resilience.mjs` owns that half of the rule and
  predates this one.
- The seed files never carry a hidden item. A seed is the menu as the public
  sees it, so if a live-to-seed dump is ever written it must prune first —
  otherwise the fallback serves withdrawn items exactly when Supabase is
  unreachable, which is the hardest moment to notice. `test:menuhidden` holds
  the line on both of these.
- There is one clock. `AROMATI_DATA.nowNY()` answers what time and what day it
  is in New York; `script.js` and `render.js` both read it and neither builds
  its own. A second `Intl` formatter is a second answer on the hours a year
  when New York and UTC disagree about the date.
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
- A photograph is resized to the slot it goes into, not to one number for the
  whole site. `MAX_EDGE` (2000) is the default; a frame with a `max` overrides
  it, and the kitchen plates (800) and cafe cards (1200) both set one. Removing
  those sends a 2000px file into a 320px box nine times over, which is a visible
  stall on a laptop and was the reason the reel lagged. The resize stays
  automatic either way: no upload is ever refused for being too large.
- A generated file that a check compares character for character must have its
  line endings normalised before the comparison. Git stores LF and hands out
  CRLF on Windows, so a raw `===` against a freshly checked-out file fails on
  every clone while passing for whoever last ran the generator — running it
  rewrites the file with LF, so the fix and the camouflage are the same action.
  `gen-seed-sql.mjs` and `gen-photo-sql.mjs` both normalise now; a third
  generator must too.
- Photographs are sized for where they are drawn, not for where they came from.
  The kitchen plates are 1100px WebP because a plate is drawn at 320px; the
  gallery and hero keep their full-size files because they are drawn at 800-900.
  `assets/web/georgian-salad.jpg` and `adjaruli.jpg` are each shared by a small
  slot and a large one — swapping a file by name alone will quietly shrink the
  large one too.

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
| Hours | `business_hours` | `SEED_HOURS` in `data/seed-hours.js` |
| One-off closures | `hours_exceptions` | `SEED_HOURS_EXCEPTIONS`, same file |
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
still expand one at a time.

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
- Same arrangement, same reasons, in `positionPagePick` for the menu page
  picker.
- The shape pills in the framing dialog deliberately do *not* use that
  pattern. One mark travelling between five wrapping pills was tried and
  looked wrong; each pill fills in instead, the maroon growing out of the
  point that was pressed, sized by `fillFrom` — same CSSOM rule, same CSP
  reason. Choosing a shape also animates the frame itself: `is-morphing` on
  the stage, added on the click and taken off again the instant a drag or the
  zoom slider starts, because those write the same properties on every pointer
  move and a transition on them is a picture that lags behind the finger.
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

The last row is the one that cannot be fixed after the fact, and as of 4 August
2026 it is still empty — but no longer because nothing has been uploaded. Ten
slots carry a `storage_path`: `cafe.card2`, `cafe.card3`, `cafe.card4`,
`gallery.g2`, `gallery.g3`, `kitchen.plate2`, `menuDrinks.masthead`, `story.a`,
`story.b` and `wine.board`. Every one also carries a `source_path`, so every one
can still be widened. The row can only be reached by an upload whose 2600px
original comes out over the bucket's 3 MB limit.
`tools/check-live-project.mjs` names that state explicitly and fails on it.

### Keeping the offline floor in step with the uploads

On 4 August 2026 those ten framed uploads were pulled out of the bucket and
committed as the files the site ships with — `assets/web/*-framed.webp` — and
the markup was repointed at them. Before that, a visitor who arrived while
Supabase was unreachable saw ten photographs the owner had replaced months
earlier. Now the fallback shows the same pictures the live site does.

**This does not stay true by itself.** After any future upload, run
`node tools/extract-photos.mjs` and commit, or the gap opens again silently —
nothing on the site looks wrong until the day the database is unreachable, which
is the day nobody is in a position to notice. `check-live-project.mjs` reports
how many slots are overridden on every run, which is the prompt to do it.

New names rather than overwriting the originals, because `story.a` shared
`dining-corner.jpg` with `faq.masthead`, which was never overridden — replacing
the file in place would have silently reframed a slot the owner never touched.

`tools/extract-photos.mjs` could not read a WebP's dimensions until the same
day. It returned null and the generator wrote the slot without a width, so a
single run stripped the numbers off all eleven WebP slots at once — including
nine nobody had touched. Nothing broke visibly, because the layout is CSS and
does not use them; the only casualty was the editor's warning that a replacement
photograph is a very different shape from the one it replaces. A reader that
fails by going quiet deserves more suspicion than one that throws.

Do not treat a general CMS-to-files sync tool as current work. The CMS is the
editing surface, and text edits reach the seed files through the existing
extract tools. The photographs are the one place this has actually been done by
hand — see "Keeping the offline floor in step with the uploads" above — and that
was a one-off, not the start of a sync tool. Revisit only if the project later
needs the offline fallback to include every live edit.

## What to test next

### Editor basics

- Sign in with the owner account and confirm an unapproved account cannot edit.
- Change a word, save it, reload, and confirm the public page shows it.
- Change a word, discard it, reload, and confirm the old value remains.
- Test hours and closed days. The open/closed pill, Visit section, footer,
  mobile menu and search-engine hours must agree.
- Enter a one-off closure a few days out and confirm it is named under the
  hours, in the footer and in the mobile menu, on every page that has them.
  Enter one for today and confirm the pill says so and names the reason; enter
  one for tomorrow and confirm the pill steps over it rather than promising a
  door that stays shut. One eight days out should be invisible on the page and
  still present in the page source's search listing.
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
- Decide whether the FAQ page stays. The `faq_entries` table, its policies and a
  full editor panel all exist and nothing on the public site reads them —
  `faq.html` carries its ten questions as markup. The table is empty, so nothing
  is lost, but the panel is reachable and looks like it works. Wire it or hide
  it; leaving it is how `hours_exceptions` became a live defect.
- Leaked-password protection stays off. It is a Pro feature and this project is
  on the free plan, so the Supabase advisor will keep reporting it as a WARN
  forever. Not a finding — do not raise it again.
- Revisit multiple staff accounts only if they become necessary.
- Back up uploaded photos outside the live storage bucket.

## Local and deployment workflow

- The source tree is the site and must keep working as plain files.
- `npm run dev` starts the local preview server.
- `npm run build` checks the local build and produces `dist/`; follow
  `README.md` for the current Cloudflare upload workflow.
- After a deploy, confirm the public pages, `admin.html`, `_headers` and
  `robots.txt` are actually present.
- A path written inside a classic script is a string Vite cannot see. It emits
  images under hashed names and rewrites only the markup and CSS that name
  them, so `assets/web/…` does not exist in `dist/`. `data/seed-photos.js` was
  pointing there and the editor showed a broken thumbnail for every photograph
  the owner had not yet replaced — the state of a first login. `vite.config.js`
  now rewrites that file's `src` values in `dist/` to the names Vite gave them
  and fails the build if any slot does not resolve. A photograph only reaches
  `dist/` by being referenced from a page or a stylesheet; one that only the
  seed file names will stop the build until it is referenced or removed.
- Safari can hold an old stylesheet. Use a private tab when checking a CSS
  change on iOS.

## Verification before release

Run `npm test` after code or data changes. For changes involving the live CMS,
also run `node tools/check-live-project.mjs`. For headline or responsive layout
changes, run `node tools/measure-headlines.mjs` and inspect the result in a real
browser. Automated checks cannot replace the browser pass for visual behavior.

### The twenty-eight harnesses

`npm test` currently covers: `check:fonts`, `test:fonts`, `check:csp`,
`check:vendor`, `test:pages`, `test:hours`, `test:copy`, `test:ordering`,
`test:guards`, `test:admin`, `test:photos`, `test:sql`, `test:rls`,
`test:dbguards`, `test:live`, `test:policies`, `check:policies`, `check:seed`,
`check:photosql`, `check:memory`, `check:layout`, `test:replay`,
`test:resilience`, `test:hourslive`, `test:hoursexceptions`, `test:menushapes`,
`test:menuhidden` and `test:hostile`.

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
`tools/test-hours-exceptions.mjs`, `tools/test-hours-live.mjs`,
`tools/test-hours.mjs`, `tools/test-live.mjs`,
`tools/test-menu-hidden.mjs`, `tools/test-menu-shapes.mjs`,
`tools/test-ordering.mjs`, `tools/test-photos.mjs`,
`tools/test-policies.mjs`, `tools/test-replay.mjs`, `tools/test-resilience.mjs`,
`tools/test-rls.mjs`, `tools/test-sql.mjs`, `tools/verify-phase1.mjs` and
`tools/wire-scripts.mjs`.

Migrations: `supabase/migrations/20260801000000_init_cms.sql`,
`supabase/migrations/20260801000100_seed_content.sql`,
`supabase/migrations/20260801000200_allowlist_owner.sql`,
`supabase/migrations/20260801000300_advisor_fixes.sql`,
`supabase/migrations/20260801000400_photos.sql` and
`supabase/migrations/20260804000000_menu_item_hidden.sql`.
