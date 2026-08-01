# memory.md — Aromati CMS build

Persistent build plan and status for the Aromati Café & Wine Bar CMS.

**How to use this file.** Read it at the start of every session before touching
code. It holds the settled decisions, the content inventory, the phase plan and
the running status. When a decision gets made, write it into *Decisions made*
below. When the plan changes, write it into *Deviations from the plan* — do not
silently edit a phase to match what actually happened.

---

## ⛔ Do not break this again: the nav must not shift on navigation

**This has been fixed three times and broken twice, and neither break was font
work.** The second one came from adding delivery links — a change with nothing
to do with typography, which pushed the masthead past the point where an
existing font reflow became visible. It cost most of a session to diagnose the
second time. Read this before touching `styles.css`, any `<head>`, or anything
in the nav or a masthead.

The rule: **text must be measured once and never re-measured.** If a page paints
text in one font and re-paints it in another, the nav wordmark shifts on every
navigation and the masthead's bottom edge — a hard colour seam across the whole
page — jumps with it.

What holds it, none of which is optional:

| | why |
|---|---|
| Fraunces and Manrope roman-latin are **inlined in `styles.css` as `data:` URIs** | a linked font cannot be there for the first paint; a `preload` fixes that over https but is **ignored over `file://`**, and this site is opened both ways |
| those inlined faces carry **no `font-display`** | `optional` commits before the font pipeline finishes *even for a `data:` URI*, and renders the fallback for the whole page load |
| the other four faces are linked with **`font-display: optional`** | they must never swap; which face they land on matters less, they are italics and rare characters |
| **no `ch` units above the fold** — use `em` | `ch` is the width of the font's own `0` and is *not* equalised by the metric-matched fallbacks. `max-width:58ch` on the lede was 8% narrower before the swap, wrapped an extra line, moved the seam 31.5px. **This is the one that will happen again, because it does not look font-related.** |
| no page fetches from `fonts.googleapis.com` / `fonts.gstatic.com` | third-party fonts arrive after the first paint by definition |

Two harnesses guard it, and both run in `npm test`:

- **`npm run check:fonts`** — static, cannot skip, runs anywhere. It enforces
  every row of that table. `npm run test:fonts` puts all five historical breaks
  back and requires the checker to catch each one *and name which rule fired*.
- **`npm run check:layout`** — drives real Chrome and checks that every page
  *settles* in the real fonts, against the committed baseline in
  `tools/font-metrics.json`, on five pages, including with deliberately long
  copy standing in for what the owner will type. It catches the whole page
  rendering in Georgia for a load. It **skips silently when Chrome is not
  installed**, which is exactly when a regression ships — so it is the second
  guard, not the first.

  It deliberately does *not* assert "measured before the fonts, measured after,
  they match". That was the first version, and it failed 1, 2 and 0 times across
  three runs of an unchanged tree: with no `font-display` the browser never
  paints the fallback, so the pre-font measurement describes a layout that was
  never on screen. A guard that fails at random is one people learn to ignore.
  If the design genuinely changes, re-record with
  `npm run check:layout -- --record` and read the diff.

If `check:fonts` fails, read the header of `tools/check-fonts.mjs` before
changing anything. It lists all four real breaks and what each looked like.

There is now a **third**, independent guard on the same regression, arrived at
from a different direction: `npm run check:csp` refuses any origin the pages or
`styles.css` fetch that the Content-Security-Policy does not allow. A Google
Fonts `<link>` pasted back into a `<head>` fails there too, as a policy
violation rather than as a font problem — and it fails even if someone has
"fixed" `check-fonts.mjs` to stop complaining.

---

**Keeping it honest.** Update this file **in the same commit as the work it
describes** — not afterwards, not at the end of a phase. A session can be
compacted or interrupted at any point, and the difference between resuming and
re-deriving is whether this file was already true when that happened.

Four kinds of rot, all of which have already been found here at least once:

| Rot | Fix |
|---|---|
| A cited line number that has moved | Re-check `file.js:NN` links; they drift with every edit |
| A sketch kept beside the real thing | Delete the sketch, link the real file |
| A position marker left behind | Move it, or delete it — there is only ever one |
| A tool written and never mentioned | Every file in `tools/` gets a line here |

**`npm run check:memory` catches all four**, and runs as part of `npm test`. It
checks that every path this file names exists, every `file.js:NN` link lands on
a real non-blank line, every tool and migration is mentioned, every `npm run`
script named here is real, and that exactly one position marker exists.

