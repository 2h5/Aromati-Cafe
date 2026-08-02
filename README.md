# Aromati Café & Wine Bar

Marketing site for Aromati Café & Wine Bar — 103 E 34th Street, Murray Hill,
New York. Five pages, plus an editor the owner uses to change what is on them.

**Status, 2026-08-01: the CMS is built and live.** Hours, contact details, the
whole menu across three pages, the section copy and the photographs all come
from a Supabase project and are edited at `/admin.html`. The FAQ panel exists
and the FAQ page is still placeholder copy — see *The FAQ page* below.

Two other files matter as much as this one:

- **`memory.md`** — the build plan, every settled decision and why, the phase
  history, and the security analysis. It is the long version of everything
  here. Read it before changing anything.
- **`client-notes.md`** — the same site described for the owner, in the owner's
  language. Nothing technical in it.

---

## The shape of it

Plain HTML, CSS and JavaScript. **No build step, no framework, no bundler.**
The source tree *is* the site: what is in this folder is what gets uploaded.

Content arrives in one order, and the order is the design:

```
network  →  localStorage  →  data/seed-*.js
```

`data.js` renders **synchronously** from the cache, or from the seed files if
there is no cache, before anything is painted. Only then does a request go out,
and what comes back is folded in afterwards, and only if it is genuinely
different.

Nothing on the page ever waits on the network. That is not a performance
preference: the entrance choreography, the reveal observers, the parallax and
the menu tab cascade all need real DOM before they run, so a board that arrives
late is not a slower board — it is a board the animations have already run past.

The consequence, stated plainly: **if the database is down, deleted, unpaid or
misconfigured, the site serves the correct menu from files in git.** The worst
case is "restore from git, lose the last few edits", never "the client's site is
down and the menu is gone". Double-clicking `index.html` off the disk gets you
the same complete site, which is also the local development story.

The one thing this does not cover is a photograph the owner uploaded: the
description is recoverable, the file itself lives only in the storage bucket.
See *Backing up* below.

---

## Files

| File | What it is |
| --- | --- |
| `index.html` | The one-pager: hero, story, kitchen, café, wine bar, room, visit |
| `menu-food.html` | Food — 25 items, 7 courses |
| `menu-drinks.html` | Drinks — 28 items, 4 courses |
| `menu-wine.html` | Wine and cocktails — 31 items, 6 courses |
| `faq.html` | Placeholder questions, see below |
| `admin.html` / `admin.js` / `admin.css` | The editor. The only page that loads the Supabase SDK |
| `styles.css` | All styling for all five public pages |
| `script.js` | One IIFE: smooth scroll, nav, reveals, parallax, menu filtering, the open/closed pill |
| `render.js` | Builds the menu boards, the hours, the copy, the contact details and the JSON-LD from data |
| `data.js` | `network → localStorage → seed`, and nothing else — it never touches the DOM |
| `config.js` | Which Supabase project, and the publishable key. Both are public by design |
| `data/seed-*.js` | The site as it shipped: the offline floor and the disaster-recovery story |
| `supabase/migrations/` | Five migrations — schema, seed content, the owner allowlist, advisor fixes, photographs |
| `supabase/POLICIES.md` | What the database allows, in plain words |
| `tools/` | The extractors, the generators and the test suite. Never shipped |
| `vendor/` | The Supabase SDK, vendored with its digest written down |
| `assets/` | Photography, self-hosted Lenis, the studio mark |
| `_headers` | The Content-Security-Policy and friends. Cloudflare Pages reads it |

The menu pages are flat in the root on purpose — every relative path is then
identical to `index.html`, which is what keeps `file://` working with no
surprises. Pretty URLs are a hosting rewrite later, not a file move.

---

## Where each kind of content lives

| Content | Table | Edited in | Seed file |
| --- | --- | --- | --- |
| Headlines, ledes, labels — 62 fields | `site_copy` | Words | `seed-copy.js` |
| Opening hours, and one-off closures | `business_hours`, `hours_exceptions` | Hours | `seed-hours.js` |
| Phone, email, Instagram, address, delivery links | `site_settings` | Contact | `seed-settings.js` |
| Courses, items, prices, pours, options | `menu_courses`, `menu_items`, `menu_item_pours`, `menu_item_options` | Menus | `seed-menu.js` |
| Photographs and their descriptions | `photos` + the `site-photos` bucket | Photos | `seed-photos.js` |
| FAQ questions | `faq_entries` (empty) | FAQ | — |

