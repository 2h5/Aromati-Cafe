# Aromati Cafe — project memory

This file is the technical handoff for whoever maintains the site next.
`README.md` is the setup and deployment guide. `client-notes.md` is the
owner-facing guide. `PHOTOGRAPHS.md` is the full account of the photograph
pipeline and must be read before touching it.

Last updated: 2026-08-20.

## Current state

The site is complete and handed over to the client. The CMS is built and in
use, deployment is working, and the iOS rendering investigation is closed.
Further work is maintenance and fixes, not new features.

**Current position: the site is handed over; maintenance and fixes only ← next.**

- The public site is plain HTML, CSS and JavaScript.
- Supabase provides the editable content and the owner-facing editor.
- The site renders from its local fallback data if the network or database is
  unavailable.
- There is one shared owner login.
- The Wine 04 photo stays static on iOS portrait sizes. That is the accepted
  behavior, not an open bug.

## Rules that must not regress

- The navigation and masthead must not jump when a page loads or changes.
- The public pages must render immediately from local data. Never make the
  first paint wait for the database.
- Keep the fallback order: network, then local storage, then the seed files.
- The site must keep working when opened directly from the files on disk.
- Owner-entered content must be inserted as text, never treated as HTML.
- The browser may contain the publishable Supabase key. It must never contain
  a service-role, secret, or other privileged key.
- Keep one owner account until there is a real need for more accounts.
- Do not break the hand-written Build Your Own Breakfast layout or
  interaction, the crêpe options, or the Reserve a Table placeholder without
  an explicit request. Its base, bagel varieties and add-ons are CMS-backed
  through `menu_builder_options`; keep the iOS-sensitive markup and event
  model fixed.
- Prices are stored as text and their order is explicit. Do not turn them
  into numbers or rely on database order.
- A one-off date is added to the week, never merged into it. It appears on
  its own line in the Visit card, the footer and the mobile menu from seven
  days ahead (`NOTICE_DAYS` in `render.js`), drives the open/closed pill on
  the day, and goes to Google as `specialOpeningHoursSpecification`
  immediately. A closure must never be folded into the grouped runs —
  "Sun — Tue" with a holiday inside it reads as a new weekly rule. Anything
  that reads the week must read the one-off dates beside it;
  `tools/test-hours-exceptions.mjs` starts by checking that the request is
  made at all.
- `menu_item_options` is the one thing in the database the editor cannot
  rebuild: the crêpe's seven toppings, deliberately not exposed, carried off
  by `ON DELETE CASCADE` when the item or its section is deleted. Any confirm
  that can reach them must name them — `optionsWarning()` in `admin.js` is
  the single place that sentence is written, and `test:admin` checks both
  delete paths say it and that an ordinary item does not. Hiding is the
  escape route: it is the reason the toggle sits directly above the Delete
  button.
- A hidden menu item is pruned in `shapeMenu` (`data.js`) and nowhere else.
  Every public reader is downstream of that one point, so none of them can
  leak one. Do not add `if (!item.hidden)` to a renderer — a forgotten branch
  there publishes a withdrawn item silently, and the likeliest place for it
  to surface is the JSON-LD, where nobody looks. A section whose items are
  *all* hidden is not published either, and neither is its filter tab — but a
  section with no rows at all keeps both, because that is an interrupted edit
  rather than a decision.
- The seed files never carry a hidden item. A seed is the menu as the public
  sees it, so if a live-to-seed dump is ever written it must prune first —
  otherwise the fallback serves withdrawn items exactly when Supabase is
  unreachable. `test:menuhidden` holds the line on both of these.
- There is one clock. `AROMATI_DATA.nowNY()` answers what time and what day
  it is in New York; `script.js` and `render.js` both read it and neither
  builds its own. A second `Intl` formatter is a second answer on the hours a
  year when New York and UTC disagree about the date.
- A photo is not uploaded until the owner saves. Discard must remain safe,
  and restoring the original photo must remain possible.
- Framing is baked into the uploaded file. The public site must keep doing
  nothing but cover-fit a picture into its container — no focal-point
  columns, no new CSS on the public pages.
- Every upload keeps an unframed copy as its `source_path`. That file is what
  makes framing undoable, and nothing a visitor loads ever touches it.
