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
- The brand mark is vector and its colour is CSS, never a file per colour. The
  lockup was traced out of `assets/logos/AROMATI - LOGO white BG.pdf` at 1:1;
  `assets/logos/aromati-lockup.svg` is the readable copy, and styles.css holds
  the same paths split into their two inks as mask `data:` URIs so each state
  names its own colours. The bar wears the printed two-tone everywhere; the one
  override is the mobile menu, where the mark is knocked out in cream because
  the curtain under it is dark. Exporting a light PNG and a dark PNG would work
  until the third
  state, and it would put the mark back above the fold as a late-loading
  request. It is inline for the same reason the two critical fonts are.

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
- The savebar's count opens a list of what the next save would write — one
  entry per changed row, with the old value against the new one, a link to the
  section it lives in, and "Put back" on an edited row. Three things about it
  are load-bearing:
  - It is **derived on every draw**, from `baseline` against `draft`, like
    every other "changed" in `admin.js`. It must never become a recorded log
    of edits: a word typed and typed back is not a change.
  - It is **one entry per row, not per box**, because `changeCount()` counts
    rows and the list has to agree with the number on the button that opened
    it. Both walk `PANEL_TABLES`, which is the single list of which tables
    belong to which area.
  - It **reverts an edit and nothing else.** Un-deleting a section means
    restoring its items and pours through the cascade `deleteCourse` walks by
    hand, and un-adding one means deciding what happens to the rows added
    under it. Discard already does all of it correctly in one step, so an
    added or removed row is listed and named but carries no undo.
  `locate()` mints a section id per table and the six section builders mint
  theirs independently — `test:admin` walks every row and requires the two to
  agree, because an entry pointing at an id no panel produces looks completely
  fine and simply goes nowhere when pressed.
- The change drawer opens on the **`0fr` → `1fr` grid row** the menu item
  bodies and the time picker use, and it has to. It was written on `max-height`
  first, which animates to the cap rather than to the list: one entry is 121px
  under a `42vh` cap, so it reached full height in 40ms of a 240ms transition
  and read as no animation at all, while closing sat still for 60ms and then
  dropped. Driving the transition's own `currentTime` and reading the box back
  is how to see this — it is invisible at speed and obvious in numbers.
  **`align-self: start` on `.changes__inner` is load-bearing:** stretched, the
  inner is squeezed to the animating row, carries a scrollbar through the whole
  open, and reflows 10px wider on the last frame. The cap now lives on the
  inner alone, in both the default and narrow-screen blocks — one number, not a
  pair that had to be kept equal.
  (An earlier note here claimed the `0fr` idiom collapses to zero in this
  position. It does not; that measurement came from a dev server holding a
  stale stylesheet.)

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
2026 it is still empty — but no longer because nothing has been uploaded. Eleven
slots carry a `storage_path`: `cafe.card2`, `cafe.card3`, `cafe.card4`,
`gallery.g2`, `gallery.g3`, `hero.main`, `kitchen.plate2`,
`menuDrinks.masthead`, `story.a`, `story.b` and `wine.board`. Every one also
carries a `source_path`, so every one
can still be widened. The row can only be reached by an upload whose 2600px
original comes out over the bucket's 3 MB limit.
`tools/check-live-project.mjs` names that state explicitly and fails on it.

### Keeping the offline floor in step with the uploads

On 4 August 2026 the first ten framed uploads were pulled out of the bucket and
committed as the files the site ships with — `assets/web/*-framed.webp` — and
the markup was repointed at them. Before that, a visitor who arrived while
Supabase was unreachable saw ten photographs the owner had replaced months
earlier. `hero.main` was synced the same way on 6 August. Now all eleven live
overrides are byte-for-byte identical to the fallbacks the pages ship with.

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

### The shipped photograph must never be painted and then replaced

Noticed on 6 August 2026, on the hero: the photograph the site ships with
appeared for a beat on every load and was then swapped for the owner's. The
data was never wrong. The replacement was already in `localStorage` before the
page began parsing — it was simply not *asked for* until far too late.

The shipped file is a real `src` in the markup, which is what makes the site
correct from `file://`, with no database and with JavaScript off. That is not
going away. But `render.js` is at the bottom of the body, so the browser
fetched the shipped file from line 129, painted it, parsed four hundred more
lines, and only then set the replacement.

`photo-boot.js` is the answer and is the **only** script in `<head>`. It reads
the same cache key `data.js` writes, preloads the replacements, and hides
exactly the slots that are about to change until `render.js` has the real
picture decoded. A repeat visitor never sees the shipped photograph at all.

Three things about it are load-bearing and easy to undo by accident:

- **It must stay external and stay above the body.** `script-src` is `'self'`
  with no `'unsafe-inline'`; an inline version fails `check:csp`. Moved below
  the body it silently does nothing.
- **The cache key is written twice**, here and in `data.js`. They are compared
  at runtime and asserted by `test:photoboot`. Bumping the version in one file
  only puts the blink back on a site where everything still passes.
- **Nothing may stay hidden.** The reveal timeout is armed before anything is
  hidden, and every error path reveals everything. If that timer is ever doing
  the work on a normal load, the photograph is arriving 700ms late and nothing
  reports it — `test:photoboot` asserts `render.js` releases each slot on every
  path through it, which is what keeps the timer a net rather than the
  mechanism.

**A first-ever visitor is not covered and cannot be**, at runtime: the URL
exists only in a database the browser has not queried. For that visitor the fix
is the one already written above — run `node tools/extract-photos.mjs` after an
upload and commit, so the shipped file *is* the current photograph and there is
nothing to swap. The hero replacement uploaded on 6 August 2026 exposed this
gap and has now been extracted as `assets/web/hero-wine-frame.webp`.

### The blink is fixed at build time, not in the browser

Settled 7 August 2026, after four attempts in the browser. **Do not try to fix
this in `photo-boot.js` or `render.js` again.** Every one of those attempts is
in the history of this branch and every one of them failed, in a different way,
for the same underlying reason.

The browser must paint before it can ask the database what the photograph is.
That leaves exactly two options and no third: show the shipped picture and swap
when the answer arrives, or show nothing until it does. Each attempt was a
rearrangement of those two:

- **Hold the slot until the refresh settles.** Correct, and it works — but a
  freshly uploaded photograph is not in anyone's HTTP cache, so the wait is a
  round trip *plus* an image download. Measured on the live site: data back at
  207ms, picture not decoded until ~1200ms. The deadline sat between them.
- **Hold the above-the-fold image on a cold visit.** Fired on returning
  visitors too and `hero.main` has no upload, so the hero sat behind a dark
  panel on every load, waiting out a request that always answered "nothing
  changed", then appeared with a jolt. A new blink, for nothing.
- **Assign the new src only after decoding off-DOM.** Right in principle;
  `decode()` on a detached image rejects often enough that it turned "swap the
  picture in" into "never swap it", which is worse.
- **Raise the deadline.** Moves the boundary. A slower connection crosses it.

`tools/bake-photos.mjs` removes the question instead of answering it: after
`vite build` it downloads the current photographs and writes them into the
built pages' `src`. The HTML the browser receives already names the right
picture, so it paints once, with no JavaScript involved and nothing to replace.
This is what every server-rendered or statically generated site does, and the
reason none of them have this bug.

Four things about it are load-bearing:

- **It writes to `dist/` only.** The source tree keeps what is committed, so
  `file://`, `vite dev`, a fresh clone and a deleted database all behave as
  they always did, and a build never shows up in `git status`. `test:bake`
  asserts a bake writes to no file in the repository.
- **It stamps `baked` into `dist/data/seed-photos.js`,** and `data.js` compares
  that against the database's `storage_path`. Equal means the markup already
  has this picture and **no override is reported**. Without the stamp the bake
  is worse than useless — the page would open on the correct photograph and
  then be handed the same photograph from the bucket URL, a second fetch and
  repaint on every load. Sabotaging the stamp fails three checks in
  `test:bake`.
- **A path that differs turns the runtime layer back on,** which is what covers
  the window between an upload and the next build. The two halves are not
  alternatives; the runtime one is the stopgap and the bake is the fix.
- **It never half-bakes and never fails a deploy.** An unreachable database or
  a photograph the bucket will not serve leaves `dist/` exactly as vite built
  it and exits 0 — the same floor as everything else here: when the live layer
  is unavailable, serve what is in git. A page is rewritten only after its
  photograph is on disk, because a rewritten page naming a missing file is a
  broken image on the live site, which is worse than the blink.

### The edge middleware closes the window the bake cannot

`tools/bake-photos.mjs` makes the files correct *as of the build*. On a site
nobody is maintaining — a one-time fee, the owner self-serving through the CMS,
no developer to run a build — "as of the build" is a shrinking guarantee: every
photograph changed afterwards flickers, forever, because nothing rebuilds.

`functions/_middleware.js` covers that window. It rewrites the `src` of any slot
whose photograph has changed since the build, as the page streams out, so the
HTML that reaches the browser already names the current picture. Verified end
to end under `wrangler pages dev`: a slot stale in the manifest is served
pointing at Supabase and the browser paints it once — one sample, no swap,
where the same case without the middleware measured a swap at 2383ms.