**Hours are printed in five places and they must move together**: the live
open/closed pill (`script.js`), the Visit table, the footer prose, the
mobile-menu prose in a different format, and the JSON-LD
`openingHoursSpecification` that Google reads. `tools/test-hours-live.mjs`
exists because one of the five once stopped following the database and nothing
noticed.

**The copy and the hours are in the markup as well as in the data**, on purpose:
a crawler or a reader with no JavaScript gets a complete page. `render.js` then
overwrites them from the data. The menus are not — their markup was removed and
the board is built from scratch.

That duplication has a cost, and it is the one open item worth knowing about
before you start: **nothing yet writes live values back into the markup or the
seed files.** Today they agree (`node tools/check-live-project.mjs` says so).
The moment the owner edits a headline, the markup and `data/seed-copy.js` are
stale, the offline fallback serves the old wording, and that check starts
reporting it. See `memory.md`, *What's still open*, item 2.

---

## The menu, and the six price shapes

Every item is one row. Six shapes, all of them real and all in use:

| Shape | Looks like | Example |
| --- | --- | --- |
| One price | `.mi__price` | Morning Plate — 21 |
| A price per size column | `.course--sized` + `.mi__cells` | Drip Coffee — 4 / 5 |
| One price spanning the columns | `.mi__cell--solo` | Espresso — 3 |
| Supplementary pours | `.mi__pours` beside a flat price | Pirosmani White — glass 15, Bottle 60 |
| No price | `.mi--noprice` | two wines |
| Expandable options | `.mi--opts` + `.mi__opts` | Aromati's Crêpe — 5 + 7 toppings |

Plus `.mi__tag`, an inline qualifier in the heading — a vintage, `750 ml`,
`7 toppings`.

Two details that are easy to break:

- **Prices are stored bare, with no `$`.** `styles.css` adds the symbol through
  `::before`, so the character exists in one place in the whole project.
- **A blank size is a statement, not a missing price.** An item sold small and
  not large renders as `.mi__cell--none`, and one line of CSS
  (`.mi__cell--none::before { content: none }`) keeps a lone `$` out of the
  empty cell. Both halves are checked by `tools/test-menu-shapes.mjs`.

**Sizes are declared per course, not per item** — `.course__sizes` is a column
header. Two columns maximum: the grid has two, and the database refuses a third.

`initMenu()` in `script.js` still reads the courses **out of the DOM** rather
than from a list, which is why it needed no changes when the boards started
coming from data. It does have to survive the board being replaced under it
after a network refresh — that is what `aromati:board-replaced` is for, and what
`tools/test-replay.mjs` drives a real browser to check.

---

## The editor

`admin.html` — six panels: Words, Hours, Contact, Menus, Photos, FAQ.

Signing in loads everything the owner can edit into memory once. Every panel
edits that copy. Nothing reaches the database until **Save changes**, and
**Discard changes** puts it all back.

- **One account.** Public signup is disabled in the dashboard, and the write
  policies name a specific `auth.uid()` — not "any authenticated user". An
  account that is not the allowlisted owner is signed straight back out.
- **A save is a sequence of REST calls, not a transaction.** If the ninth of
  fourteen is refused, the first eight really happened. Each call that succeeds
  is folded into the baseline as it lands, and the database's own wording is
  shown as it was written. The editor never claims a state it has not confirmed.
- **The validation in the editor is not the security boundary.** It exists to
  give the owner a sentence they can act on before a save is attempted. RLS
  decides what may be written; CHECK constraints and triggers decide what is
  well-formed. Where a rule appears in both places the wording is copied from
  the migration, and `tools/test-admin.mjs` fails if the two drift.
- **Photographs are resized and re-encoded in the browser** before upload, EXIF
  orientation and all. The bucket carries its own size and MIME limits, at the
  bucket level rather than only in a policy.
- **Headline length is measured, not counted.** The editor loads the real page
  into a hidden frame, puts the candidate text into the real element and counts
  line boxes at 1280px and 390px as the owner types. It warns and names the
  width rather than blocking. A character count was tried first and is the wrong
  control — `memory.md`, open item 0, has the measurements.

---

## The database

Five migrations in `supabase/migrations/`, applied in order. `POLICIES.md` says
what they allow in plain words and is the file to read first.

The rules that are not negotiable, all of them checked:

- Write policies are scoped to a **specific allowlisted `auth.uid()`**.
- `is_owner()` is `SECURITY DEFINER` with `set search_path = ''`, and `execute`
  is revoked from `anon`.
- Storage buckets carry `file_size_limit` and `allowed_mime_types` **at the
  bucket level**. SVG is never in the allowed types.
- Prices are `text`, never `numeric` — `7.50` must not render as `7.5`.
- Every table has an explicit `sort_order`. No table keys on a name; duplicate
  names already exist in the wine list.

**The anon key in `config.js` is public and that is its intended use.** It says
which project, not who may come in. The `service_role` / `sb_secret_` key is the
opposite: it bypasses every policy, and it must never appear in `config.js`, in
any file the browser loads, in a commit, or in a screenshot. If one is ever
pasted by accident, rotate it in the dashboard — deleting the commit is not
enough.

---

## Tests

```
npm test
```

26 harnesses, no network, no Docker. They run the real files — the real pages in
jsdom, the real renderer, the migrations against Postgres compiled to
WebAssembly. `memory.md` describes each one and what it is for.

The standard every one of them is held to: **it has been sabotaged and required
to fail, naming the right check.** A harness nobody has broken on purpose is a
harness nobody knows the failure mode of. Three assertions in this suite were
found to be unfailable that way, and one whole rig was found to be feeding the
site settings it silently ignored.

Four things are deliberately **not** in `npm test`:

| | Why |
| --- | --- |
| `node tools/check-live-project.mjs` | Needs the live project. Compares every row against the seed files, then tries six writes a defaced site would need and requires each to be refused. Run it after a migration and before a deploy |
| `npm run check:layout` | Drives real Chrome and skips silently without it — so it is the second guard, never the first |
| `npm run test:replay` | Also a real browser |
| `node tools/measure-headlines.mjs` | A measuring tape, not a guard. It prints a table and leaves the judgement to a person |

Two of them guard the same thing from different directions and both matter:

- `npm run check:fonts` — static, cannot skip, runs anywhere.
- `npm run check:csp` — refuses any origin the pages fetch that the policy in
  `_headers` does not allow, and catches a Google Fonts `<link>` as a policy
  violation even if someone has "fixed" the font checker to stop complaining.

---

## Running locally

Open the file. `index.html` → double-click. It works, from the seed data.

For a server (canonical URLs, the `_headers` file, the live data path):

```
npm run dev          # Vite, http://localhost:5173
npm run build        # local preview only — nothing deployed depends on it
```

`vite.config.js` and `dist/` are a convenience. Keep the build honest anyway: a
broken build that nobody notices is how the last one stayed broken.

## Deploying

**A direct upload to Cloudflare Pages.** No build command, no `dist/`. The
source tree is the site, which is the same property that makes `file://` work.

Two things follow:

- **Upload the site files, not the repo.** `node_modules/`, `tools/`,
  `memory.md`, `client-notes.md` and `.git/` have no business on a public host.
  Whatever is dragged in gets served — there is no ignore file protecting this.
- **`_headers` has to be in the drag.** There is no error if it is missing. The
  headers simply do not appear and nothing looks any different.

`admin.html` ships with the rest of the site and is therefore reachable on every
preview URL. Supabase auth is the real gate and RLS is the real defence, so this
is not a hole — but it is worth knowing. `robots.txt` and a `noindex` header
keep it out of search results, which is housekeeping and not a control.

## Backing up

Everything on this site is in git except one thing: **a photograph the owner
uploaded exists only in the storage bucket.** Its description is in the
database and comparable against the seed; the file is not.

If the project were lost, the site would fall back to the photographs it shipped
with — a correct site, but not the site the owner had. Download the bucket
periodically, or accept that. Nothing else here needs a backup that git is not
already providing.

---

## The FAQ page

`faq.html` is a **demo**. Its 18 questions came from Aromati's OpenTable
listing, where they read as automatically generated, and nothing in them has
been verified against how the café actually runs. The page says so, loudly, in a
`.notice` block above the questions — **that block is the point, and it must not
be quietly deleted while the borrowed copy stays.**

The questions have deliberately **not** been moved into the database.
`faq_entries` exists and is empty, and the editor's FAQ panel opens with the
same notice. Building the panel commits to nothing; transcribing placeholder
copy would commit to the wrong thing twice.

It is linked only from the footers, so it is easy to pull: delete `faq.html` and
the five footer links. The accordion is native `<details>`/`<summary>` with no
JavaScript at all. There is deliberately **no `FAQPage` JSON-LD** — structured
data would publish unverified copy to search engines as the restaurant's own
answers. Add it once the real questions are written and approved.