- `FRAME_BY_SLOT` and `FRAME_BY_PREFIX` in `admin.js` mirror the
  `aspect-ratio` rules in `styles.css`. Change one and change the other, or
  the framing box crops to a different shape than the page does.
- A photograph is resized to the slot it goes into, not to one number for the
  whole site. `MAX_EDGE` (2000) is the default; a frame with a `max`
  overrides it, and the kitchen plates (800) and cafe cards (1200) both set
  one. The resize stays automatic: no upload is ever refused for being too
  large.
- A generated file that a check compares character for character must have
  its line endings normalised before the comparison. Git stores LF and hands
  out CRLF on Windows, so a raw `===` against a freshly checked-out file
  fails on every clone while passing for whoever last ran the generator.
  `gen-seed-sql.mjs` and `gen-photo-sql.mjs` both normalise; a third
  generator must too.
- Photographs are sized for where they are drawn, not for where they came
  from. The kitchen plates are 1100px WebP because a plate is drawn at 320px;
  the gallery and hero keep their full-size files because they are drawn at
  800-900. `assets/web/georgian-salad.jpg` and `adjaruli.jpg` are each shared
  by a small slot and a large one — swapping a file by name alone will
  quietly shrink the large one too.
- The brand mark is vector and its colour is CSS, never a file per colour.
  `assets/logos/aromati-lockup.svg` is the readable copy, and styles.css
  holds the same paths split into their two inks as mask `data:` URIs so each
  state names its own colours. The bar wears the printed two-tone everywhere;
  the one override is the mobile menu, where the mark is knocked out in cream
  because the curtain under it is dark. It is inline for the same reason the
  two critical fonts are.

## Main pieces

- `index.html`, `menu-food.html`, `menu-drinks.html` and `menu-wine.html` are
  the public pages.
- `admin.html`, `admin.js` and `admin.css` are the editor.
- `render.js` builds public menus, copy, hours, contact details and JSON-LD.
- `data.js` loads network data, cached data or seed data. It does not own the
  page markup.
- `script.js` owns navigation, reveals, scrolling, parallax, menu filters and
  the open/closed status.
- `config.js` identifies the Supabase project and contains only the
  publishable key.
- `data/seed-copy.js`, `data/seed-hours.js`, `data/seed-settings.js`,
  `data/seed-menu.js`, `data/seed-photos.js` and
  `data/seed-breakfast-builder.js` are the offline fallback.
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
| Build Your Own Breakfast choices | `menu_builder_options` | `data/seed-breakfast-builder.js` |
| Photos and descriptions | `photos` and the `site-photos` bucket | `data/seed-photos.js` |

The editor has panels for Words, Hours, Contact, Menus and Photos. Save is
explicit; Discard restores the last confirmed values. Which panel was open is
kept in `localStorage` under `aromati.admin.tab`, and which section of it
under `aromati.admin.section`, so a reload lands where the owner was.

## The editor's layout

The editor is three panes and the document itself does not scroll: a dark
**rail** on the left for the six areas, a light **section index** listing
that area's sections (flat, one click selects, a dot per row for unsaved
work), and an **editor pane** showing the selected section with the savebar
sticky at its foot. Under 1200px the rail lies down under the topbar. Under
900px the index and the editor take turns and `.shell--editing` says which is
showing. There is no accordion anywhere except inside a menu section, where
the items still expand one at a time.

Things that are easy to break here:

- The desktop time picker hangs below its input instead of pushing the
  layout down, anchored to the right so the last column of the hours grid
  cannot push it out of the pane. Mobile still gets the operating system's
  own picker.
- The savebar stays and goes quiet (`.savebar--clean`) when there is nothing
  to save. It and the problems list are children of the shell, not of the
  editor: under 900px the index and the editor take turns, and a savebar
  inside the editor would disappear whenever the owner went back to the list
  with work still unsaved.
- The hours grid says Opens and Closes once, as column headers. The per-field
  labels are still in the markup at `font-size: 0` — they are what a screen
  reader announces, and the "edited" badge hangs off them.
