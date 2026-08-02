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
own `README.md` was exactly that stale until Phase 8** — it described the
pre-CMS site, said the fonts came from Google, and told the reader that content
changes needed a developer. Rewritten 2026-08-02.

Three files now describe this project and they are for three different readers,
which is the only reason there are three:

| | for | says |
|---|---|---|
| `README.md` | the next developer | what the site is, how the data flows, what must not be broken |
| `client-notes.md` | the owner | how to edit the site, in the owner's language, with no jargon in it |
| `memory.md` | whoever is building | the plan, the reasoning, the phase history, every decision and why |

`check-memory.mjs` guards this file. Nothing guards the other two, so when a
fact moves, ask which of the three readers it was true for.

Modelled directly on the Uptown Coffee Co. CMS build (`Z:\cs lock\uptown
coffee - kimi`), which is the reference implementation for this project. Where
something here says "same as Uptown", that means: go read that code and port
the decision, don't re-derive it.

---

## Current phase / status

**Phases 1–8 done bar two parked items — the build is finished.** What is left
is Phase 9, and every row of it needs a person, a browser or the owner's
password. Branch `phase1-content-as-data`, not merged: hold the merge until the
browser pass on the choreography, since jsdom cannot run it and it is the
likeliest thing to have broken. The editor's live line-count warning is on that
pass too — nothing in `npm test` has layout in it, so no harness can say whether
the number it reports is the right one. Phase 6 adds one more of the same kind:
whether a photograph the owner uploads looks right in the space it lands in.

The two documents a reader outside this file needs are current as of
2026-08-02: `README.md` for the next developer, `client-notes.md` for the owner.

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
- `supabase/migrations/20260801000300_advisor_fixes.sql` — Phase 3 step 7, the
  advisor's five findings answered one at a time. One is fixed (Supabase's own
  `rls_auto_enable()` was executable by `anon`); three are deliberate and are
  argued in writing rather than silenced, chiefly `admin_users` having RLS on
  with no policies, which is the design and not an oversight; one is a dashboard
  setting no migration can reach. A linter that is wrong for this project gets
  an answer, not a suppression.
- `tools/copy-labels.mjs` — the one hand-written file in the copy pipeline. A
  key is not a name, and the generator refuses to run if the labels and the
  data disagree by even one field.

Also done — **Phase 5: the editor**:
- `admin.html` / `admin.css` / `admin.js` — gate → tabs → panels → savebar.
  Five panels: **Words** (all 62 copy fields, grouped by page and section),
  **Hours** (the seven days, plus holidays and one-off dates), **Contact** (the
  settings, grouped by the `sort_order` band the database already gives them,
  so a setting added by a later migration lands somewhere sensible with no
  change here), **Menus** (three pages, sections and items, search and
  per-section collapse) and **FAQ** (still carrying the notice; see open item
  1).
- **Nothing is live until *Save changes*.** Two copies of every row — what the
  database last confirmed, and what the owner is looking at — so "changed" is
  *derived* rather than tracked, and an edit typed and typed back is not a
  change anybody has to remember to un-flag.
