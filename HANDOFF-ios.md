# Handoff — iOS-only rendering bugs

Working notes for continuing this on a Mac. Updated 2026-08-02.
Branch: `phase1-content-as-data`.

---

## The situation in one line

Three iOS-only bugs. Two agents have now attempted fixes — six changes between
them, all reasoned from source code, **none verified to work.** Bugs 2 and 3 are
still broken on device and are independently corroborated; bug 1 has only ever
been seen on a beta build and has not been checked against a stable one.

## The bugs

| # | Symptom | iPhone | iPad | Android | Corroborated? |
|---|---------|--------|------|---------|---------------|
| 1 | Hero parallax stutters | broken | — | fine | **no — owner's beta device only** |
| 2 | Kitchen reel: no plates, no drift | broken | broken | fine | yes — seen by a second person |
| 3 | Wine (04) backdrop absent | broken | fine | fine | yes |

Every browser on iOS is WebKit, so none of this reproduces on Windows. Chrome
DevTools device emulation renders with Blink — the engine that already works —
and will never show any of it.

The last column exists because a fourth bug on this list turned out not to be a
bug. See the section immediately below before touching bug 1.

---

## THE LEAD — check this before writing any code

**Almost everything on this page is invisible until JavaScript adds `.in` to it.**

CSS starts these elements at `opacity:0`, and four separate IntersectionObservers
in `script.js` add `.in` when they scroll into view:

| Observer | Line | Targets | Threshold |
|---|---|---|---|
| `io` | `script.js:276` | `[data-split]`, `[data-reveal-img]`, `.reveal`, `.footer` | 0.18, rootMargin `0px 0px -4% 0px` |
| `staggerIO` | `script.js:330` | story copy, fact row | — |
| `reelIO` | `script.js:466` | `.plate` (the kitchen reel) | 0.12 |
| `courseIO` | `script.js:613` | menu courses | — |

If an observer does not fire, its targets stay at `opacity:0` forever. **That
presents as "the images disappeared" and, for the reel, as "the animation is
broken" — because the drift is running on elements nobody can see.** It matches
every reported symptom, and no amount of compositing work will ever fix it.

Two concrete reasons this could fail on iOS and not Android:

1. **`threshold: 0.18` on an element taller than the viewport.** The threshold is
   the fraction of *the target* that is visible. An element 5.5× the viewport
   height can never have 18% of itself on screen, so the callback never fires. An
   iPhone has the shortest viewport and the most stacked (therefore tallest)
   layout of any device here, so elements can cross that line on iPhone while
   staying under it on iPad and desktop. **This is a real arithmetic bug, not a
   WebKit quirk** — it would fail on a short-enough Android too. Worth checking
   first because it is cheap and it explains the iPhone/iPad split in bug 3.
2. **Lenis smooth scroll** (`script.js:28`) runs with `syncTouch:false`, so touch
   scrolling is native while Lenis still runs its own rAF loop. Worth ruling out
   as an interaction with observer root calculation.

**Corroborating evidence:** the other agent independently patched
`.wine__board[data-reveal-img]{ clip-path:inset(0 round 6px); opacity:1; }` —
i.e. it force-revealed a `[data-reveal-img]` element because it was not
revealing on device. That is the same failure, treated as a symptom rather than
traced to the observer.

**First thing to do on the Mac:** open the page on the iPhone with the inspector
attached and look at whether `.plate`, `.wine__board`, and `.story__img` have
`.in`. One reading decides whether this whole family of bugs is one bug.

---

## One of these was never a bug — check bug 1 before working on it

**The owner runs the iOS 27 beta on all their Apple devices.** A fourth item
that used to be on this list — the menu board's courses revealing with no
animation on iPhone — was chased through two full rounds of fixes before anyone
opened the site on a second phone. On a stable iOS 26 iPhone it did not exist.
Nothing had ever been wrong with that code; the whole thing was a beta
rendering artifact. Both rounds are reverted and `script.js` is untouched. The
analysis is in the last entry of `memory.md`.

**Bugs 2 and 3 are not in that category.** A second person, on their own
device, has seen the kitchen reel fail and the wine backdrop go missing. Those
are real and they are worth the work.

**Bug 1 is the one to check.** The hero parallax stutter has only ever been seen
on the owner's beta iPhone, and "stutter" is exactly the kind of symptom a beta
compositor produces on its own. Ten minutes on the stable phone either promotes
it to a real bug or deletes it from this file. Do that before writing code for
it — bug 4 cost two rounds for want of that check.

Note also that bug 2 showing on both the iPhone *and* the iPad is weaker
evidence than it looks, since both run the beta — but a second person has seen
it independently, and that is what carries it.

---