- The gold wash behind the chosen area in the rail, and the tan fill behind
  the chosen section in the index, are each one element that slides —
  positioned from the chosen element's own geometry through the CSSOM in
  `positionRailMark` and `positionIndexMark`. Setting either through a
  `style` attribute instead would be dropped by `style-src 'self'` in
  production and work perfectly on a laptop. The rows themselves stay
  transparent, so the fill and the row can never disagree about what is
  selected. Same arrangement, same reasons, in `positionPagePick` for the
  menu page picker.
- The shape pills in the framing dialog deliberately do *not* use that
  pattern; each pill fills in instead, sized by `fillFrom` — same CSSOM rule,
  same CSP reason. Choosing a shape also animates the frame itself:
  `is-morphing` on the stage, added on the click and taken off again the
  instant a drag or the zoom slider starts, because those write the same
  properties on every pointer move and a transition on them is a picture that
  lags behind the finger.
- There is no "last saved" or "last published" anywhere, deliberately. Every
  content table carries `updated_at`, so if it is ever wanted it is one
  `max()` away and needs no migration.
- The savebar's count opens a list of what the next save would write. Three
  things about it are load-bearing:
  - It is **derived on every draw**, from `baseline` against `draft`. It must
    never become a recorded log of edits: a word typed and typed back is not
    a change.
  - It is **one entry per row, not per box**, because `changeCount()` counts
    rows and the list has to agree with the number on the button that opened
    it. Both walk `PANEL_TABLES`, the single list of which tables belong to
    which area.
  - It **reverts an edit and nothing else.** Discard already handles added
    and removed rows correctly in one step, so those are listed and named but
    carry no undo. `locate()` mints a section id per table and the six
    section builders mint theirs independently — `test:admin` walks every row
    and requires the two to agree.
- The change drawer opens on the **`0fr` → `1fr` grid row**, and it has to —
  a `max-height` transition animates to the cap rather than to the list.
  **`align-self: start` on `.changes__inner` is load-bearing:** stretched,
  the inner is squeezed to the animating row, carries a scrollbar through the
  whole open, and reflows wider on the last frame. The cap lives on the inner
  alone, in both the default and narrow-screen blocks.

The Opens and Closes boxes are still `input[type=time]` — that is what holds
the value, what can be typed into, and what opens the phone's own wheel. Only
the browser's dropdown is replaced: its indicator is hidden and a clock
button opens the editor's own three-column panel. The panel is placed on the
row rather than inside the field, because the row bottom-aligns its boxes and
a field that grew would drag its neighbour down.

## Framing a photograph

Every picked file goes through a framing box before it becomes an upload, and
`Adjust framing` reopens it on a photograph already in a slot. The frame
holds still and the picture moves behind it: drag or arrow-key to pan, a
slider or `+`/`-` to zoom to 4×, Escape to back out. The crop is written into
the file that gets uploaded, which is why nothing on the public site had to
change.

Where the box gets its unframed pixels from decides what can be done next:

| The slot is showing | The box opens | Afterwards |
| --- | --- | --- |
| A file picked this sitting | the copy held in memory | its queued original goes up once, unchanged |
| An upload with a `source_path` | that original, out of the bucket | the original stays where it is; only the framed copy is replaced and swept |
| The photograph the site was built with | the committed file under `assets/`, same origin | the crop gets an original of its own, so it can be widened again |
| An upload with no `source_path` | the framed copy on the site | framing works inwards only, and the panel says so before the button is pressed |

The last row is the one that cannot be fixed after the fact. It is currently
empty: eleven slots carry a `storage_path` (`cafe.card2`, `cafe.card3`,
`cafe.card4`, `gallery.g2`, `gallery.g3`, `hero.main`, `kitchen.plate2`,
`menuDrinks.masthead`, `story.a`, `story.b` and `wine.board`) and every one
also carries a `source_path`, so every one can still be widened. The row can
only be reached by an upload whose 2600px original comes out over the
bucket's 3 MB limit. `tools/check-live-project.mjs` names that state
explicitly and fails on it.

## Photographs and the build

Read `PHOTOGRAPHS.md` before touching any of this. The short version:

**Nothing may set an `img` `src` after paint.** That single rule is the whole
design. An earlier four-layer runtime swap (a boot script, edge middleware,
route confinement and a runtime renderer) was deleted in full; it existed to
make a runtime swap invisible, and a swap that must be *made* invisible can
always fail to be. Do not reintroduce any of those layers.

What is there now is one layer. `tools/bake-photos.mjs` runs after
`vite build`, downloads the owner's current photographs into
`dist/assets/baked-<slot>-<hash>.<ext>`, and writes those paths — and the
owner's descriptions — into the built pages. The markup that leaves the
server is already right, and nothing runs afterwards that can change it.

Load-bearing details:

- **The bake writes to `dist/` only.** The source tree keeps what is
  committed, so `file://`, `vite dev`, a fresh clone and a deleted database
  all behave as they always did, and a build never shows up in `git status`.
  `test:bake` asserts a bake writes to no file in the repository.
- **It bakes the description as well as the `src`.** Both halves live in the
  database. It escapes what it writes, because the owner types that text and
  a build step splicing it into markup has to quote it itself.
  Sabotage-verified in `test:bake`.
- **It never half-bakes and never fails a deploy.** An unreachable database
  or a photograph the bucket will not serve leaves `dist/` as vite built it
  and exits 0 — when the live layer is unavailable, serve what is in git. The
  consequence is that **a bake that silently did nothing is a green build**,
  so read the build log for `photographs baked in`.
- **`.nvmrc` must stay.** Pages picks a very old default Node otherwise, and
  old Node has no global `fetch`, so the bake works on every machine here and
  fails on the one that matters.

### The owner triggers the rebuild, from the editor

A build is what makes an uploaded photograph live, so the owner has to be
able to ask for one. **Publish**, in the editor's topbar, calls the
`publish-site` Supabase Edge Function, which holds the Cloudflare deploy hook
URL in `DEPLOY_HOOK_URL` and asks Postgres `is_owner()` before using it.

- **The hook URL can never be in the browser.** It is an unauthenticated URL;
  whoever holds it can spend the project's builds forever. `admin.js` is
  served to anyone who asks — the sign-in gate is in front of the *editor*,
  not the file.
- **`verify_jwt` alone is not authorisation.** It proves somebody signed in.
  `is_owner()` is the one answer to who may edit this site and it lives in
  `admin_users`, not in a second list in the function.
- **Publish refuses when there are unsaved changes.** A build bakes what is
  *saved*; publishing over an unsaved edit spends a minute producing a site
  missing the thing the owner just typed, with nothing looking wrong.
- **The message promises a request, not a result** — "the site updates in
  about a minute". Nothing in the browser can learn whether the build
  succeeded.
- **The CORS preflight echoes `Access-Control-Request-Headers`.** A hardcoded
  list is how this fails: `supabase-js` sends `x-client-info`, and if the
  list does not name it the browser answers the preflight, compares, and
  never sends the POST — a failure with no failed request in it.
- **One build per publish, not per photograph.** The owner changes as many
  photographs as they like and presses Publish once.
- **The cost, written down because it is real.** For about forty seconds
  after Publish the site still serves the previous photograph — not a
  flicker, the old picture sitting still. And a build that fails for any
  unrelated reason means the photograph never appears.
- **Photographs are the only content that needs a rebuild.** Words, hours,
  prices and menu items are live on the next page load with no flicker,
  because they are rendered from data rather than replacing something already
  painted.

### Keeping the offline floor in step with the uploads

All eleven live overrides have been pulled out of the bucket and committed as
the files the site ships with (`assets/web/*-framed.webp`), and the markup is
repointed at them, so the fallbacks are byte-for-byte identical to the live
photographs. **This does not stay true by itself.** After any future upload,
run `node tools/extract-photos.mjs` and commit, or the gap opens again
silently — nothing on the site looks wrong until the day the database is
unreachable. `check-live-project.mjs` reports how many slots are overridden
on every run, which is the reminder to do it.

New names rather than overwriting the originals, so replacing a shared source
file cannot silently reframe a second slot the owner never touched.

## Deferred items

- Do the full security sweep around database permissions, storage, headers
  and preview access.
- Leaked-password protection stays off. It is a Pro feature and this project
  is on the free plan, so the Supabase advisor will keep reporting it as a
  WARN forever. Not a finding — do not raise it again.