It cannot check whether what this file *says* is true — a phase marked done that
isn't, a decision quietly reversed in code. That still needs a person. The
manual audit that prompted all this found four stale line numbers, two
undocumented tools, a superseded schema block and a phase marker three phases
behind.

The cautionary example is not hypothetical. Uptown's README still says *"Status:
this is the demo build — pre-CMS"* and *"no schema, migrations, or storage
buckets exist yet"*, seventeen commits and eight migrations later. **This repo's
own `README.md` is currently that stale** — it still describes the pre-CMS site.
Phase 8 rewrites it; until then, do not trust it.

Modelled directly on the Uptown Coffee Co. CMS build (`Z:\cs lock\uptown
coffee - kimi`), which is the reference implementation for this project. Where
something here says "same as Uptown", that means: go read that code and port
the decision, don't re-derive it.

---

## Current phase / status

**Phase 1 done bar two parked items; Phase 2 done.** Branch
`phase1-content-as-data`, not merged — hold the merge until the browser pass on
the choreography, since jsdom cannot run it and it is the likeliest thing to
have broken.

Done — **the three menu pages now render from data, verified identical**:
- `tools/extract-menus.mjs` — strict markup→data extractor
- `data/seed-menu.js` — 84 items, 17 courses, all six price shapes
- `data/seed-hours.js`, `data/seed-settings.js` — written, not yet consumed
- `render.js` — builds the boards; `createElement`/`textContent` only
- `tools/strip-menu-markup.mjs` — removed the now-generated markup
- `tools/verify-phase1.mjs` — jsdom harness; runs the real renderer and diffs
  the board's visible text and class counts against commit `53b3d5e`, the last
  one before the conversion. **The baseline does not move.** Re-pinning it to a
  newer commit would re-bless whatever the conversion had already broken, and
  the check would stop meaning anything. Deliberate wording changes since then
  go in its `INTENDED` list instead — one entry so far, Book → Reserve a Table
  — and an entry that stops matching fails the run, so the list cannot rot into
  a blanket pass.
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

Also done — **Phase 2: the schema and its policies, written and checkable**:
- `supabase/migrations/20260801000000_init_cms.sql` — 12 tables, 34 policies.
  Seeds the hours and the fourteen settings; the menus, copy and photos are left
  for a *generated* migration in Phase 3, because hand-copying 84 items at the
  last moment would reintroduce exactly the risk Phase 1 removed.
- `supabase/POLICIES.md` — what the SQL allows, in the owner's language. Phase
  2's real deliverable: the SQL is agreed by reading this, not by reading SQL.
- `tools/check-policies.mjs` — seven structural properties, read off the SQL as
  text. **Not a syntax check** — there is no Postgres here and the SQL has never
  run. It catches the mistakes that are silent when made, chiefly a table left
  without RLS, which reads and writes perfectly from every account including
  none.
- `tools/test-policies.mjs` — breaks each of the seven rules on purpose and
  requires the checker to catch it *and name which rule fired*.
- `supabase/migrations/20260801000100_seed_content.sql` — **generated**, by
  `tools/gen-seed-sql.mjs`, from `data/seed-*.js`: 17 sections, 84 items, 26
  pours, 7 options, 62 copy fields. Deterministic, so it reviews as a diff.
  Ends with a block that asserts the row counts, because a partial apply
  otherwise leaves a menu quietly missing its last section.
- `supabase/migrations/20260801000200_allowlist_owner.sql` — the owner's UUID
  into `admin_users`, Phase 3 step 5 as a committed file rather than a snippet
  pasted into the SQL editor. Idempotent, and it raises if the allowlist is
  still empty afterwards — a typo in the UUID is otherwise a silent no-op that
  surfaces much later as "the save button does nothing".
- `tools/copy-labels.mjs` — the one hand-written file in the copy pipeline. A
  key is not a name, and the generator refuses to run if the labels and the
  data disagree by even one field.

**One-off tools, already run, kept as a record of what was done to the markup**
— re-running them is a no-op or worse, so read the header before you do:
`tools/add-content-hooks.mjs` (marked the two anonymous footer `<p>`s that
render.js had no other way to find), `tools/wire-scripts.mjs` (gave every page
the seed data and the renderer, in the order that matters: data → render.js →
script.js), `tools/strip-menu-markup.mjs` (removed the now-generated boards).

**No `menu_pages` table.** One was drafted with `title` and `lede` before
anyone checked that `site_copy` already holds `food.headline` ("The Food Menu")
and `food.lede`, and the same pair for the other two. Two tables owning one
string is a bug waiting for them to disagree. What was left after removing them
was a slug and a sort order, which is a column on `menu_courses`. Same
reasoning that dropped `faq.footButton` from the copy set in Phase 1.

