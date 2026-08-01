# Aromati Café & Wine Bar

Marketing site for Aromati Café & Wine Bar — 103 E 34th Street, Murray Hill, New York.

## Stack

Plain HTML, CSS and JavaScript. **No build step, no dependencies, no server.**
Double-click any `.html` file and it opens and works, straight off the disk.

Everything is deliberately kept that way: no ES modules, no `fetch()` of local
files, no bundler-only syntax, and every asset is local (fonts come from Google
Fonts over https, which loads fine from `file://` too).

## Pages

| File | What it is |
| --- | --- |
| `index.html` | The one-pager: hero, story, kitchen, café, wine bar, room, visit |
| `menu-food.html` | Full food menu — six courses, crêpe toppings, Build Your Own Breakfast |
| `menu-drinks.html` | Coffee & espresso, tea/matcha/cocoa, smoothies, cold beverages |
| `menu-wine.html` | Cocktails, Georgian white / natural / red, European, pairings |
| `faq.html` | Common questions — **placeholder content, see below** |
| `styles.css` | All styling for all four pages |
| `script.js` | One IIFE: smooth scroll, nav, reveals, parallax, menu filtering, hours |
| `assets/` | Photography, self-hosted Lenis, studio mark |

Menu pages are flat in the root on purpose — every relative path (`styles.css`,
`assets/…`) is then identical to `index.html`, which is what keeps `file://`
working with no surprises. Pretty URLs (`/menu/wine`) are a hosting rewrite
later, not a file move.

## How the menus work

All three menu pages share one component. `initMenu()` in `script.js` reads the
courses **out of the DOM** rather than from a hardcoded list, so the filter tabs,
the item counts and the two-column balancing all derive from the markup:

- `<section class="course" data-course="slug" data-label="Tab Name">` — one
  category. `data-label` is the tab; the `<h2>` inside is the section heading.
  They are separate on purpose ("Khachapuri & Breads" tabs into a section headed
  "Main Georgian Dishes").
- `<li class="mi">` — one item. `.mi__price` prints its own `$`.
- `<ul class="mi__pours">` — extra prices under a line, for a *one-off* variant
  in an otherwise flat course: `Bottle $70`, or a board's `Small / Large`.
- `.mi--noprice` — an item priced only by variant, so no price on the name row.
- `.mi__tag` — the small pill: a vintage, `12 oz`, `750 ml`.

**When a whole course is priced by size**, don't repeat the size on every line —
use `course--sized` instead. The sizes become a column header and the prices
become aligned columns:

```html
<section class="course course--sized" …>
  <header class="course__head">…</header>
  <div class="course__sizes" aria-hidden="true"><span>Small</span><span>Large</span></div>
  …
  <span class="mi__cells"><b class="mi__cell">6</b><b class="mi__cell">7</b></span>
```

`.course__sizes` and `.mi__cells` share the `--cell` width set on
`.course--sized`, which is what keeps the columns aligned down the course. An
item with a single price uses `<b class="mi__cell mi__cell--solo">`, which spans
both columns and keeps the same right-hand edge. `--cell` has a floor wide
enough for the word "SMALL" so the two labels can't touch on a phone.

Adding a category is markup only. Adding a whole menu is a copy of an existing
menu page with the courses swapped and the three switcher links updated.

## The FAQ page

`faq.html` is a **demo**. Its questions were taken from Aromati's OpenTable
listing, where they read as automatically generated, and nothing in them has
been verified against how the café actually runs. The page says so, loudly, in a
`.notice` block above the questions — that block is the point, and it must not
be quietly deleted while the borrowed copy stays.

It is linked only from the footer of the other four pages, so it is easy to pull
if the owner does not want it: delete `faq.html` and the five footer links.

The accordion is native `<details>` / `<summary>` — keyboard- and
screen-reader-correct, and **no JavaScript at all**. The open/close is animated
through `::details-content` plus `interpolate-size: allow-keywords` on `:root`;
engines without those toggle instantly, which is fine.

There is deliberately **no `FAQPage` JSON-LD**. Structured data would publish
unverified copy to search engines as the restaurant's own answers. Add it once
the real questions are written and approved.

### Where prices live

**Prices exist in exactly one place: the menu pages.** The home page teasers
deliberately carry names and descriptions but *no* prices, so a price change is
never two edits and can never go stale in a place nobody thought to look.

## Content that is currently hardcoded

Editing any of the following needs a developer today. This is what the CMS phase
is meant to solve:

- Every menu item, price, description and category — the three `menu-*.html` files
- Section headings and body copy — `index.html`
- Opening hours — the `OPEN`/`CLOSE` maps in `script.js`, the hours table in
  `index.html`, the footer of all four pages, and the JSON-LD block (four places)
- Phone, address and email — repeated across all four pages and the JSON-LD

### The CMS path