- Revisit multiple staff accounts only if they become necessary.
- Back up uploaded photos outside the live storage bucket.

## Local and deployment workflow

- The source tree is the site and must keep working as plain files.
- `npm run dev` starts the local preview server.
- `npm run build` checks the local build and produces `dist/`; follow
  `README.md` for the current Cloudflare upload workflow.
- After a deploy, confirm the public pages, `admin.html`, `_headers` and
  `robots.txt` are actually present.
- A path written inside a classic script is a string Vite cannot see. It
  emits images under hashed names and rewrites only the markup and CSS that
  name them, so `assets/web/…` does not exist in `dist/`.
  `data/seed-photos.js` was pointing there and the editor showed a broken
  thumbnail for every photograph the owner had not yet replaced.
  `vite.config.js` now rewrites that file's `src` values in `dist/` to the
  names Vite gave them and fails the build if any slot does not resolve. A
  photograph only reaches `dist/` by being referenced from a page or a
  stylesheet; one that only the seed file names will stop the build until it
  is referenced or removed.
- Safari can hold an old stylesheet. Use a private tab when checking a CSS
  change on iOS.

## Verification before release

Run `npm test` after code or data changes. For changes involving the live
CMS, also run `node tools/check-live-project.mjs`. For headline or responsive
layout changes, run `node tools/measure-headlines.mjs` and inspect the result
in a real browser. Automated checks cannot replace the browser pass for
visual behavior — check navigation, long headings, menu filtering, mobile
layout and photo placement, and confirm the site still opens with its
fallback data when the network is off.

### The twenty-nine harnesses

`npm test` currently covers: `check:fonts`, `test:fonts`, `check:csp`,
`check:vendor`, `test:pages`, `test:hours`, `test:copy`, `test:ordering`,
`test:guards`, `test:admin`, `test:photos`, `test:bake`, `test:sql`,
`test:rls`, `test:dbguards`, `test:live`, `test:policies`, `check:policies`,
`check:seed`, `check:photosql`, `check:memory`, `check:layout`,
`test:replay`, `test:resilience`, `test:hourslive`, `test:hoursexceptions`,
`test:menushapes`, `test:menuhidden` and `test:hostile`.

The Phase 1 snapshot check is `tools/verify-phase1.mjs` and uses baseline
`53b3d5e`. Do not silently change that baseline when changing the renderer.

## Reference inventory

These names are kept here so the project checks can detect missing or renamed
support files without requiring a long explanation for each one.

Tools: `tools/add-content-hooks.mjs`, `tools/check-csp.mjs`,
`tools/check-deployed-headers.mjs`, `tools/check-fonts.mjs`,
`tools/check-live-project.mjs`,
`tools/check-memory.mjs`, `tools/check-policies.mjs`, `tools/check-vendor.mjs`,
`tools/copy-labels.mjs`, `tools/extract-copy.mjs`, `tools/extract-menus.mjs`,
`tools/extract-photos.mjs`, `tools/fetch-fonts.mjs`, `tools/gen-photo-sql.mjs`,
`tools/gen-seed-sql.mjs`, `tools/measure-font-shift.mjs`,
`tools/measure-headlines.mjs`, `tools/page-boot.mjs`, `tools/photo-slots.mjs`,
`tools/strip-menu-markup.mjs`, `tools/supabase-shim.mjs`,
`tools/bake-photos.mjs`, `tools/test-admin.mjs`, `tools/test-bake.mjs`,
`tools/test-copy.mjs`, `tools/test-db-guards.mjs`,
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
`supabase/migrations/20260801000400_photos.sql`,
`supabase/migrations/20260804000000_menu_item_hidden.sql`,
`supabase/migrations/20260806000000_sizes_max_3.sql`,
`supabase/migrations/20260806000100_allowlist_second_editor.sql`,
`supabase/migrations/20260812000100_breakfast_builder.sql`,
`supabase/migrations/20260812000200_menu_course_hidden.sql`,
`supabase/migrations/20260812000300_smooth_admin_validation_copy.sql`,
`supabase/migrations/20260815000000_remove_retired_page.sql` and
`supabase/migrations/20260817000000_photo_captions.sql`.