---

## Things worth knowing before you change something

### ⛔ The nav must not shift on navigation

**Fixed three times, broken twice, and neither break was font work.** The second
came from adding delivery links — nothing to do with typography, but it pushed
the masthead past the point where an existing reflow became visible, and cost
most of a session to diagnose.

The rule: **text is measured once and never re-measured.** What holds it, none
of it optional:

- Fraunces and Manrope roman-latin are **inlined in `styles.css` as `data:`
  URIs** — a linked font cannot be there for the first paint, and a `preload` is
  ignored over `file://`.
- Those inlined faces carry **no `font-display`**. `optional` commits before the
  font pipeline finishes even for a `data:` URI.
- The other four faces are linked with **`font-display: optional`**.
- **No `ch` units above the fold** — use `em`. `ch` is the width of the font's
  own `0` and is not equalised by the metric-matched fallbacks. `max-width:58ch`
  on the lede wrapped an extra line before the swap and moved the masthead seam
  31.5px. This is the one that will happen again, because it does not look
  font-related.
- Nothing is fetched from `fonts.googleapis.com` or `fonts.gstatic.com`. The
  fonts are self-hosted.

**Run `npm run check:fonts` before touching `styles.css` or any `<head>`.** If
it fails, read the header of `tools/check-fonts.mjs` before changing anything —
it lists all five real breaks and what each looked like.

### The one security rule

**Owner-typed text goes onto the page as text, never as markup.** Everything is
built with `createElement` and filled with `textContent`. Never `innerHTML`,
never `insertAdjacentHTML`, not once, not for a value that obviously cannot
contain markup. The moment there is one exception the rule stops being
checkable.

**An `href` is the same kind of sink.** `javascript:` in an ordering link would
run on click. The database refuses anything that is not `https://` and so does
`render.js` — deliberately both, because either one alone is a single point of
failure. Phase 6 extended the same rule to `<img src>`.

### The other invariants

- **No ES modules in site code.** `import` does not work over `file://`.
  Everything in `tools/` is ESM `.mjs`, and that is fine — it never ships.
- **The public site never loads the Supabase SDK.** Plain `fetch` against the
  REST endpoint. Only `admin.html` loads it, from `vendor/`, never a CDN, and
  `npm run check:vendor` checks the bytes against a written-down digest.
- **Plain ES5, one IIFE per file.** `var`, function expressions, `═══` section
  banners. A CMS that looks bolted on is a CMS nobody trusts.
- **Every init step is individually error-guarded**, so a failure in the menu
  render cannot take out the hours, the nav or the reveals.
- **Out of scope — do not build, do not break**: Build Your Own Breakfast, the
  crêpe options row, the Reserve a Table placeholder, the studio credit strip.
- **The nav differs by page.** On `index.html` the section links are hashes so
  Lenis smooth-scrolls them; on the inner pages they are `index.html#story`.
- **An inner page's arrival is one timeline.** `MENU_T` in `script.js` holds the
  whole sequence in milliseconds. Everything in it is on screen at load, so none
  of it may be left to the IntersectionObserver — the observer would fire the
  lot in the first frame. A corollary: **never give a `.reveal` element its own
  `opacity`**; it out-cascades `.reveal{opacity:0}` and the element sits visible
  until its animation starts. Mute with a colour alpha instead.
- **Parallax is clamped** to the element's actual overscan, which is why
  `.wine__bg` and `.hero__media` carry a negative `inset` — that inset *is* the
  travel allowance.
- **The page is locked against sideways panning** — `overflow-x: clip` on both
  `html` and `body`, plus `minimum-scale=1` in every viewport meta. It has to be
  `clip`, not `hidden`: `hidden` leaves the axis scrollable by touch and makes
  the box a scrollport, which collapses the `height:100%` on `body`. To find
  what is actually hanging off the edge, on a narrow window:

  ```js
  const w = document.documentElement.clientWidth;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > w + 1 || r.left < -1) console.log(Math.round(r.left), Math.round(r.right), el);
  });
  ```

  Ignore hits inside `.marquee`, `.reel__viewport` and `.carte__tabs` — those
  overhang on purpose and are clipped by their own container.
- **Reduced motion is respected throughout**: transitions collapse, the photo
  reel stops drifting and becomes a swipeable strip.