### The eighteen harnesses, and what each is for

`npm test` runs all eighteen. The two font ones run **first**: they are the
fastest, and they guard the thing that has broken most often.

- `tools/check-fonts.mjs` — the font-loading invariants, statically. Cannot
  skip, runs anywhere, and is the only guard when Chrome is missing. See the ⛔
  section at the top of this file.
- `tools/test-fonts.mjs` — puts all five historical font breaks back and
  requires the checker to catch each one *and name which rule fired*.
- `tools/verify-phase1.mjs` — all five pages, whole-body, running the real
  renderer, diffed against `53b3d5e` (pre-conversion). Proves nothing changed.
  `PHASE1_BASE` overrides the comparison commit. Two escape hatches, both of
  which fail if they stop matching: `INTENDED` for wording deliberately changed
  since the baseline, `ADDED` for blocks that did not exist then — a text diff
  compares by position, so an insertion otherwise reports the whole rest of the
  page as changed. Anchors are compared on their `href` as well as their text.
- `tools/test-hours.mjs` — run grouping, closed days, the JSON-LD output, and
  the pill at its boundaries.
- `tools/test-copy.mjs` — the inline vocabulary, what happens to a field the
  data omits, and the property the whole design exists for: owner input is
  text, never markup.
- `tools/test-ordering.mjs` — the delivery links: clearing a URL removes the
  link and, when the last one goes, the row around it; and an href that is not
  `https://` is refused rather than rendered.
- `tools/test-guards.mjs` — breaks each guarded block in turn and checks the
  last statement in `script.js` still runs.
- `tools/check-policies.mjs` — the RLS invariants, over the migration text.
- `tools/test-policies.mjs` — proves the checker above can fail.
- `tools/test-sql.mjs` — **applies every migration to a real Postgres** (PGlite,
  Postgres compiled to WebAssembly — no Docker, no server) on the shim in
  `tools/supabase-shim.mjs`, then checks the row counts, reads RLS off
  `pg_class` rather than off the text claiming to enable it, inserts all six
  price shapes, and confirms the six malformed ones are refused.
- `tools/test-rls.mjs` — asks the database who can do what. Every write is run
  three times with the *same* statement — as the owner, as a signed-in stranger
  and logged out — because a statement only the owner can execute is the only
  thing that proves the other two were refused by policy rather than by a
  constraint. 44 checks; the Security rows of the Phase 7 checklist bar the two
  that are not SQL.
- `tools/test-db-guards.mjs` (`npm run test:dbguards`) — puts five silent
  database mistakes back (RLS off
  a table, `using (true)` where `is_owner()` was meant, the allowlist opened,
  `is_owner()` granted to `anon`, the price-shape constraint relaxed) and
  requires the two harnesses above to fail *and name which one*.
- `gen-seed-sql.mjs --check` — the committed seed migration still matches the
  seed data. Editing `seed-copy.js` and forgetting to regenerate would leave
  the site saying one thing and the database seeding another.
- `tools/test-replay.mjs` (`npm run test:replay`) — **the second harness that
  drives a real browser.** Loads a menu page with `fetch` stubbed to return a
  menu that differs from the seed, and checks the rebuild leaves nothing
  behind: one scroll spacer rather than one per `initMenu` run, a tab bar
  rebuilt rather than appended to, Build Your Own still present, and the
  expandable row still opening on one click. Every one of those failures is
  silent — none of them throws, they surface much later as a menu that scrolls
  oddly or a button that does nothing.

  **The stub answers after 300ms, and that delay is load-bearing.** An
  immediately-resolved promise settles in the microtask checkpoint *between*
  the `render.js` and `script.js` tags, so the board is already fresh before
  `script.js` registers its listener — `initMenu` then runs once against the
  new board and every check passes without the replay path ever executing.
  Harmless in production, useless in a test. Mutation-tested: disabling the
  teardown gives two spacers, and dropping the rebind stops the row opening.
- `tools/check-csp.mjs` (`npm run check:csp`) — the Content-Security-Policy in
  `_headers`, checked against the site it protects. A CSP is the one control
  whose failure mode is the *site* breaking, quietly, and only in production:
  `_headers` has no effect over `file://` or under `vite dev`. It refuses an
  inline `<script>` or `style=` attribute (which the policy would silently
  drop), any origin the pages or `styles.css` fetch that the policy does not
  allow, a `font-src` without `data:` while the faces are inlined, and — the
  quiet one — a `connect-src` that does not match the project in `config.js`.
  That last mismatch does not error: `data.js` falls back to the seeds and
  serves a complete, correct-looking site that silently stopped updating.
  Mutation-tested on all six rules.