Load-bearing, and each was nearly got wrong:

- **It is middleware, not an advanced-mode `_worker.js`.** Cloudflare does not
  apply `_headers` to what a Function returns, so `_worker.js` would have
  silently dropped the Content-Security-Policy — on a site whose entire XSS
  story is that policy. Middleware calls `next()` and returns the asset
  server's own response. The policy is *also* re-asserted in code rather than
  trusted, and `test:worker` fails the build if it stops matching `_headers`.
  (The CSP is real: an inline probe script was blocked by it while testing.)
- **`publicUrl` must be spelled exactly as `data.js` spells it.** render.js
  skips a slot when the src it finds equals the URL it would build, and that
  comparison is the only thing stopping the rewrite and the runtime layer from
  both acting on one photograph. `test:worker` runs both functions over the
  same awkward paths — spaces, `&`, non-ASCII — and requires identical output.
  Dropping the encode fails three checks.
- **It reads `dist/_baked.json`** — written by the bake — so it only touches
  slots that have actually changed. Without it every baked photograph is
  rewritten from a same-origin file to a Supabase URL on every request:
  correct, and slower than doing nothing on the common path.
- **No failure path returns an error.** A database that is down, slow or
  answering nonsense costs a stale photograph and nothing else; the response
  from the static host is returned untouched. A stale map is served *while* a
  refresh runs, so a visitor never waits on Supabase.

The two halves compose without coordination: the bake handles the steady state
and serves same-origin assets, the middleware handles the delta. Neither needs
the other to be correct.

**Photographs are the only content that needs a rebuild.** Words, hours, prices
and menu items are live on the next page load with no flicker, because they are
rendered from data rather than replacing something already painted. `photoNote()`
in `admin.js` tells the owner this, and tells them rebuilds are metered — the
host allows 500 a month. Nothing triggers one automatically; that is deliberate,
so nine uploads in a sitting cannot become nine builds.

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

### The thirty-one harnesses

`npm test` currently covers: `check:fonts`, `test:fonts`, `check:csp`,
`check:vendor`, `test:pages`, `test:hours`, `test:copy`, `test:ordering`,
`test:guards`, `test:admin`, `test:photos`, `test:photoboot`, `test:bake`, `test:worker`,
`test:sql`,
`test:rls`,
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
`tools/check-deployed-headers.mjs`, `tools/check-fonts.mjs`,
`tools/check-live-project.mjs`,
`tools/check-memory.mjs`, `tools/check-policies.mjs`, `tools/check-vendor.mjs`,
`tools/copy-labels.mjs`, `tools/extract-copy.mjs`, `tools/extract-menus.mjs`,
`tools/extract-photos.mjs`, `tools/fetch-fonts.mjs`, `tools/gen-photo-sql.mjs`,
`tools/gen-seed-sql.mjs`, `tools/measure-font-shift.mjs`,
`tools/measure-headlines.mjs`, `tools/page-boot.mjs`, `tools/photo-slots.mjs`,
`tools/strip-menu-markup.mjs`, `tools/supabase-shim.mjs`,
`tools/bake-photos.mjs`, `tools/test-admin.mjs`, `tools/test-bake.mjs`,
`tools/test-copy.mjs`, `tools/test-worker.mjs`, `tools/test-db-guards.mjs`,
`tools/test-fonts.mjs`, `tools/test-guards.mjs`, `tools/test-hostile-content.mjs`,
`tools/test-hours-exceptions.mjs`, `tools/test-hours-live.mjs`,
`tools/test-hours.mjs`, `tools/test-live.mjs`,
`tools/test-menu-hidden.mjs`, `tools/test-menu-shapes.mjs`,
`tools/test-ordering.mjs`, `tools/test-photo-boot.mjs`,
`tools/test-photos.mjs`,
`tools/test-policies.mjs`, `tools/test-replay.mjs`, `tools/test-resilience.mjs`,
`tools/test-rls.mjs`, `tools/test-sql.mjs`, `tools/verify-phase1.mjs` and
`tools/wire-scripts.mjs`.

Migrations: `supabase/migrations/20260801000000_init_cms.sql`,
`supabase/migrations/20260801000100_seed_content.sql`,
`supabase/migrations/20260801000200_allowlist_owner.sql`,
`supabase/migrations/20260801000300_advisor_fixes.sql`,
`supabase/migrations/20260801000400_photos.sql`,
`supabase/migrations/20260804000000_menu_item_hidden.sql`,
`supabase/migrations/20260806000000_sizes_max_3.sql` and
`supabase/migrations/20260806000100_allowlist_second_editor.sql`.