## Ruled out, with evidence — do not re-derive this

**WebKit composites normally inside CSS multi-column.** Every element on the
menu board sits inside a fragmented flow (`.carte__body` is `columns:2`, and
`columns:1` below 1020px — still a multi-column *container*). The tempting
theory is that WebKit refuses to composite there, forcing the reveal
transitions onto the main thread, where an iOS momentum scroll would freeze
them. It fits everything. It is wrong:
`RenderLayerCompositor::canBeComposited` returns `true` for layers inside a
fragmented flow and excludes only the flow thread's own layer. The FIXME people
remember is bug 84900, which was about CSS Regions and was closed WONTFIX in
2022 when Regions were removed. Read the function before building on this —
`curl` the file and grep it, it takes two minutes.

This will come up again the moment anyone opens the Layers panel on the reel
for bug 2. It is already answered.

---

## What is currently in the tree, and who wrote it

All of it is unverified. None of it is known to help.

### Written by Claude (commit `1d98bb6`)

**`script.js` — rAF parallax loop rework.** Batched reads and writes (was ~11
forced reflows per frame); `innerHeight` sampled on resize rather than per frame,
because Safari changes it mid-scroll as the URL bar collapses; the loop sleeps
when nothing has moved instead of running at 120Hz forever; `will-change` scoped
to on-screen elements instead of pinned to ten images. **These four are correct
on their own merits regardless of the iOS bugs and should be kept.**

**`styles.css` — CSS `view()` scroll timeline** for the hero and wine backdrops,
so the compositor drives them instead of JS racing it. `script.js` stands down
when `CSS.supports("animation-timeline","view()")`.

**`styles.css` — `filter` removed from `.plate img`**, replaced with a flat
`::before` overlay, hover filters gated behind `@media (hover:hover)`.
Reasoning was that a filter inside the ~5000px transform-animated `.reel__track`
forces an offscreen pass WebKit cannot rasterise. This pattern-matched two
instances `memory.md` already documents — the mask on `.reel__viewport` and the
filter on `.wine__bg`, both fixed by removal. Same shape, same reasoning, **wrong
answer.**

### Written by the other agent (swept into `1d98bb6` unreviewed, plus `HEAD`)

This work was already in the working tree when `git add -A` ran, so it is inside
a commit whose message describes only Claude's changes. Flagged here because the
history is misleading on that point.

- `.wine__bg img{ position:absolute; inset:0; }` added to the base rule
- The wine media query widened from `max-width:760px` to also cover
  `(max-width:1100px) and (orientation:portrait)` — aimed at iPad portrait,
  raised from 1020px in a second pass
- `height:100vh` before `height:100svh` as a fallback
- `animation:none !important; transform:none !important; will-change:auto !important`
  to beat `script.js`'s inline styles
- `.wine__board[data-reveal-img]{ clip-path:inset(0 round 6px); opacity:1; }` —
  **see THE LEAD above; this is the most informative line in the diff**

---

## Environment notes that cost real time

- **Live Server serves the project root**, not `dist/`. It uses `styles.css` and
  `script.js` directly. `dist/` only matters for `npm run build` / `preview` /
  deploys.
- **Safari caches `styles.css` hard.** The HTML links it with no version string,
  so edits appear to do nothing. Test in a **private tab**. A stale cache masked
  one full round of testing.
- **Cloudflare Pages:** deploy `dist`, build command `npm run build`. Not the
  root — root filenames are unhashed and reproduce the cache problem at CDN
  scale.
- **Tests:** `npm test` runs all 26. Fast relevant subset:
  `npm run check:fonts && npm run check:layout && npm run check:csp && npm run test:pages && npm run check:memory`.
  `check:layout` guards nav shift, which this repo has a history of breaking.
  `check:memory` fails if `memory.md`'s `file:line` links drift — editing
  `script.js` will do that, and the fix is to update `memory.md`, not the check.
- A temporary on-device readout was built and deleted unused once this moved to
  a Mac. Rebuild it only if you end up back on Windows.

## Suggested order of work

1. Attach the iPhone. Check whether `.plate` / `.wine__board` / `.story__img`
   have `.in`. This is one observation and it may collapse three bugs into one.
2. If they do not: fix the observers, not the CSS. Revert the speculative CSS
   below before adding more.
3. If they do: open the **Layers panel** and look at the reel — is there a layer,
   what size, what memory cost. Every compositing theory lives or dies there.
4. Check the console for iOS-only errors. Nothing has ever seen them.
5. Then decide what to keep. The `script.js` loop repairs stand on their own; the
   `view()` timeline, the `.plate` filter removal, and the whole wine media block
   are all speculative and should be reverted freely if the evidence points
   elsewhere.