- `tools/test-live.mjs` (`npm run test:live`) — **the Phase 4 round trip.**
  Applies the seed migration to a real Postgres, serves those rows to `data.js`
  through a stub shaped like PostgREST, and requires what comes back out to
  equal `data/seed-*.js` exactly: all 84 items, 26 pours, 62 copy fields, the
  hours and the settings. A dropped pour, a shuffled course or `7.50` arriving
  as `7.5` shows up as a diff. Also covers the paths that only matter when
  things go wrong — no key, offline, 401, malformed JSON, an empty database, a
  corrupt cache, and storage that throws on every call.
- `tools/check-memory.mjs` — this file still points at reality. See *Keeping it
  honest* at the top.
- `tools/measure-font-shift.mjs` (`npm run check:layout`) — the one harness
  that drives a real browser. Headless Chrome, measuring the nav and the
  masthead before and after `document.fonts.ready`, on all five pages, twice
  each: as shipped and with deliberately longer copy standing in for what the
  owner will type. Fails if anything moves by half a pixel. Skips cleanly where
  there is no Chrome. jsdom cannot answer anything about layout, which is why
  every visual regression so far had to be found by eye first.

### Delivery links (DoorDash, Grubhub)

Added 2026-08-01, after the owner's listings turned up late. They do **not**
replace the menu pages — the menus are the reason the site exists — they sit
beside them: a row in the Visit table on the home page and a quiet line under
the menu switcher on all three menu pages, which is where someone is already
reading a menu when the thought occurs.

- **Whole URLs, not store ids.** Neither service documents its URL shape.
  Both of these were copied out of a working address bar, which the owner can
  also do; deriving them would be guessing. The DoorDash one is what Google
  handed over, minus its `srsltid` tracking parameter. Its `&` is a literal
  character in the path, so it is `&amp;` in markup.
- **Neither URL has been fetched.** DoorDash returns 403 to everything that is
  not a browser — including a deliberately wrong slug — so nothing here can
  tell a good link from a bad one. Click both once.
- **Empty means gone.** Clearing a URL is how the owner leaves a service:
  `render.js` removes the link, and the row with it if it empties. The site
  will outlive at least one of these listings. The `site_settings` empty-value
  check exempts `order_*_url` for exactly this.
- **An href is a code sink.** `javascript:…` in that field would run on click,
  and from Phase 4 the value comes from a database the owner types into. The
  trigger refuses to store anything but `https://` and `render.js` refuses to
  render it — deliberately both, the same way nothing is trusted with markup.
- The delivery pages are also the JSON-LD `sameAs`, written by `renderContact`
  rather than left in the markup, so it cannot outlive a changed handle or a
  dropped service. The hand-written copy already could.

The middle three exist because verify-phase1 asserts the output is *unchanged*,
which is exactly the wrong test for a code path that never existed. The last
one exists because `check-policies` passed all seven rules on its first run
against SQL written the same afternoon — which is also what a checker whose
rules match nothing does.

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

Chrome *is* available on this machine and `npm run check:layout` drives it, so
"needs a browser" no longer means "needs a person". It measures — it can prove
nothing moved between two paints. It cannot tell whether a layout looks right,
whether an animation reads well, or whether a column break landed somewhere
sensible. Everything below needs eyes, not measurements; if something below
turns out to be measurable, move it into that harness rather than re-checking
it by hand every time.

One choreography bug is fixed but unverified: a course still on screen when a
filter ran kept its `.in`, so removing the class started it fading *out* and
re-adding it two frames later caught it before it had moved — the cascade
played over a course that was already visible, which looked like no animation.
Most visible on All ↔ the first tab, where the top course never leaves. Fixed
with `.carte__body.is-resetting` (transitions off for one forced layout, under
the `.is-swapping` cover) in `commit()`. It predates the phases — the block is
unchanged since the initial commit. Nothing automated covers it; the browser
pass is the test.

**The boards are a two-column flow, not a two-column grid** (`columns:2` on
`.carte__body`). A grid gives every row the height of its tallest course, so a
short course beside a long one left the difference as dead space — visible on
the wine list, where a four-item course sat beside a ten-item one. That is what
a grid does, and it was only going to get worse: once the owner is editing,
course lengths vary far more than the ones written here, and no amount of
reordering fixes a layout that pairs courses by row. The browser now balances
the columns itself. `.course` carries `break-inside:avoid` (a heading in one
column and its lines in the next is worse than any gap) and a `margin-bottom`
where the grid had a `row-gap`. Build Your Own uses `column-span:all`, which
also splits the flow so the courses above and below it balance separately —
the same runs the old `balance()` computed by hand. `balance()` now only
handles the one case the browser cannot: a single course, which would sit in
column one with column two empty, so the board goes `.is-single` and takes the
full width. `.course.is-alone` is gone. Also unverified — same browser pass.

