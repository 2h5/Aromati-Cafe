# Handoff — iOS-only rendering bugs

Working notes for continuing this on a Mac. Written 2026-08-02.
Branch: `phase1-content-as-data`. **All work below is uncommitted** — commit and push
before switching machines, or none of it travels.

---

## The situation in one line

Three iOS-only bugs. Three fixes attempted, reasoned from source code alone.
**None of them worked.** All three are still in the tree, unproven, and should be
treated as suspect rather than as progress.

## Why the diagnoses kept failing

Every fix so far was inferred from reading CSS, never from observing the device.
The work was done on Windows, where:

- Safari's Web Inspector is unavailable — it requires a Mac.
- Every browser on iOS is forced to use WebKit, so iPhone/iPad bugs cannot be
  reproduced in any Windows browser. Chrome DevTools device emulation renders
  with Blink, the engine that already works correctly here, so it shows nothing.

**This is the single most important thing to change.** On a Mac: plug the iPhone
in, Safari → Develop → iPhone, and use the **Layers panel**. Every theory below is
about compositing layers failing to rasterise, and the Layers panel confirms or
kills each one in seconds. Do that before writing any more code.

---

## The three bugs

### 1. Hero parallax — laggy on iPhone, fine on Android
Status: **partially improved, core issue unresolved.**

The rAF loop in `script.js` had four genuine defects, all fixed and all worth
keeping regardless of what else is wrong:
- reads and writes were interleaved, forcing ~11 synchronous reflows per frame
- `window.innerHeight` was read per frame; on iOS Safari it changes as the URL
  bar collapses *during* the scroll, so offsets lurched mid-gesture
- the loop ran forever at up to 120Hz whether or not anything had moved
- `will-change:transform` was pinned on ~10 images permanently

Then the hero and wine backdrops were moved to a CSS `view()` scroll timeline
(`styles.css`, "the same drift, run on the compositor") so the animation runs on
the compositor thread instead of racing it from JS. `script.js` stands down when
`CSS.supports("animation-timeline","view()")` is true.

**Unverified:** whether the scroll timeline actually engages on the device, and
whether it helped. Check `animation-name` on `.hero__media` in the inspector.

### 2. Kitchen reel (sliding plates) — blank on iPhone AND iPad, perfect on Android
Status: **not fixed. Highest priority — this is total failure, not degradation.**

Reported symptom: images absent *and* the drift animation not running. Whole
component dead.

Attempted fix: removed `filter:saturate(.94) brightness(.92)` from `.plate img`,
replaced with a flat `::before` overlay, and gated the hover filters behind
`@media (hover:hover)`. Reasoning was that a filter inside `.reel__track` — which
is `width:max-content` (~5000px) and permanently transform-animated, inside an
`overflow:hidden` viewport — forces an offscreen compositing pass that WebKit
flattens at full track width, failing the raster.

That reasoning has precedent: **this same failure mode is documented twice already
in `styles.css`** — the mask on `.reel__viewport` (~line 858) and the filter on
`.wine__bg` (~line 1319), both fixed by removal. That is why it looked right.
It still didn't work.

**Untested alternatives, in rough order of promise:**
- `.plate` starts at `opacity:0` and only becomes visible when `script.js` adds
  `.in` from an IntersectionObserver (`script.js`, `boot("reel", …)`). If that
  observer never fires on WebKit, every plate stays invisible and the drift is
  running unseen — which matches the reported symptom exactly. **Check whether
  `.in` is present on the plates on-device before anything else.**
- `.plate img` has `aspect-ratio:4/3.2; height:auto` while the global rule is
  `img{width:100%;height:100%;object-fit:cover}`. If aspect-ratio fails to
  resolve inside a `flex:0 0 <width>` item on WebKit, the plates collapse to zero
  height and there is nothing to see.
- `loading="lazy"` on all 18 plate images. They sit outside the visible area of an
  `overflow:hidden` container and are moved in by transform; WebKit may never
  consider them intersecting, so they may never load.
- The ~5000px track genuinely exceeding a texture limit, independent of filters.

### 3. Wine section (04) backdrop — absent on iPhone, fine on iPad
Status: **not fixed.**

Attempted fix: a `@media (max-width:760px)` block bounding `.wine__bg` to
`height:100svh` with a gradient carrying its bottom edge into the section
background, plus `animation:none`.

Reasoning: stacked to one column the section runs past 2000px; `object-fit:cover`
then scales the 1088×1445 source to roughly 2300×3000 to fill it — a ~7 megapixel
raster for a photo `.wine__scrim` already hides at 90–96% opacity. iPad has the
memory, iPhone drops the layer. Plausible, unconfirmed, didn't help.

Note the iPad/iPhone split here is the opposite of bug 2 (which fails on both).
That difference is a real clue and hasn't been explained.

---

## Diagnostic harness — built, then removed

A temporary on-device readout (`diag.js` plus a `<script>` tag in `index.html`)
was written to print computed styles off the phone, then deleted unused once this
moved to a Mac. Nothing remains in the tree; `index.html` is back to normal.

It is not needed with Safari's Web Inspector attached — real DevTools give
everything it printed and far more. Noted only so its absence is not mistaken for
an oversight.

---

## Environment notes that cost time

- **Live Server serves the project root**, not `dist/`. It uses `styles.css` and
  `script.js` directly. `dist/` is only touched by `npm run build` / `npm run
  preview` / deploys.
- **Safari caches `styles.css` hard.** The HTML links it with no version string,
  so edits appear to do nothing. Test in a **private tab**, or clear website data.
  A stale cache masked one round of testing entirely.
- **Cloudflare Pages:** deploy `dist`, build command `npm run build`. Not the
  root — root filenames are unhashed and will reproduce the cache problem at CDN
  scale. `dist/` filenames carry content hashes, which makes stale caching
  impossible.
- **Tests:** `npm test` runs everything. The fast relevant subset is
  `npm run check:fonts && npm run check:layout && npm run check:csp && npm run test:pages`.
  `check:layout` guards against nav shift, which this repo has a history of
  breaking. All of these pass on the current tree.

## Suggested first moves on the Mac

1. Commit and push this branch from Windows first.
2. Attach the iPhone, open the site, go to the **Layers panel**. Look at the reel:
   is there a layer at all, what size, what is its memory cost.
3. In Elements, check whether `.plate` has `.in` and what its computed `opacity`
   and height are. That one observation separates "invisible" from "not rendered"
   and decides which of the bug-2 theories to pursue.
4. Check the console for iOS-only errors. Nothing has ever seen them.
5. Only then decide which of the three attempted fixes to keep. Each is defensible
   in isolation and each is currently unproven; the parallax loop repairs in
   `script.js` are the most likely to be worth keeping on their own merits.