- **A save is a sequence, not a transaction.** Deletes first and children
  before parents, then inserts and parents before children (a new item's
  `course_id` does not exist until its section's insert comes back), then
  updates. Each write that lands advances the baseline as it lands, so a
  refusal halfway leaves an editor telling the truth: what saved is saved and
  stops being marked, what failed stays marked, and the database's own sentence
  is repeated rather than paraphrased.
- **The wording belongs to the database.** Every message about a badly-formed
  setting exists in `admin.js` word for word as it exists in the migration's
  `raise exception`, so the owner is told before the save rather than after.
  `tools/test-admin.mjs` reads both files and fails in **either** direction — a
  rule added to the SQL and not to the editor is as much of a drift as the
  reverse.
- **`vendor/supabase.js`** — the SDK, checked in at 2.111.0 rather than pulled
  from a CDN. `admin.html` is the page holding the owner's session token; a
  script tag pointing at someone else's server there is a standing offer to
  read it. `script-src 'self'` makes that enforced rather than intended.
- **The headline check measures rather than counts.** See Phase 5 below and
  *Deviations*.

Also done — **Phase 6: the photographs**:
- **A slot is a position, not a picture.** 29 places on the five pages where a
  photograph goes, keyed by where they are rather than by what is in them. The
  same file fills two of them — `georgian-salad.jpg` is in the photo strip and
  in the gallery, described differently in each — and those are two decisions
  rather than one duplicate.
- **The database stores an override and nothing else.** `storage_path` is null
  on all 29 rows to start with, and null means "the photograph in the markup".
  So a project with no uploads renders exactly the site in git, a page with no
  JavaScript shows the right pictures, and there is no state in which the site
  is waiting on a bucket to look correct.
- `tools/photo-slots.mjs` — the slot table: name, owner-facing label, and
  whether it is decoration. Read by the extractor *and* by the SQL generator, so
  29 names exist once.
- `tools/extract-photos.mjs` — stamps `data-photo="…"` onto every content
  `<img>` and writes `data/seed-photos.js` from the same pass, the same
  arrangement as `extract-copy.mjs`. It refuses an image whose alt is empty
  without the slot table saying it means to be: `""` and "not written yet" are
  identical to a screen reader and only one of them is a choice.
- `tools/gen-photo-sql.mjs` → `supabase/migrations/20260801000400_photos.sql` —
  the 29 rows, the `is_decorative` column, the corrected alt rule, the trigger
  that stops a slot being renamed, and the bucket with its limits. Generated, so
  it reviews as a diff; `npm run check:photosql` fails if it stops matching.
- **Decoration is not a missing description.** The original table said "a
  photograph with a file must have alt text", which is right for a photograph
  and wrong for the five backdrops that sit behind a scrim with
  `aria-hidden="true"`. Forcing a description onto those would have a screen
  reader announce the wallpaper. The rule is now "content, with a file, needs a
  description" — and *which* slots are decoration is the markup's business, so
  the flag is protected by the same trigger that protects the slot name.
- **The element and the slot are not the same thing.** The home page's photo
  strip scrolls forever by holding two identical groups; its nine photographs
  are drawn eighteen times, and the second nine are `aria-hidden`. An override
  reaches every drawing; a description reaches only the ones that are content.
- **Four things happen to a picked file, all in the browser, before anything is
  sent:** HEIC is refused in words that say how to fix it on the phone, the EXIF
  rotation is applied to the pixels, it is scaled to fit 2000px, and it is
  re-encoded as webp. See *Deviations* for why the rotation is *checked* rather
  than trusted.
- **Files go before rows, and the sweep goes last.** A row naming an object that
  is not there yet is a broken image for as long as the upload takes, and
  permanently if the upload then fails. The photograph it replaced is deleted
  after the whole save has landed — never speculatively, or a save that fails
  halfway has deleted the picture the row still points at.
- **Nothing is uploaded until Save.** Picking a file decodes and re-encodes it
  and shows it, and that is all; Discard throws it away and the bucket never
  hears about it. This is the answer to concern 11 for the common case — the
  orphan that remains is the *replaced* photograph, and that one is swept.
- `tools/test-photos.mjs` and eleven new sections in `tools/test-admin.mjs`;
  `img-src` on both policies now names the storage origin, checked by
  `check-csp.mjs`.

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

### The twenty-six harnesses, and what each is for

`npm test` runs all twenty-six. The two font ones run **first**: they are the
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
- `tools/test-db-guards.mjs` (`npm run test:dbguards`) — puts eight silent
  database mistakes back (RLS off a table, `using (true)` where `is_owner()` was
  meant, the allowlist opened, `is_owner()` granted to `anon`, the price-shape
  constraint relaxed, the photo bucket's write policy opened, the photograph
  description rule dropped, the bucket created with no size or type limit) and
  requires the harnesses above to fail *and name which one*.

  Number seven took two attempts and the second one is the lesson: removing the
  description trigger alone changed nothing, because the CHECK constraint still
  refused the row — so the mutation "passed" while proving only that the *other*
  half worked. Both layers have to go. Same shape as the allowlist mutation,
  which needed the missing policy *and* the revoked grant, and the same rule
  behind both: a mutation that defeats half a defence says nothing at all about
  the half it removed.
- `gen-seed-sql.mjs --check` — the committed seed migration still matches the
  seed data. Editing `seed-copy.js` and forgetting to regenerate would leave
  the site saying one thing and the database seeding another.
- `gen-photo-sql.mjs --check` (`npm run check:photosql`) — the same question for
  the photographs migration, which is generated from `tools/photo-slots.mjs` and
  `data/seed-photos.js`. It also refuses to generate at all if those two
  disagree about which slots exist: a slot with no seed entry inserts a row with
  no description, a seed entry with no slot is a photograph the editor never
  lists, and both are silent.
- `tools/test-photos.mjs` (`npm run test:photos`) — the photographs, in two
  halves. First the markup against the data: every slot has a place, every place
  has a slot, and the decorative flags agree in both directions — where "both
  directions" matters, because a slot the data calls decoration must be
  decoration everywhere it is drawn, while the reverse is deliberately not true
  (the strip's nine are described once and repeated silently). Then the real
  `render.js`, asked what it actually writes: that an override reaches the
  aria-hidden repeat too, that a description does not, and that six kinds of
  `src` that are not `https://` are all refused — preceded by a control proving
  a good one is written, because six assertions about a refusal are all
  satisfied by a renderer that does nothing.
- `tools/check-live-project.mjs` — the same question as `test-live.mjs`, asked
  of the **real project over the real network** with the real key. **Not** in
  `npm test`: it needs a live project, and a check that fails on a train is one
  people learn to skip. Two halves. It compares every row the site reads against
  `data/seed-*.js` through `data.js`'s own `stable()` — which is how the lost
  no-break spaces were found, and how drift will be found once the owner starts
  editing and the seed files become the *stale* offline fallback (open item 2).
  And it tries six writes a defaced site would need, requiring each to be
  refused over HTTP rather than in SQL, where `set role` makes it far too easy
  to prove the wrong thing.

  **It opens with a request that must succeed**, and that control is the point.
  Six refusals look identical whether the policies are holding or the key is
  dead, the origin is misspelt, or the network is answering everything with a
  401 — mutation-tested by breaking the key, which turned all six into confident
  passes and was caught by nothing else.
- `tools/measure-headlines.mjs` — a measuring tape, **not** in `npm test` and
  deliberately not a guard: it prints where each `data-split` headline takes an
  extra line, at three widths, and leaves the judgement to a person. See open
  item 0 for what its first run found.
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
- `tools/test-resilience.mjs` (`npm run test:resilience`) — the Phase 7
  Resilience rows, made permanent. `test-live.mjs` already covers what `data.js`
  *returns* when the network dies; this boots a whole page — real markup, real
  `render.js`, real `script.js` — and asks what a person would see, because a
  data layer that degrades perfectly into a renderer that throws is still a
  blank page. Six sections: the network dying with a good cache in
  `localStorage` (and the cache is deliberately *not* the seed, so "the cache
  rendered" and "the seeds rendered" cannot be confused); a wrong project URL on
  a first visit; a course with every item deleted; every course on the page
  deleted; five loads with the rows shuffled differently each time; and all five
  pages opened with no key at all.

  Two things in it are the test rather than decoration. **The shuffle** — five
  loads of identical input would prove only that a function is deterministic, so
  the rows, and the embedded pours and options, arrive in a different order
  every time and the board must come out identical to the character. And **the
  tab bar is compared against the same page with nothing removed**, not against
  a number: the question is not "are there seven tabs" but "did emptying a
  course cost it its tab".

  Mutation-tested four ways: never reading the cache, never rendering the board,
  never rendering the hours pill, and emptying the Visit table without refilling
  it. All four caught, each by the section that should have caught it. An
  earlier draft compared arrays with `===`, so every "nothing threw" check was
  unfailable — found by the sabotage run, and the reason the comparison now goes
  through `JSON.stringify`.
- `tools/page-boot.mjs` — **not a test.** The jsdom rig `test-resilience.mjs` and
  `test-hours-live.mjs` share: a real page, real `render.js`, real `script.js`,
  `fetch` under the harness's control and the clock stopped at a fixed
  Wednesday. Built once because two copies would drift and the drifted one would
  go on passing. It deliberately asserts *nothing* — a shared helper with
  opinions about what a good page looks like ends up deciding what its callers
  are allowed to ask.
- `tools/test-hours-live.mjs` (`npm run test:hourslive`) — the Phase 7 Hours
  rows. `test-hours.mjs` covers the *shapes* by injecting one week as
  `SEED_HOURS` and rendering, which hands `render.js` and `script.js` the same
  array by construction — so they can never be caught disagreeing. This serves a
  week from the database that shares **no time at all** with
  `data/seed-hours.js` (checked, as its first assertion: if a time matched, a
  consumer that never updated would pass by coincidence) and requires all five
  places the hours are printed to follow the rows.

  **It found the one real bug of the Phase 7 pass** — see Deviations, "the pill
  read the seed file". Also confirms the checklist's own note that "today's
  model hardcodes one opening time" is stale: seven distinct opening times
  render as seven table lines, seven footer lines and seven JSON-LD entries.
- `tools/test-menu-shapes.mjs` (`npm run test:menushapes`) — the Phase 7 Menu
  rows. `test-sql.mjs` proves all six price shapes can be *stored*; this proves
  they can be *drawn*, given rows in the shape PostgREST hands back. A shape
  that stores perfectly and renders as a bare `$` is still a broken menu, and
  nothing between the constraint and the page was looking.

  The one worth reading is the gapped size — an item sold small and not large.
  The blank is not a missing price, it is a statement, and it renders as an
  empty cell so the two-column grid stays aligned. What keeps a lone `$` off
  that cell is one line of CSS (`.mi__cell--none::before{content:none}`), so
  **both halves are checked**: the class `render.js` chooses, and the rule in
  `styles.css` that acts on it — because jsdom will not compute a `::before`,
  and a check that only read the class would go on passing after someone
  deleted the rule.

  It also covers the two things that only exist after the board has been
  *replaced*, which `test-replay.mjs` leaves open: it proves the tab bar is
  rebuilt correctly but never clicks a tab. So this filters a network-delivered
  board down to one course and back to All, and clicks a Build Your Own chip and
  the crêpe's disclosure row — the two hand-written blocks that are out of scope
  to build, which also makes them out of scope to break.

  Mutation-tested six ways (the `--none` class, the CSS rule, the spanning
  price, the priceless row's class, the filter, and Build Your Own being dropped
  on rebuild); all six caught.
- `tools/test-hostile-content.mjs` (`npm run test:hostile`) — every owner-typed
  field filled with something hostile, on all five pages. This is the "biggest
  one" from the Security section, made mechanical: stored XSS.

  The rule was already checked in four places and all four were partial —
  `test-copy.mjs` covers the copy renderer, `test-ordering.mjs` five ordering
  links, `test-photos.mjs` six image `src` forms, `test-rls.mjs` the database
  storing a script tag as text. **No menu field was covered at render time**,
  and the menu is where most of the owner's typing goes. So this poisons item
  names, tags, descriptions, course headings, tab labels, pour labels, option
  names, every copy field and the free-text settings at once, then asks four
  things of the result: no script element the page did not serve, no `on*`
  attribute anywhere, no `href`/`src` with an executing scheme, and a JSON-LD
  block that still parses and still describes a café.

  **Every field gets every payload, one payload per pass.** The first version
  dealt the six payloads round the fields, which makes coverage a lottery —
  whether `javascript:` lands on the one field that becomes an href depends on
  how many menu items there are. Six passes, no luck.

  **And the control is per region.** All four assertions are satisfied by a
  renderer that draws nothing, so each pass also requires the payload to be
  present as readable text — and counted separately in the board, the copy
  elements and the footer. A single page-wide total was the first attempt and it
  passed with the entire menu board disabled, because the copy fields alone kept
  it above the threshold.

  One trap, written into the file: `renderContact` finds its targets by what
  they already are (`a[href^="mailto:"]`, `a[href*="instagram.com"]`), so a
  sabotage that makes it write a malformed href also destroys the selector that
  found the element. Two sabotages went uncaught for that reason and neither was
  a gap — neither field can produce an executing href at all.
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
- `tools/test-admin.mjs` (`npm run test:admin`) — **the editor, driven.** Loads
  the real `admin.html` and the real `admin.js` in jsdom against a fake project
  that records every request instead of sending it, which makes "what would
  this have written?" answerable exactly. Covers the gate (including an account
  that is not the allowlisted owner, signed straight back out), that a save
  sends **only** the columns the owner owns, that a save is refused with the
  database's own wording, the insert order when a new item goes into a new
  section, and a refusal halfway through a save. Two of its checks are
  load-bearing in a way that is easy to miss: the `innerHTML` scan is run
  against a deliberately sabotaged copy of the file and fails if it does *not*
  notice, and the "no forbidden column was sent" assertions are preceded by a
  control that both edits really were sent — a save that sent nothing satisfies
  every one of them.

  Phase 6 added eleven more sections to it, covering the only panel that sends
  something other than a row. jsdom has no image decoding and no canvas, so what
  is faked is exactly the *browser's* work — decoding a file to pixels, encoding
  pixels to webp — and what is real is admin.js's: reading the EXIF tag out of
  the bytes, deciding whether the browser had already applied it, the size
  everything is scaled to, and the transform chosen. The JPEG those tests read
  is written byte by byte in the harness rather than checked in as a fixture,
  because the whole point is to control the orientation tag and a fixture whose
  tag nobody can see is a fixture nobody can reason about.
- `tools/check-vendor.mjs` (`npm run check:vendor`) — the vendored SDK is still
  the published artifact. Three facts, none of them in the same place: the
  bytes on disk, the sha256 written down in `vendor/README.md`, and the version
  in `package.json` and `node_modules`. Any one can be changed by hand; changing
  one alone is caught. Also refuses a `<script src>` on `admin.html` pointing at
  another origin, which is the single change that would undo the whole point of
  vendoring.

  This is why `.gitattributes` exists and has one line in it. Windows git
  stores LF and hands back CRLF, so a fresh clone would have produced a file
  with different bytes, a different digest, and a check failing in exactly the
  way it fails when someone has tampered with it. `vendor/supabase.js -text`
  turns that off for the one file whose bytes are load-bearing. Verified by
  checking the file out to a scratch directory and hashing what came out.
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

**Phase 3 is done.** The project is `yofoiqgknsqzsuwtlqvh`; every step ran
against it on 2026-08-01 through the Supabase MCP server, which loaded once the
session was restarted.

| Phase 3 step | state |
|---|---|
| 1 create the project | ✅ done |
| 2 disable public signup | ✅ done — **verified**, not assumed: `POST /auth/v1/signup` with the public key answers `422 signup_disabled` |
| 3 create the owner account | ✅ done — `a69c4370-3872-4b61-aba2-4049e34f9549`, and it is the only row in `auth.users` |
| 4 apply the migrations | ✅ applied |
| 5 allowlist the owner | ✅ applied — one row in `admin_users` |
| 6 seed the content tables | ✅ applied — 17 sections, 84 items, 26 pours, 7 options, 62 copy fields |
| 7 run the security advisor | ✅ run; answered in `20260801000300_advisor_fixes.sql` |

Verified live afterwards, not inferred from the SQL having run: the owner writes
where a signed-in stranger writes 0 rows from the *same* statement; anon is
refused at the grant layer before RLS is even consulted; `admin_users` is
unreadable and un-insertable even as the owner; and the rename guard raises its
plain-language message intact.

The SQL had already been proven locally before any of this. That mattered,
because this file used to warn the first apply should be expected to fail. It
did not fail, here or there.

**Two things the local proof could not have caught**, both found only against
the real project — see *Deviations*: a no-op `revoke` that ran clean and changed
nothing, and two no-break spaces lost in transcription.

Still worth doing in either order — read `POLICIES.md` and say whether it
describes what you meant, and do the browser pass.

**Leaked password protection: decided, not outstanding.** 2026-08-01 — it is a
Pro-plan feature and this project is not paying for one, so the advisor will go
on flagging it forever and that is the answer, not a task. What it would have
done is check a new password against HaveIBeenPwned when the owner changes it.
What replaces it is the thing that was always doing most of the work anyway: one
account, signups off, and a password that is not reused. Written down here
because an unexplained WARN in the advisor is the kind of thing that gets
"fixed" twice by two different people and then quietly ignored by a third.

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

- **Build Your Own Breakfast** (`#build`, [script.js:787](script.js#L787)).
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
   [script.js:925](script.js#L925) reading `SEED_HOURS`. What was there:
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
| `info@aromatinyc.com` | footer + JSON-LD | |
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

**Superseded by Phase 6 — read `tools/photo-slots.mjs`.** What was counted here
at plan time was files: 27 distinct `assets/` paths across the 5 pages. What the
CMS actually needed was *positions*, and there are 29 of them, drawn 38 times.
The difference is the whole model: one file fills two slots where it appears in
two sections, and nine slots are drawn twice because the photo strip repeats
itself to scroll forever.

Still true, and still worth knowing: `assets/web/` holds the hand-optimised
`.jpg` the site actually loads, two `-outpainted.png` files are wider crops, and
the `assets/*-enhanced.png` originals are large and are **not** what the site
loads — nothing points the CMS at them.

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
   ([script.js:925](script.js#L925)) reads `SEED_HOURS` and learns to handle
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

### Phase 3 — Supabase project + apply. **First phase needing the DB.** ✅ done

All seven steps ran against `yofoiqgknsqzsuwtlqvh` on 2026-08-01 — see *Current
phase / status* for the per-step table and what was verified live afterwards.
Steps 1–3 were done by hand in the dashboard; 4–7 through the Supabase MCP
server.

Step 6's seeding was already generated and committed:
`supabase/migrations/20260801000100_seed_content.sql`.

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
but not write it. ✅ Both hold. The advisor's remaining findings are answered in
`20260801000300_advisor_fixes.sql` rather than fixed, with the reasoning in the
file; the read/write asymmetry is checked on every run of
`tools/check-live-project.mjs` rather than by hand once.

**One caveat on the migration history.** The files were applied by transcribing
them through MCP tool calls rather than by `supabase db push`, because the CLI
was not linked and linking needs the database password. So the project assigned
its own version timestamps (`20260801234339…`) instead of reusing the filenames,
and the names still match one-to-one. Prefer `db push` once the project is
linked — the transcription is exactly what cost two no-break spaces below.

---

### Phase 4 — The site reads from Supabase. ✅ done and live

`data.js` holds the fallback chain: `network → localStorage → SEED_*`.
`render.js` paints once, synchronously, from cache-or-seed, then repaints only
if the network came back with something genuinely different. `config.js` holds
the project URL and the publishable key.

**The key is in.** `config.js` carries the modern `sb_publishable_` key rather
than the legacy anon JWT: both work and `data.js` sends whichever is there as
both `apikey` and `Bearer`, but the publishable one rotates on its own and is
not a JWT, so it has no expiry date to be surprised by later. The legacy anon
key is still enabled in the dashboard and can be turned off — nothing here uses
it. `tools/check-live-project.mjs` confirms the round trip end to end: every
item, pour, setting, hour and copy field the live project returns is identical
to `data/seed-*.js`.

Running from the seeds with no key remains a supported state, not a broken one
— it is exactly what happens if the database is ever unpaid or deleted, and it
is what `file://` still does.

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

### Phase 5 — The editor. ✅ done

`admin.html` / `admin.css` / `admin.js`, plus `vendor/supabase.js`. Gate → tabs
→ panels → savebar. Panels: **Words**, **Hours**, **Contact**, **Menus**,
**FAQ**.

Everything the Uptown port asked for holds:

- Nothing live until *Save changes*; Discard reverts.
- Labels are the owner's words, never column names — they come from
  `site_copy.label` and `site_settings.label`, so the editor has no second copy
  of them to drift.
- Validation reports *problems* in plain language and blocks the save.
- A blocked save opens the collapsed card holding the offending field and puts
  the cursor in it. Every problem in the list is a button that does the same.
- Panel open/closed state survives a save, including for a row that was new
  when the save started and has a real id by the time it finishes.
- Long panels collapse by default; the menu panel has search across name,
  description and qualifier, and a match inside a collapsed section opens it.

**`admin.css` shares nothing with `styles.css` and loads no webfont.** The
nav-shift arrangement at the top of this file is fragile, has been broken twice
by unrelated work, and the surest way not to break it a third time is not to
touch it. The editor uses the system stack; it is a tool, not a composition.

**The headline check measures instead of counting.** The character caps are
still there as a hard backstop in `site_copy.max_length`, and the editor blocks
a save that exceeds one. But `tools/measure-headlines.mjs` had already found
that a character count is the wrong control — glyphs differ in width and lines
break at whole words — and named the right one: the rendered line count of the
real element. So the editor loads the real page into a hidden frame, puts the
candidate text into the real element, and counts line boxes with a Range, at
1280px and at 390px. No stylesheet is duplicated and no font metric is copied;
it is the page itself doing the measuring, so there is nothing to drift.

It **warns rather than blocks**, and says which width: "this takes an extra
line on a phone". Whether one extra line is a problem is a judgement about that
particular headline, which is the same conclusion the measuring tool reached
when it printed a report instead of failing a build.

That needed one deliberate change: the public pages went from
`frame-ancestors 'none'` to `'self'`. Clickjacking is an attack by a page on
*another* origin, which `'self'` still refuses; a same-origin frame can already
read and script whatever it framed. `admin.html` keeps `'none'`.
`tools/check-csp.mjs` now fails if the editor frames the site while the policy
forbids it — otherwise the frame loads nothing, the measurement silently never
runs, and the only symptom is a warning that stops appearing.

**What is not covered by a harness:** whether the line count it reports is
right. jsdom has no layout and the check needs a session, a server and a real
browser. `tools/test-admin.mjs` verifies the half that can be verified — that
every capped headline's `data-copy` hook exists on the page its row names and
carries `data-split`, so the frame will find an element at all. The rest is on
the browser pass.

**Still not exposed, by decision:** the crêpe options row (out of scope; the
item's panel says so and points at a developer), Build Your Own Breakfast (the
section can be moved on the menu, its contents cannot be edited), and the
photos, which are Phase 6.

---

### Phase 6 — Photos. ✅ done

All of it: bucket + policies, upload widget, client-side resize to webp, HEIC
rejected with a plain-language message, EXIF rotation corrected, `alt` required,
dimensions captured at upload, original kept for re-framing. See the status
section above for what was built; three things are worth writing down here
because they were decisions rather than steps.

**The slot list is markup, and it is checked as markup.** 29 positions across
five pages, stamped onto the `<img>` elements themselves and generated into the
migration from the same table. An image added to or removed from a page makes
`tools/extract-photos.mjs` stop, rather than silently re-numbering every slot
after it — which is the failure that would otherwise put the storefront in the
gallery and nobody would know why.

**Dimensions are stored and are not used for layout.** No `width`/`height`
attributes were added to the 38 images. The layout today is entirely CSS —
fixed containers, `object-fit: cover` — and adding intrinsic sizes to fix a
reflow nobody has reported would be a change to the look of the site made
blind, in the phase least able to check it. What the numbers *are* for is the
editor: it compares the shape of a new photograph against the one it replaces
and says so when they differ a lot, because the container does not change shape
and the difference is taken out of the picture as a crop. A warning, not a
refusal — the same reasoning as the headline check, and for the same reason:
whether a crop matters is a judgement about that photograph.

**What is not covered by a harness:** whether an uploaded photograph looks
right. Everything about the pipeline is testable and tested; how a particular
picture sits in a particular container is not, and it is on the browser pass.

---

### Phase 7 — Full test pass. **Done for everything a machine can answer.**

Worked the checklist below. Failures reported, not worked around — one real bug
in the site, one in a harness, one in the suite itself.

**What the pass found**

1. **`npm test` had been failing since `ac4615e`** — the email change never
   told `verify-phase1.mjs`, whose whole job is to notice a changed string.
   Found on the first command. The argument for running the whole suite rather
   than the part you touched.
2. **The open/closed pill never followed the database** — four of the five
   hours consumers did; the fifth read `SEED_HOURS`. See Deviations. The one
   real bug in the site.
3. **The Phase 7 rig was serving settings the site ignores** — three harnesses
   green while `renderContact` had never run. See Deviations. Found by a
   sabotage that should have broken something and did not.

**What it added** — five harnesses, all in `npm test`, all mutation-tested:
`test-resilience.mjs`, `test-hours-live.mjs`, `test-menu-shapes.mjs`,
`test-hostile-content.mjs`, and `page-boot.mjs` under them. Plus three size
refusals `test-sql.mjs` was missing. 26 harnesses now.

**What is left**, and it is only what a machine cannot answer: four browser
rows (height-lock and scroll across a filter, a lone course centring, long item
names, the photograph rows), and three live-project rows (`signUp()`, the 10 MB
upload, the renamed `.exe`). Each is marked in the checklist with why.

---

### Phase 8 — Handoff. ✅ done 2026-08-02

> ⚠️ Uptown's README still says *"Status: this is the demo build — pre-CMS"* and
> *"no schema, migrations, or storage buckets exist yet"* — seventeen commits
> and eight migrations later. That is the exact failure this phase exists to
> prevent. Doc drift is the thing that makes a handoff dangerous.

**`README.md`, rewritten.** It described a site where the menus lived in the
markup, the fonts came from Google over https, `dist/` was a stale artifact to
be deleted, and "editing any of the following needs a developer today". Every
one of those is now false, and the font line was worse than stale: it named as
normal practice the exact thing the ⛔ section at the top of this file exists to
prevent. What it says now: the `network → localStorage → seed` order and why
nothing waits on the network, where each kind of content lives and which table
and seed file it is in, the six price shapes, the editor, the database rules,
the four harnesses that are deliberately *not* in `npm test`, the deploy (a
direct upload — upload the site files, not the repo, and `_headers` has to be in
the drag), and the invariants, with the nav-shift table first.

**`client-notes.md`, written.** The owner's guide, in the owner's language:
signing in, the one thing to know about saving, a section per panel, and the
three things that are easy to get wrong — prices without a `$`, the phone as ten
bare digits, a tall photograph in a wide space. It says plainly what is *not*
editable and that this is deliberate, and it carries the FAQ question the owner
still owes an answer to. It deliberately does not duplicate the editor's own
help text, which is already written in the same voice.

Two things in it are there because they are true and nobody would otherwise
know: the site keeps working with the database gone, and **an uploaded
photograph is the only thing that is not also in git** (open item 2). The second
is the "Phase 8 handoff note, not a tool" that item asks for, and it is now in
both documents.

**The seeds were checked against live and needed no refresh.**
`check-live-project.mjs`, 2026-08-02: all five comparisons identical. The owner
has not edited anything yet, which is the only reason this is a no-op — the
mechanism to do it when it is not a no-op still does not exist, and that is
open item 2, not this phase.

**Doc drift found in this file while rewriting the other two**: the heading
*"The twenty-two harnesses"* had been sitting over a list of twenty-six for a
whole phase. Nothing was missing and no name was wrong — only the first four
words, which are what someone skimming reads. `check-memory.mjs` grew an eighth
check for it, counted from `package.json`'s own `test` script and holding
`README.md` to the same number in digits; mutation-tested three ways (the wrong
word here, the wrong digits there, a twenty-seventh harness added with neither
document updated).

---

### Phase 9 — The owner's pass, and the merge. ← *next*

Everything left needs a person, a browser or the owner's password. Nothing here
is blocked on code.

- **The browser pass** — the four rows the Phase 7 checklist marks ⚠️, plus the
  seven photograph rows and the editor's live line-count warning. jsdom has no
  layout; this is the part no harness in the project can reach.
- **Two defects in the headline editing path, found writing the owner's guide
  2026-08-02.** They have to be fixed together, and they belong with the
  browser pass above because only a browser can judge either.

  1. **A line break cannot be typed into a headline.** `renderCopyPanel`
     ([admin.js:555](admin.js#L555)) gives a field a textarea only if its value
     already contains a newline or runs past 90 characters. Every one of the
     ten `data-split` headlines is shorter than that, so every one of them is a
     single-line `<input>`, which cannot hold a newline at all. The panel's own
     intro says "a line break in a box below becomes a line break on the page",
     and `seed-copy.js` documents `"\n"` as one of the two things the owner can
     write — but in the boxes where it matters most it cannot be typed. It is
     also the remedy open item 0 settled on: when a headline takes an extra
     line, an explicit break is what moves the wrap.

  2. **And the measurement would be wrong the moment it could.**
     `runMeasure` ([admin.js:1972](admin.js#L1972)) measures by writing the
     candidate into the real element with `textContent` and counting client
     rects. `render.js` turns `"\n"` into a `<br>`; `textContent` collapses it
     to a space. So a headline with a deliberate break would be measured as
     though it had none, and the warning would say "still fits" about a line
     that wraps. Today this is unreachable because of (1) — **which is exactly
     why fixing (1) alone would be worse than fixing neither.** The two defects
     have been masking each other.

  The fix for (2) is to measure through the same construction `render.js` uses
  rather than a second one, since a duplicated vocabulary is one that drifts.
  Not done here: it is editor behaviour, it can only be judged by eye, and
  shipping an unverifiable UI change in the handoff commit is how a handoff
  goes wrong.
- **The three live-project rows** — `signUp()` from a console, a 10 MB file and
  a `.exe` renamed `.jpg` posted at the bucket with the owner's token.
- **The FAQ answer** (open item 1). Everything else is built and waiting on it.
- **Read `supabase/POLICIES.md`** and confirm it matches intent.
- **Merge `phase1-content-as-data` to `main`** — held on the browser pass, which
  is the only reason it is still held.
- Then re-run `check-live-project.mjs` once a photograph has been uploaded, so
  the bucket-listing check stops reporting `skip`.

---

## Phase 7 test checklist

Ported from Uptown's, plus the Aromati-specific rows.

A ticked row means **a harness answers it and is in `npm test`**, not that it
was tried once. The rows that stay open are the ones a harness genuinely cannot
answer: they need a browser's layout, a live project, or the owner's eyes. Each
one says which.

**Resilience** — all six: `tools/test-resilience.mjs`
- [x] Kill the network after load, reload — seed data renders, hours still tick
- [x] Break the Supabase URL — site renders, no console errors visible to a user
- [x] Delete every item in a course — course renders an empty state, no crash
- [x] Delete every course on a page — page renders, tabs do not throw
- [x] Reload 5× — course and item order is stable *(the rows are shuffled
      differently on each of the five loads; identical input would prove only
      that a function is deterministic)*
- [x] Open every page from `file://` — complete site from seed

**Hours** (all five consumers must move together) — `tools/test-hours-live.mjs`
- [x] Change hours in the editor → live status, Visit table, footer prose,
      mobile-menu prose and JSON-LD all update — **this one failed.** The pill
      read `SEED_HOURS`; see Deviations. Fixed, and mutation-tested four ways.
- [x] Boundary: exactly at opening minute (closed → open), exactly at closing
      minute (open → closed — the logic is `>= open && < close`, so the closing
      minute reads as closed) — asked again here against hours that came from
      the *database*, which is a different path from `test-hours.mjs`'s
- [x] A day marked **closed** — status text, the "opens tomorrow" rollover from
      the previous day, and the table row
- [x] Different opening times per day — ~~today's model hardcodes one~~ **the
      note was stale**: seven distinct opening times render as seven table
      lines, seven footer lines and seven JSON-LD entries

**Menu** — `tools/test-menu-shapes.mjs` except where noted
- [x] Each of the six price shapes renders correctly after a round-trip
- [x] A sized item with a blank size renders as "not offered", not `$` —
      checked in both places it can go wrong: the class `render.js` picks, and
      the rule in `styles.css` that acts on it
- [x] Three sizes on a course is **rejected** (CSS grid is 2 columns) —
      `test-sql.mjs`, together with the empty array and the unnamed column,
      which were equally untested
- [x] Tab filter behaves after a data refresh
- [ ] Height-lock and scroll correction after a data refresh — ⚠️ **needs a
      browser.** jsdom has no layout, so the numbers this is about do not exist
      in it. `test-replay.mjs` drives real Chrome and covers the spacer count;
      the scroll position across a filter is still eyes.
- [ ] A course alone on its row still spans and centres — ⚠️ **needs a
      browser** ([script.js:478](script.js#L478))
- [x] Build-Your-Own and the crêpe row still work, untouched — clicked, after
      a rebuild of the board around them

**Design integrity**
- [x] An over-long `data-split` headline is refused with a plain message —
      `test-admin.mjs`
- [ ] Long item names / descriptions on the public site — ⚠️ **owner's test**
- [x] A photo with no alt text blocks the save — `test-admin.mjs`, and the
      database refuses it twice over (`test-sql.mjs`)

**Photographs** — the parts a harness cannot answer
- [ ] Upload a real photograph and look at the page it lands on
- [ ] Upload one taken with the phone held sideways — it must not arrive rotated
- [ ] Upload a portrait photograph into a landscape slot: the shape warning
      appears, and the crop is what the warning says it will be
- [ ] Replace a photograph twice, then check the bucket holds one pair of files
      for that slot and not three
- [ ] Pick a file, then Discard — the bucket must be untouched
- [ ] With a photograph uploaded, re-run `check-live-project.mjs`: the bucket
      listing check stops skipping and has something to prove

**Security** — see the section below for the full list
- [x] Logged out, attempt to read admin data — blocked. `test-rls.mjs`, and
      again over the real network in `check-live-project.mjs`
- [x] Logged out, attempt to write any content table — blocked. Same two, and
      the live one covers seven writes a defaced site would need
- [ ] `signUp()` from the browser console — rejected. ⚠️ **live only**: it is a
      dashboard setting, so nothing in the repo can prove it. Disabled on
      2026-08-01; needs confirming from a browser console once.
- [x] A second, non-allowlisted account can log in but cannot write anything —
      `test-rls.mjs` runs every check as three actors, and "a signed-in
      stranger" is exactly this account
- [x] `<script>alert(1)</script>` as an item name — renders as literal text.
      `tools/test-hostile-content.mjs`, which puts six payloads through every
      owner-typed field on all five pages; `test-rls.mjs` covers the storage
      half
- [ ] Upload a 10 MB file — rejected at the bucket, not just in the client.
      **The only way to test this is live**: the editor resizes everything to
      2000px first, so it never sends one, and the shim in `test-sql.mjs` has no
      upload endpoint to enforce a limit. Post one straight at
      `/storage/v1/object/site-photos/` with the owner's token.
- [ ] Upload a `.exe` renamed `.jpg` — rejected by MIME type. Same note: the
      bucket is where this is decided, and the bucket is only real in the
      project.

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

**Done, Phase 6.** `site-photos`, public read, 3 MB, `image/webp` +
`image/jpeg` + `image/png` — the last two because the untouched original is
kept beside the resized copy and arrives in whatever the camera produced. **No
`image/svg+xml`, ever**: it is the one image format that can carry a script, and
this bucket is served publicly from the site's own origin, so an SVG in it would
run there. `test-sql.mjs` fails if it is ever added. Writes and listing are
`is_owner()`; `anon` has neither, so a stranger can fetch a photograph by its
URL — which is the point — and cannot ask what else is in there.

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
backup and should be refreshed at each release. Beyond that, a periodic
`pg_dump` — or accept that the git seeds are the recovery floor and write that
down so nobody is surprised. **Written down, Phase 8**: both `README.md` and
`client-notes.md` say the git seeds are the floor, and that the one thing they
do not cover is an uploaded photograph. Refreshing them still has no tool —
open item 2.

**11. Orphaned storage objects.**
Deleting an item does not delete its photo. Needs a cleanup pass scoped to one
bucket, and it must run *after* a successful save, never speculatively.

**Mostly answered, Phase 6.** The common case is gone rather than cleaned up:
nothing is uploaded until Save, so a file that is picked and then discarded
never reaches the bucket at all. What does need sweeping is the *replaced*
photograph, and that is swept — after the whole save has landed, never before,
because a delete that runs first is a delete that survives a save which then
failed. A failure in the sweep itself is a line in the console and nothing more:
an unreferenced object costs a few hundred kilobytes and there is nothing the
owner could do about it.

What is left: a file uploaded by a save that then failed at a later step. It is
in the bucket and no row names it. Rare, harmless, and not worth a background
job — but it is the reason the bucket will never be provably tidy.

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

0. **Headline length caps — measured 2026-08-01, and a character count turns
   out to be the wrong control.** `tools/measure-headlines.mjs` grows each of
   the ten `data-split` headlines a word at a time in real Chrome, at 1600,
   1024 and 390px, and records where it takes an extra line.

   The finding is not "the numbers are wrong", it is that **a character count
   is a poor proxy for the thing it is meant to prevent.** `cafe.headline`
   ships at 28 characters on one line while the measured ceiling for that slot
   is 23. Both are true, and the gap is the point: character count does not
   track rendered width. Glyphs differ — "Wine Bar" and "khinkali" are the same
   eight characters and not the same width — and lines break at spaces, so the
   last word fits whole or moves whole. On top of that the copy vocabulary lets
   the owner place an explicit line break, which moves the wrap more than any
   length limit does.

   Read the tool's ceiling column as a **word-quantised lower bound**: the last
   whole word that fitted, so the true ceiling sits between it and the next
   word boundary. Useful for comparing slots, wrong for setting a precise cap.
   Nine of the ten caps "fail" against a straight character measure, which is
   itself a good sign that the measure is not the constraint.

   **Nothing was changed on the strength of it.** The quantity that actually
   describes the constraint is the rendered line count of the real element, and
   the place to enforce that is the Phase 5 editor,
   which can measure the live element as it is typed — the same way it will
   check contrast and alt text. The existing character caps stay as a coarse
   backstop against something absurd.

   ✅ **Built, 2026-08-01.** The editor loads the real page into a hidden frame,
   puts the candidate text into the real element and counts line boxes with a
   Range, at 1280px and 390px, as the owner types. It warns and names the width
   — "this takes an extra line on a phone" — rather than blocking, because
   whether that matters is a judgement about that headline. The character caps
   stayed exactly as they were. What is *not* settled is whether the warning
   reads well in practice; that is on the browser pass, since no harness in this
   project has layout in it.

   Also worth knowing before sizing anything: 390px is where everything wraps.
   Sizing every cap to hold there is harsh; the alternative is to accept an
   extra line on a phone. That is a design call, which is why the tool prints a
   table and does not fail a build.
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
   - Phase 5's FAQ panel exists and works — it can add, edit, reorder, hide and
     delete questions — but it opens with the same notice, saying the eighteen
     questions have deliberately not been moved in and that anything added there
     goes live on the site as soon as it is saved. Building the panel commits to
     nothing; transcribing the placeholder copy would.

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

   **Phase 6 added to this rather than solving it, and did so knowingly.** The
   photographs are the same arrangement — the built-in picture and its
   description are in the markup, the database holds an override — so an edited
   description makes `data/seed-photos.js` stale in exactly the same way, and
   `check-live-project.mjs` now compares them and will say so. One thing about
   the photographs is worse and is worth stating plainly: **an uploaded
   photograph is the only content in this project that is not in git.** Its
   description can be written back into the markup; the file itself lives only
   in the bucket. If the project is lost, the site falls back to the
   photographs it shipped with, which is a correct site — but it is not the
   site the owner had. Anything better means downloading the bucket, which is a
   Phase 8 handoff note, not a tool. **Written, 2026-08-02** — `README.md`
   ("Backing up") and `client-notes.md` both say it, the second in the owner's
   language and next to the advice to keep the originals.

   **The rest of this item is still open after Phase 8, and it is worth being
   exact about why.** Phase 8's brief was "refresh the seed arrays from live
   data", and on 2026-08-02 that was a no-op: `check-live-project.mjs` reports
   all five comparisons identical, because the owner has not edited anything
   yet. So nothing forced the mechanism into existence and none was built. The
   shape of the problem has not changed: the arrow runs database → markup →
   extractors → seeds, and it is the *first* step that does not exist. Two
   things a future session should know before starting it. The seed files are
   not uniformly generated — `seed-menu.js`, `seed-copy.js` and `seed-photos.js`
   come from the extractors, while `seed-hours.js` and `seed-settings.js` are
   hand-authored around prose that explains them, so a regenerator that rewrites
   all five destroys the second pair. And a refresh that touches `seed-copy.js`
   without touching the markup will fail `verify-phase1.mjs`, correctly: a
   deliberate wording change is supposed to require an `INTENDED` entry. That is
   the design working, and it means the write-back tool has to produce those
   entries too, or hand the person a list to paste.
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

- **2026-08-01 — a `revoke` that ran clean and did nothing.** Applying the
  advisor fixes, `revoke execute on function public.rls_auto_enable() from anon,
  authenticated` succeeded and left `anon` holding EXECUTE. The grant was never
  to those roles: the ACL read `{=X/postgres, …}`, and a bare `=` is the grant
  to **PUBLIC**. `anon` and `authenticated` held it by membership, and revoking
  a privilege a role does not *directly* hold is a silent no-op in Postgres —
  no error, no warning, no effect. The fix is `from public`.

  What makes it worth recording is how nearly it survived. The migration
  reported success; the advisor's own output is served from a per-finding cache
  and went on reporting the pre-fix state either way, so re-running it looked
  like staleness rather than a real finding; and the migration comment already
  claimed the fix was verified — because I had verified that the `ensure_rls`
  event trigger still worked afterwards. That check was real and it passed, and
  it proved nothing, because *not breaking anything* is precisely what a no-op
  guarantees. **Verify the thing you changed, not the thing you were afraid of
  breaking.** Caught by asking `has_function_privilege()` afterwards.

- **2026-08-01 — two no-break spaces lost in transcription, and the check that
  caught them.** The migrations were applied by hand-transcribing the files
  through tool calls, because the Supabase CLI was not linked and linking needs
  the database password. The transcription flattened the two `U+00A0`
  characters in `hero.sub` — `Café ✦ Wine Bar` — to ordinary spaces. Both repo
  files carry the correct bytes; only the live row was wrong.

  Nothing else would have found it. The migration succeeded, the seed file's own
  row-count assertions passed, and the page renders — just with a headline that
  can now wrap at the star on a narrow screen, which is the exact thing the
  no-break spaces exist to prevent and which that field's `help` text tells the
  owner is deliberate. It took `tools/check-live-project.mjs` comparing the live
  project against `data/seed-*.js` code point by code point.

  Fixed by a `fix_hero_sub_nbsp` migration applied to the project — recorded in
  its history, with no repo file, because the repo was never wrong: applying
  `20260801000100_seed_content.sql` to a fresh project produces the right bytes
  and never needs the correction. It is built from
  `chr(160)` rather than a literal so the next person to move that SQL through
  an editor or a chat window cannot lose it the same way. **An invisible
  character does not survive being retyped, so it should not have to be** — use
  `supabase db push` once the project is linked. The 84 menu items, 26 pours and
  every other copy field came through byte-identical, which is the extractor's
  whole argument restated: the transcription risk lands on the one field a human
  had to touch.

- **2026-08-01 — the editor's first test run passed three assertions about a
  sign-in that never happened.** `admin.js` waits for `DOMContentLoaded` before
  wiring anything up. The harness built the page and dispatched a `submit` at
  the sign-in form immediately — at a form whose handler did not exist yet. The
  event went nowhere, and the assertions then read a page that had simply not
  moved: no session, so no editor, so "an account that is not the owner does
  not get the editor" was true for entirely the wrong reason.

  It surfaced only because a *fourth* assertion in the same block wanted a
  specific sentence in the gate's message area and got an empty string. Three
  green, one red, one cause. The green ones were the dangerous part: each was
  the shape of assertion that passes when nothing happens at all — checking
  that something is *absent*. The fix is one `await` in the harness's setup, but
  the habit is the useful bit: **an assertion about an absence needs a control
  that proves the action was attempted.** The same reasoning put the "both edits
  really were sent" line in front of the forbidden-column checks, and the
  readable-copy probe in front of the six refusals in
  `tools/check-live-project.mjs`.

- **2026-08-01 — `frame-ancestors` went from `'none'` to `'self'`, on purpose.**
  The editor measures a headline's wrap by loading the real page into a hidden
  frame, and `'none'` refuses a same-origin frame as firmly as a foreign one.
  The alternative was to rebuild the site's typography inside `admin.css` and
  measure against a copy — which is a second source of truth for the exact
  quantity being measured, and would be wrong the first time anyone touched
  `styles.css`.

  The security cost is nil: clickjacking is an attack by a page on *another*
  origin, and `'self'` still refuses every one of those. What made it worth an
  entry is the failure mode of getting it wrong, which is why
  `tools/check-csp.mjs` now cross-checks the two files: under `'none'` the frame
  loads nothing, the measurement never runs, and the only symptom is a warning
  that stops appearing. Nobody notices a warning that is missing.

- **2026-08-01 — the build was shipping a site with no JavaScript at all.**
  Worse than the recorded "drops 4 pages": there was no `vite.config.js`, so
  Vite built one entry *and* copied no scripts, because it only processes
  `<script type="module">` and ours are classic on purpose. Every `src` in
  `dist/` pointed at a file that was never written. The build printed
  "✓ built" throughout. Now fixed, and the copy step asserts every referenced
  script reached `dist/` — this failed silently for the whole life of the
  project, so it needed to become loud rather than merely correct.

- **2026-08-01 — the EXIF rotation is checked, not trusted.** A phone does not
  rotate pixels when you turn it sideways; it writes what the sensor saw and
  records "this is rotated" in a tag. Every browser honours that tag when it
  *shows* an image, so the photograph looks right in the file picker and right
  in the editor's own preview, and then arrives on the site sideways — because
  the copy drawn to a canvas was the raw pixels.

  The fix is to apply the rotation for real. What makes it worth an entry is
  that the obvious fix has a second, identical-looking failure: `createImageBitmap`
  applies the tag itself by default, so rotating on top of that turns the
  photograph *twice*, and a picture rotated twice is exactly as wrong as one
  never rotated. So the raw pixels are asked for explicitly, and whether the
  browser honoured the request is then measured rather than assumed — the four
  orientations that matter swap width and height, so a bitmap whose dimensions
  still match the JPEG's own frame header is raw and needs turning, and one
  whose dimensions have been swapped has already been turned.

  Only 5–8 can be told apart this way; 2 and 4 are mirrors and do not change the
  dimensions. That is stated in the code rather than papered over: they are
  produced almost only by front cameras that have already flipped the pixels,
  and getting them wrong costs a mirrored photograph rather than a sideways one.

- **2026-08-01 — the shape warning compared a photograph to itself.** Picking a
  file writes the new dimensions onto the draft row, and the warning then read
  those same dimensions as "the shape being replaced" — so the ratio was always
  1 and the warning never fired. It was the test that found it, and only because
  the test asserted the *presence* of a warning rather than its absence.

  The fix is to compare against the baseline row — what the database last
  confirmed — rather than against the draft. The general shape of the mistake is
  worth remembering: in an editor built on two copies of every row, "what it was
  before" is always the baseline, and reaching for the draft gets you the answer
  to a different question that looks like the right one.

- **2026-08-01 — the storage schema went into the shim rather than around it.**
  `tools/supabase-shim.mjs` already said, in writing, that `storage` was absent
  and that "a migration that does touch it will fail here for a reason that is
  not a real defect, and the fix is to add it to this file consciously rather
  than to work around it". Phase 6 was that migration, and the note was taken at
  its word: two tables with the columns the migration names, RLS on, no policies
  of its own — so the four bucket policies are genuinely created and genuinely
  exercised by `test-rls.mjs`, through the same three actors as every other
  write.

  What that does *not* buy is stated in the same place: there is no upload
  endpoint, so nothing there enforces `file_size_limit` or `allowed_mime_types`
  — the real service applies those from `storage.buckets`, not from a
  constraint. `test-sql.mjs` checks the limits are *recorded*; only a live
  upload can check they are *applied*, and that is a Phase 7 row.

- **2026-08-01 — `check-policies.mjs` had stopped covering the newest policies.**
  Its parser matched `on public.<table>`, which was every policy in the project
  until the bucket. Four storage policies were being read, counted and ignored.
  Two changes followed, and the second is the interesting one: the "an update
  policy needs `is_owner()` in both halves" rule was written as a literal match
  on `using (public.is_owner())`, which the content tables satisfy and a storage
  policy cannot — those live on one shared table and must name their bucket, so
  they read `using (bucket_id = '…' and public.is_owner())`. A literal check
  would have quietly demanded they be written a way they cannot be written.

  Split on `with check` and look for the call in each half instead. **A checker
  written against the shape of the code that existed when it was written will
  reject the first correct thing that looks different** — and the direction that
  matters is which way it fails: this one would have failed loudly, but the
  schema-qualified match failed silently, which is why it lasted a phase.

- **2026-08-01 — the open/closed pill read the seed file, not the database.**
  Found by `tools/test-hours-live.mjs` on the first run of the Phase 7 Hours
  rows, and it is the one real bug the pass turned up.

  The hours are printed in five places. Four are `render.js`'s — the Visit
  table, the footer prose, the mobile-menu prose and the JSON-LD listing — and
  all four followed the database correctly. The fifth is the pill, which
  `script.js` owns because it is the only one that needs to know the time, and
  it opened with `var HOURS = SEED_HOURS`. So from Phase 4 onwards it was wired
  to the *offline fallback*: the owner changes the hours, the table below the
  pill rebuilds from the new week, and the pill goes on announcing the old one.
  Both on the same screen. Nothing thrown, nothing logged, and the 60-second
  tick re-rendered it from the stale array forever.

  Two mistakes, and the second is the one worth remembering. Reading
  `SEED_HOURS` was the obvious half. The other half is that the network answers
  **after** `script.js` has run, so a value captured at boot is the old week no
  matter which source it was read from — fixing only the source would have left
  a bug that reproduces on every visit and looks fixed on a page you reload
  after the cache is warm.

  Fixed on both sides: `week()` reads `AROMATI_DATA.current().hours` on every
  render and falls back to `SEED_HOURS`, and `render.js` now fires
  `aromati:content-changed` on every second paint. That is a *second* event
  beside `aromati:board-replaced`, deliberately — the existing one means "tear
  the menu wiring down and rebuild it", which is far too heavy to fire for an
  hours-only edit and would replay the entrance cascade over a settled board.
  The new event also repairs a smaller thing nobody had noticed: `renderHours`
  rebuilds the Visit table's list items, wiping the `is-today` highlight that
  `script.js` had put there.

  **Why no existing test caught it**: `tools/test-hours.mjs` injects one week as
  `SEED_HOURS` and renders, so `render.js` and `script.js` are handed the same
  array by construction and cannot be caught disagreeing. It was a thorough test
  of the wrong question — the shapes, not the source. The new harness's first
  assertion is that the week it serves shares no time with `data/seed-hours.js`,
  because if one matched, a consumer that never updated would pass by
  coincidence.

- **2026-08-01 — the Phase 7 rig was serving settings the site ignores.**
  Not a bug in the site; a bug in the harness, and the kind that manufactures
  false confidence rather than false alarms.

  `tools/page-boot.mjs` built its `site_settings` rows straight out of
  `data/seed-settings.js` — `phoneDigits`, `businessName`, a nested `address`
  object. The database is a flat key/value table keyed `phone_digits`,
  `business_name`, `address_street`, and `data.js` **silently drops a key it
  does not recognise**, which is right for a stray row and a trap for a test.
  So every row was discarded, `shapeSettings` returned an empty object,
  `renderContact` returned at its first guard, and the pages simply kept the
  phone number that was already in the markup. Three harnesses were green while
  the contact renderer had never once run.

  Found by a sabotage that should have broken the phone link and did not — the
  same shape as the Phase 6 lesson about mutations, one level up: **mutation-test
  the harness, not only the code.** A green suite tells you nothing about the
  paths the harness never reached, and the only way to find those is to break
  something and be surprised that nobody noticed.

- **2026-08-02 — a Phase 9 was added, because Phase 8 was not the end of the
  work, only the end of the work a machine can do.** The plan had eight phases
  and the position marker had nowhere to go once the eighth was ticked. The
  alternative was to delete the marker, which is one of the four kinds of rot
  this file names at the top. What is in Phase 9 is not new scope — it is the
  browser rows the Phase 7 checklist already marks ⚠️, the three live-project
  rows that need the owner's password, the FAQ answer, the POLICIES.md read and
  the held merge. Collected in one place so the marker points at something true.

- **2026-08-02 — Phase 8's "refresh the seed arrays from live data" was a
  no-op, and the tool it implies was not built.** The seeds and the project
  agree exactly, checked on the day; the owner has not edited anything yet.
  Building a write-back on the strength of a comparison that is currently
  identical would mean writing a tool with nothing real to test it against, and
  the honest half of the job — writing down what it has to handle when someone
  does build it — is in open item 2 instead. Recorded here rather than left to
  be discovered as a missing script, because "refresh the seeds" reads like
  something that happened.

- **2026-08-02 — three iOS-only rendering bugs, three fixes, none of them
  verified to work.** Recorded as a failure rather than as progress, because the
  tree now contains four changes that look like fixes and are not known to be.

  The bugs: the hero parallax stutters on iPhone; the kitchen reel renders no
  plates and no drift on iPhone *and* iPad; the wine backdrop is absent on iPhone
  but fine on iPad. Android is perfect in all three, which is the whole shape of
  the problem — every browser on iOS is WebKit, so these reproduce nowhere else.

  What went in: the rAF parallax loop in `script.js` was reworked (batched reads
  and writes instead of ~11 forced reflows a frame, `innerHeight` sampled on
  resize instead of per frame because Safari changes it mid-scroll as the URL bar
  moves, the loop sleeping when nothing moves, `will-change` scoped to on-screen
  elements). The hero and wine backdrops were moved to a CSS `view()` scroll
  timeline so the compositor drives them. `filter` came off `.plate img`. A
  `max-width:760px` block bounded `.wine__bg` to one viewport. Each is defensible;
  the loop repairs are worth keeping on their own merits. **None of them fixed the
  reported symptom.**

  The lesson is the same one this file already learned twice about harnesses,
  moved to a new place: **inference is not observation.** All four changes were
  reasoned from reading CSS on a Windows machine with no way to attach an
  inspector to an iPhone, and no Windows browser can render WebKit — Chrome's
  device emulation uses the engine that already works. The reel fix in particular
  felt certain because it pattern-matched the two instances this file already
  documents (the mask on `.reel__viewport`, the `filter` on `.wine__bg`, both
  fixed by removal). Same shape, same reasoning, wrong answer. A third instance of
  a known pattern is evidence, not proof, and the cost of treating it as proof was
  three rounds of confident non-fixes.

  The leading untested theory, which should have been checked first and was not:
  `.plate` starts at `opacity:0` and only becomes visible when the reel's
  IntersectionObserver adds `.in`. If that observer does not fire on WebKit, every
  plate is invisible while the drift runs unseen — which matches "no images and no
  motion" exactly, and which no amount of filter removal could ever have helped.
  One look at the live DOM decides it.

  **Addendum, same day.** A second agent then attempted the same three bugs and
  also failed. Its changes were already in the working tree when `git add -A`
  ran, so they are inside a commit whose message describes only the first
  agent's work — the history is misleading on that point and this is the
  correction. What it added: `position:absolute; inset:0` on `.wine__bg img`, a
  `100vh` fallback before `100svh`, `!important` on animation, transform and
  will-change to beat the inline styles `script.js` writes, the wine media query
  widened to cover iPad portrait, and a force-reveal of `.wine__board`.

  That last line is the one worth reading. Force-revealing a `[data-reveal-img]`
  element means the element was not revealing on device — and revealing is not a
  compositing problem, it is `script.js` adding `.in`. Nearly everything on this
  page starts at `opacity:0` and waits for one of four IntersectionObservers.
  When an observer does not fire, its targets are invisible forever, which reads
  exactly as "the images disappeared", and for the reel as "the animation is
  broken" because the drift runs on elements nobody can see. Both agents spent
  their effort on compositing while the evidence for a reveal failure was sitting
  in the other's diff.

  One arithmetic detail nobody checked: the shared observer uses
  `threshold: 0.18`, and a threshold is the fraction of *the target* that must be
  visible. An element taller than about five and a half viewports can never show
  18% of itself at once, so the callback never fires. The iPhone has the shortest
  viewport and the tallest stacked layout of any device in play, which is a
  mechanism for iPhone-only failure that has nothing to do with WebKit at all.
  Unverified, but it is cheap to test and it would explain the iPhone/iPad split.

  `HANDOFF-ios.md` carries the detail for whoever picks this up on a Mac. A
  temporary on-device readout was built and then deleted the same day, unused:
  it existed only because the machine doing the work could not see the machine
  with the bug, and a Mac with Safari's Web Inspector attached to the phone
  replaces it completely. Nothing of it remains in the tree. If the next attempt
  is ever made from Windows again, rebuild it rather than guessing — the Layers
  panel is what this needed, and inference is what it got.

- **2026-08-02 — the Menus dropdown took two taps on iPad, and the fix is
  `pointerType`, not `hover:hover`.** Reported from the device: at a width wide
  enough for the nav pill to show, the first tap only lit the pill up and the
  second one opened the panel.

  The dropdown listened for `mouseenter` and `click` both. One tap on iOS fires
  both: the enter opened the panel, then the click handler toggled it — closing
  it in the same tap. All that was left was Safari's synthesised `:hover` on the
  pill, which reads as a highlight. The second tap worked because Safari does not
  re-fire `mouseenter` on an element it still considers hovered, so only the
  toggle ran. The panel opens purely on `.is-open` from `script.js`; no CSS
  `:hover` rule opens it, so this was entirely the JS race.

  Hover open/close now runs on `pointerenter`/`pointerleave` gated to
  `e.pointerType === "mouse"` (`script.js:252`). Note that this is deliberately
  *not* the `@media (hover:hover)` guard the reel pause above uses: an iPad with
  a Magic Keyboard trackpad reports `hover:hover` true while still sending
  `pointerType: "touch"` for a finger, so the media query would have left this
  exact case broken. `hover:hover` is the right test for a CSS rule that has no
  event to inspect; `pointerType` is the right test when there is one.

  Verified only that the syntax parses and that `test:pages`, `test:guards` and
  `check:csp` pass — the behaviour itself is unconfirmed on device, like the
  entry above. One loose end, also unconfirmed: iOS holds the synthesised
  `:hover` until you touch elsewhere, and `.navdrop__btn:hover` shares its
  styling with `.navdrop.is-open .navdrop__btn` (`styles.css:329`), so the pill
  may stay gold after the panel is tapped shut. If it does, gate the `:hover`
  half of that selector and leave the `.is-open` half alone.