Remaining in Phase 1: the nav/mobile-menu/footer **markup** dedupe — deferred
because the chrome is more per-page bespoke than assumed (index has four footer
columns, faq five, the menu pages a `footer--menu` variant), and the *values*
problem is now solved without it. `seed-faq.js` is held back — see *What's
still open*, item 1. Everything else in Phase 1 is done.

**Phase 3 is half done.** The project exists (`yofoiqgknsqzsuwtlqvh`), public
signups are off and the owner account is created — all three by hand in the
dashboard on 2026-08-01. What remains needs the dashboard or the Supabase MCP
server, which is configured in `.mcp.json` but was added mid-session and so
supplied no tools; a restart picks it up.

| Phase 3 step | state |
|---|---|
| 1 create the project | ✅ done |
| 2 disable public signup | ✅ done |
| 3 create the owner account | ✅ done — `a69c4370-3872-4b61-aba2-4049e34f9549` |
| 4 apply the migrations | **proven locally, not yet applied to the project** |
| 5 allowlist the owner | written as `20260801000200_allowlist_owner.sql`; applies with step 4 |
| 6 seed the content tables | generated already; applies with step 4 |
| 7 run the security advisor | ⛔ needs the dashboard — nothing local substitutes |

The SQL has now actually run. That matters, because this file used to warn that
it never had and that the first apply should be expected to fail. It does not
fail: all three migrations apply clean, seed the right number of rows, and
enforce every shape rule. What that does **not** retire is step 7 — see the
"WHAT THIS IS NOT" note at the top of `tools/supabase-shim.mjs` for the four
ways a local Postgres differs from a Supabase project.

Still worth doing in either order — read `POLICIES.md` and say whether it
describes what you meant, and do the browser pass.

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