The markup is already shaped for it. When Supabase is wired in, the render target
is the same `.course` / `.mi` structure that is in the files now, which means the
existing page **is** the seed: content loads from the network, falls back to
`localStorage`, and falls back finally to the markup already on the page — so the
menu is never blank, never waits on a request, and still works offline.

`initMenu()` needs no changes for this. It reads whatever is in the DOM.

## Running locally

Just open the file. `index.html` → double-click.

If you want a local server anyway (for testing canonical URLs or clean paths):

```
npx --yes serve -l 5174 .
```

`package.json` carries Vite as an optional convenience only — **nothing in the
site requires it**, and `npm run build` is not part of shipping.

> Note: the `dist/` folder is a stale artifact of an earlier Vite build and no
> longer matches the source. It should be deleted before handoff.

## Things worth knowing

- **The nav differs by page.** On `index.html` the section links are hashes
  (`#story`) so Lenis smooth-scrolls them. On the menu pages they are
  `index.html#story`, which navigates home and jumps. That is the one piece of
  chrome that is not identical across the four files.
- **An inner page's arrival is one timeline.** `MENU_T` in `script.js` holds the
  whole sequence in milliseconds — eyebrow, title, lede, switcher, tabs/notice,
  board. It drives every page with a `.mhead`: the three menus and the FAQ.
  Everything in it is on screen at load, so none of it may be left to the
  IntersectionObserver: the observer would fire the lot in the first frame. The
  nav is deliberately absent from the sequence — it does not animate on a menu
  page at all, because that entrance would replay on every Food/Drinks/Wine
  switch. A corollary worth remembering: **never give a `.reveal` element its own
  `opacity`** — it out-cascades `.reveal{opacity:0}` and the element sits visible
  until its animation starts. Mute with a colour alpha instead, as `.mhead__lede`
  does.
- **The font fallbacks are metric-matched, and the numbers are measured.** The
  webfonts load with `display=swap`, so every page paints once in a fallback and
  then reflows when the real font lands — enough to make the nav twitch on each
  navigation. The `@font-face` blocks at the top of `styles.css` re-box the local
  fallbacks to Manrope's and Fraunces' own metrics so the swap changes nothing.
  They are `local()` only, so nothing extra is downloaded, and where the named
  font is absent the stack falls through unadjusted as before. **If you change a
  font, these numbers are wrong** — re-measure rather than guessing: render the
  real face and the fallback at a large size, compare widths for `size-adjust`,
  and divide the real font's ascent/descent by that ratio for the overrides.
  One face per weight band, because the local font synthesises each weight
  differently.
- **`[data-split]` is hidden until JavaScript splits it.** The element is plain
  text in the markup, so the browser would paint the finished title for one
  frame before the words are wrapped and parked below the line — a visible
  blink. `script.js` adds `.is-split` once the wrapping is done, and only then
  does it become visible.
- **Deep links need arrivals too.** `index.html#visit` drops you into the middle
  of the one-pager, so anything you can land on directly has to animate on its
  own. That is what the `.visit__inner` entry in `staggerGroups` is for; without
  it the whole panel is simply there, fully formed.
- **Parallax is clamped.** Backdrops move by a fraction of their section's
  height, so a section that grows tall would drag the photo out of its own frame
  and lurch whenever that height changed. `parallax()` clamps travel to the
  element's actual overscan, which is why `.wine__bg` and `.hero__media` carry a
  negative `inset` — that inset *is* the travel allowance.
- **The menus dropdown** is keyboard- and touch-operable, not hover-only, and is
  hidden below 760px where the burger menu takes over.
- **Reduced motion** is respected throughout: transitions collapse, the photo
  reel stops drifting and becomes a swipeable strip.
- **Book a Table is a deliberate placeholder.** It says so when pressed rather
  than pretending to be wired up.
- **The page is locked against sideways panning** — `overflow-x:clip` on `html`
  and `body`, plus `minimum-scale=1` in every page's viewport meta so the lock
  cannot be pinched out of. It has to be `clip`, not `hidden`: `hidden` leaves
  the axis scrollable by touch even with no scrollbar to show for it, and
  `hidden` is what makes a box a scrollport. `clip` doesn't, which is why it is
  safe on both boxes at once — html's clip stops body propagating, but body then
  clips itself without becoming a scrollport, so the `height:100%` on it doesn't
  collapse the document. That collapse is a real failure mode, not a
  hypothetical: it is what `overflow:hidden` on `body` used to do behind the
  mobile menu, which is why `setMobileMenu()` now locks `overflowY` on the root
  instead. This *clips* the overflow, it does not cure it. To find what is
  actually hanging off the edge,
  paste this in the console on a narrow window:

  ```js
  const w = document.documentElement.clientWidth;
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > w + 1 || r.left < -1) console.log(Math.round(r.left), Math.round(r.right), el);
  });
  ```

  Ignore hits inside `.marquee`, `.reel__viewport` and `.carte__tabs` — those
  overhang on purpose and are clipped by their own container.