- **Build Your Own Breakfast** (`#build`, [script.js:656](script.js#L656)).
  Stays hardcoded exactly as it is. Its chips carry `data-price` / `data-name`
  and it has its own bagel sub-field and hint map; making it editable is a
  content type of its own and the owner has not asked for it. **The Phase 1
  conversion must leave this section untouched and still working.**
- **The crêpe options row** (`.mi--opts`, `#crepeOpts`) — see Constraints. It
  is modelled in the schema so it survives the conversion, but the editor does
  not expose it in the first pass.
- **Reservations.** [script.js:757](script.js#L757) is a deliberate placeholder.
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
- **Prices are stored bare, without the `$`.** [styles.css:968](styles.css#L968)
  and [styles.css:1008](styles.css#L1008) add the `$` via `::before`. Today
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
- **The menu tab cascade must be replayable.** [script.js:405](script.js#L405)
  through [script.js:639](script.js#L639) handles filtering, height-locking and
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

1. **The live open/closed pill** — ~~`script.js:755–756`~~ **done**, now
   [script.js:785](script.js#L785) reading `SEED_HOURS`. What was there:
   ```js
   var OPEN  = 7 * 60;                          // 7:00 am, every day
   var CLOSE = [22, 22, 22, 23, 23, 23, 23];    // by day, Sun → Sat
   ```
   That model **could not express a closed day** and assumed one opening time
   for all seven. Both are now per-day, and `CLOSE[NaN]` is unreachable.
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

## Schema

**The schema sketch that used to sit here is gone — the real thing exists.**
Read [`supabase/migrations/20260801000000_init_cms.sql`](supabase/migrations/20260801000000_init_cms.sql),
which carries the same reasoning as comments next to the columns it explains,
and [`supabase/POLICIES.md`](supabase/POLICIES.md) for what it allows in plain
words. A sketch kept alongside a real schema is a second source of truth that
nobody updates.

Three things ended up different from the sketch, all worth knowing:

- **No `menu_pages` table.** See the status section above.
- **`hours_exceptions` was added** — one-off dates like "closed December 25",
  which are not a weekday pattern and are the likeliest thing an owner wants to
  change.
- **`site_settings` and `site_copy` got a trigger** restoring label, help and
  position on update. RLS grants an update on a *row*, not a *column*.

---

## Phases

Phases 1 and 2 need **no Supabase project**. That is deliberate — it is most of
the hard work, and all of it is useful even if the CMS is never finished.

---

### Phase 0 — Plan. ✅ done

This document. Also: create the branch, and confirm the scope table above with
the owner (especially the FAQ demo-notice question).

**Done when:** this file is committed and the scope is agreed.

---

### Phase 1 — Content becomes data. **No Supabase.** ✅ done bar two parked items
*(step 5, the chrome dedupe, deferred; the FAQ entries parked. See the status
section — it is more current than this list.)*

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
   ([script.js:785](script.js#L785)) reads `SEED_HOURS` and learns to handle
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

### Phase 2 — Schema + RLS, written and reviewed. **No Supabase.** ✅ written, awaiting your read of POLICIES.md

Write `supabase/migrations/` as real, ordered, committed SQL. **Do not apply.**
There is nothing to apply it to yet, and that is the point — the SQL gets
reviewed on its merits first.

Deliverables: the migration files, plus a plain-English summary of what every
policy grants and to whom.

**Done when:** the SQL is committed and the policy summary has been read and
agreed.

---

### Phase 3 — Supabase project + apply. **First phase needing the DB.** ← *next*

Step 6's seeding is already generated and committed:
`supabase/migrations/20260801000100_seed_content.sql`. Steps 1–3 and 7 are
dashboard work that cannot be done from here.

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

### Phase 4 — The site reads from Supabase. ✅ built, awaiting the anon key

`data.js` holds the fallback chain: `network → localStorage → SEED_*`.
`render.js` paints once, synchronously, from cache-or-seed, then repaints only
if the network came back with something genuinely different. `config.js` holds
the project URL and the publishable key.

**The one thing outstanding: paste the anon key into `config.js`.** Dashboard →
Project Settings → API Keys → the publishable/anon key. Until then the site
runs entirely from the seeds, which is a supported state and not a broken one —
it is exactly what happens if the database is ever unpaid or deleted.

- **No SDK on the public pages.** Plain `fetch` against `/rest/v1/`. Five
  requests; `menu_items` embeds its pours and options in one of them.
- **Nothing waits.** The choreography needs real DOM before it runs, so a board
  that arrives late is not slower — it is a board the animations ran past.
- **Empty is a failure, not new content.** A project that answers with zero
  rows is treated as unavailable. Rendering it would blank the site, which is
  the exact failure the seed floor exists to prevent.
- **Comparison is order-insensitive on object keys, order-sensitive on
  arrays.** The seed files are hand-ordered and the database returns rows in
  query order, so a raw `JSON.stringify` comparison reported "changed" on every
  first load and replayed the whole entrance cascade over a settled board.
  `stable()` in `data.js` sorts keys and leaves arrays alone; `test-live.mjs`
  imports the same function so it cannot pass under a looser rule.
- **The cascade replay.** `initMenu` now returns a teardown and is re-entrant:
  it disconnects the observer, removes the tab listener and the spacer, empties
  the tab bar, and restores the tab bar if a previous run removed it for having
  only one course. `render.js` fires `aromati:board-replaced` **only when the
  board actually changed**, so a copy-only edit does not replay anything.
  Build Your Own is *moved* rather than rebuilt, so its listeners survive —
  which is why the crêpe binding is now guarded with `data-opts-bound`.

**Done when:** the site renders correctly with the network killed, with
`localStorage` cleared, and with a deliberately broken Supabase URL. All three
are covered by `npm run test:live`, and the replay itself by
`npm run test:replay`, which drives real Chrome. What is still **not** covered
is whether the replayed cascade *looks* right — that it does not double-animate
and does not lose scroll position. Chrome can prove nothing leaked; it cannot
say the motion reads well. That stays on the browser pass.

**Item 2 of *What's still open* is now the live risk** — from here the database
is the source of truth, and nothing yet writes values back into the markup.

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

- **2026-08-01** — **The two faces that carry every word above the fold are
  inside `styles.css` as `data:` URIs**; the other four stay linked files with
  `font-display: optional`. Self-hosting alone was not enough, and the three
  intermediate attempts are worth knowing because each looked correct:

  | how the font was loaded | result |
  |---|---|
  | Google + `display=swap` | fallback paints, real font replaces it → the nav moved 2.83px on every navigation |
  | self-hosted, no `font-display` | browser hides the text until the font loads → a blink on every page |
  | self-hosted + `font-display: optional` | commits at the first paint, before the font pipeline finishes — **even for a `data:` URI** — so it rendered the fallback and stayed there, 121.91px instead of 119.08px, for the whole page load |
  | two faces inlined, no `font-display` | 119.08px at first parse and unchanged at load: real font, no wait, no swap |

  A `preload` closes the gap over https but is **ignored over `file://`**, where
  a `crossorigin` fetch has no origin to check — and this site is opened both
  ways, by double-clicking the HTML and from Cloudflare Pages. In a
  render-blocking stylesheet there is no gap to close in either.

  Costs ~120 kB of base64 in `styles.css` (68 kB → 213 kB), which is why it is
  two faces and not six. The other four are italics and extended characters,
  rarely on screen, and keep `optional` — never swapping matters more for them
  than which face they land on. Watch that the faces stay collapsed to one per
  file: Google emits one `@font-face` per weight and they all point at the same
  variable font, so emitting them separately writes the same 88 kB five times.
  That produced a 626 kB stylesheet before it was caught.

- **2026-08-01** — **The webfonts are self-hosted** (`assets/fonts/`, fetched by
  `tools/fetch-fonts.mjs`). Loaded from Google
  they arrive *after* the first paint, so every page was laid out twice: the nav
  wordmark measured 121.91px in the fallback and 119.08px after, and on the menu
  pages a re-wrapped lede moved the masthead's bottom edge — a hard colour seam
  across the page — by 31.5px.

  What was tried first and is *not* enough: the metric-matched fallback faces
  already in `styles.css` took the nav from ~12px of movement down to 2.83px,
  and `ch` → `em` on the masthead measures fixed the seam for the copy that
  ships. Neither reaches zero. `size-adjust` is one ratio for a whole face while
  individual letters differ, so a long headline still broke in a different place
  — measured at **97.9px** of movement with owner-length copy. There is no
  tuning that fixes the general case; the swap itself has to go.

  Trade-off taken: ~312 kB of woff2 in the repo and a step to re-run if the font
  stack changes, in exchange for no swap at all and one less third-party origin.
  `display=optional` was the alternative and was rejected: it also holds still,
  but a first-ever visit then renders in Georgia rather than Fraunces, and the
  serif *is* the identity of this site. Self-hosting keeps Fraunces on the first
  paint. It also matches what the project already does — `admin.html` loads the
  Supabase SDK from `vendor/`, never a CDN; the fonts were the last exception —
  and it removes two origins from the CSP that Phase 0 still owes.

  Both families are SIL Open Font License, which permits this; the licences sit
  beside the files. `npm run check:layout` fails if anything moves again, and
  was confirmed to fail by putting one page back on Google.

- **2026-08-01** — **The SQL is executed locally, against Postgres compiled to
  WebAssembly** (`@electric-sql/pglite`, a dev dependency). There is no Docker
  and no `psql` on this machine, so the alternative was to keep shipping SQL
  that had never run — which this file had already flagged as the riskiest
  thing about Phase 3.

  What it buys: `check-policies.mjs` reads the migration as *text*, so it is
  good at "every table has RLS enabled" and structurally blind to a missing
  comma, a constraint that cannot be satisfied, or a policy that grants more
  than it reads like it does. All three are now caught before the SQL reaches
  the project.

  What it costs, and it is not nothing: the shim is not Supabase. No PostgREST,
  no signature verification, no `storage` schema. `tools/supabase-shim.mjs`
  states all four differences at the top. **Green here does not retire the
  security advisor**, which is why Phase 3 step 7 is still marked ⛔ and not
  quietly folded into a passing test.

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
- **2026-08-01** — **One account, as Uptown does it.** The owner holds a single
  login and may share it. `admin_users` still works as an allowlist, so a second
  account is an INSERT and no migration, but no audit trail is built: no
  `changed_by`, no per-row history. Revisit if staff ever get their own logins —
  see *What's still open*, item 3.
- **2026-08-01** — **Hours stay per-day, and the owner is never asked.** The
  schema question is moot: the days already differ (Sun–Tue close 22:00,
  Wed–Sat 23:00). The flexible shape is built and the editor hides it — seven
  rows, an *apply to every day* button, a per-day *closed* box. Guessing wrong
  this way costs a slightly busier panel; guessing wrong the other way costs a
  migration and an editor rewrite on the first holiday.
- **2026-08-01** — **Date exceptions get a table in Phase 2**, even though the
  Phase 5 panel for them may come later. "Closed December 25" is not a weekday
  pattern and is the likeliest thing an owner actually wants to change. Cheap
  as SQL now, awkward to retrofit.
- **2026-08-01** — **Wine attributes stay free text.** Vintage remains a tag,
  region remains inside the description prose; both are editable strings. No
  `vintage INT`, no region enum. The menu already carries six price shapes — a
  structured field is one more thing the real menu can do that the schema
  cannot ("NV", "2019/2020 blend"). Accepted cost: no filtering by region or
  vintage, no enforced formatting. Neither exists on the site today.
- **2026-08-01** — **Hosting is Cloudflare Pages** (already live, used for
  preview deployments). Two consequences: a CSP is available via a `_headers`
  file, so the Phase 0 plan to ship one stands; and every branch gets a public
  `*.pages.dev` URL, so `admin.html` will be publicly reachable from the moment
  it exists — see *What's still open*, item 4.

---

## What's still open / needs input

0. **Headline length caps are provisional.** `tools/copy-labels.mjs` sets
   `maxLength` on the ten `data-split` headlines — 72 for the home page's h2s,
   32 for an inner page's masthead h1. Those numbers were reasoned about, not
   measured: they are sized to catch something obviously too long, not to find
   the point where the animation actually wraps. Check them during the browser
   pass and correct them; a cap that is too tight blocks a legitimate edit, and
   one that is too loose lets the layout break.
1. ⏸️ **The FAQ demo notice — DEFERRED 2026-08-01, awaiting the owner.**
   **Parked by decision 2026-08-01 — do not let it block anything.** `faq.html`
   still gets its nav, hours, contact details and page copy like every other
   page; `faq_entries` exists and is empty; the seed migration skips it. Pick
   it back up when the owner answers, not before.
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
3. **Staff logins would need an audit trail.** Settled for now as one shared
   account (see *Decisions*), which is why no `changed_by` column exists. If
   that changes, add the columns before the second account is created, not
   after — history that was never recorded cannot be backfilled.
4. **`admin.html` will be public on every preview deployment.** Cloudflare
   Pages gives each branch its own `*.pages.dev` URL, and the admin page ships
   with the rest of the site. Supabase auth is the real gate and RLS is the
   real defence, so this is not a hole — but it does mean the login page is
   reachable by anyone who guesses a preview URL, and that the anon key is
   readable there. Decide before Phase 5 whether to put Cloudflare Access in
   front of previews (free tier covers it) or accept it. Either way the RLS in
   Phase 2 has to be right on its own merits, because it is what is actually
   holding the door.
5. **Deployment is a direct upload — files are dropped into Cloudflare Pages
   as-is, with no build command and no `dist/`.** Confirmed 2026-08-01. This is
   the right setup and should stay: the source tree *is* the site, which is the
   same property that makes `file://` work. Two things follow.
   - `vite.config.js` and `npm run build` are local preview only. Nothing
     deployed depends on them. Keep the build honest anyway — a broken build
     that nobody notices is how the last one stayed broken.
   - **Upload the site files, not the repo.** `node_modules/`, `tools/`,
     `memory.md` and `.git/` have no business on a public host. Whatever is
     dragged in gets served — there is no ignore file protecting this.

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

- **2026-08-01 — the first RLS suite was green and proved nothing, twice over.**
  Worth writing down because both mistakes look like passing tests.

  *One.* It asserted a stranger could not run
  `update menu_items set price = '999'` — with no `where`. Nobody can run that:
  setting a flat price on all 84 rows gives the priced-by-size items two shapes
  at once and trips `menu_items_one_price_shape`. The refusal had nothing to do
  with RLS, and the test would have kept passing with every policy deleted.
  Fixed structurally rather than by patching the statement: every write is now
  run three times, same SQL, as owner / stranger / logged-out. The owner column
  is what proves the statement is executable, so the other two mean something.

  *Two.* The shim's `auth.uid()` did `''::json` when no JWT was set, which
  **raises** rather than returning null. A raising `auth.uid()` makes every
  policy calling it error out, and an error is indistinguishable from a
  refusal — so *every* logged-out check passed for the wrong reason. It was
  caught only by `test-db-guards.mjs` putting a real hole in and nothing
  noticing. Auth shims must fail closed, not fail loud.

  The lesson is the one the font work already taught: a checker that has never
  been seen to fail is not evidence. Both harnesses have a mutation test now.

- **2026-08-01 — the build was shipping a site with no JavaScript at all.**
  Worse than the recorded "drops 4 pages": there was no `vite.config.js`, so
  Vite built one entry *and* copied no scripts, because it only processes
  `<script type="module">` and ours are classic on purpose. Every `src` in
  `dist/` pointed at a file that was never written. The build printed
  "✓ built" throughout. Now fixed, and the copy step asserts every referenced
  script reached `dist/` — this failed silently for the whole life of the
  project, so it needed to become loud rather than merely correct.
