# iOS handoff — wine backdrop animation

Updated 2026-08-04. One active issue remains.

## Current status

- **Hero parallax stutter:** fixed. Closed.
- **Kitchen reel:** appears fully fixed. Closed unless a new device reproduces it.
- **Wine (04) backdrop:** the image now renders on the previously affected and
  newly covered portrait devices/view widths, but the backdrop no longer moves
  as the page scrolls. This is the only active issue.
- The earlier menu-course reveal report did not reproduce on stable iOS and is
  treated as a beta rendering artifact, not an active bug.

## Most likely cause

The current portrait rule in `styles.css` matches `max-width:760px` and portrait
viewports up to `1100px`. It intentionally applies all of the following to
`.wine__bg`:

```css
inset: 0 0 auto 0;
height: 100vh;
height: 100svh;
animation: none !important;
transform: none !important;
will-change: auto !important;
```

That rule explains why the image is visible on the newly fixed devices, but it
also disables the movement, in two independent ways. The `!important` resets
cancel the view-timeline animation and beat `script.js`'s inline fallback. And
pinning the backdrop to exactly one viewport height leaves it no overscan: the
landscape `.wine__bg{ inset:-8% 0 }` *is* the travel allowance, and the parallax
clamps to whatever overscan the element actually has, so here it clamps to zero.
Removing the resets alone would therefore not restore motion — the height needs
spare distance in it as well.

The next investigation is whether the rendering fix can be kept while restoring
a small, safe amount of overscan and parallax on portrait devices.

## Important distinction

`.in` is the reveal class added by IntersectionObservers. It controls the
foreground image reveal, including `.wine__board[data-reveal-img]`; it does not
control the `.wine__bg` backdrop's scroll animation.

The old force-reveal rule for `.wine__board[data-reveal-img]` only bypasses the
foreground board's clip and opacity. It can explain a board that was invisible,
but it cannot make the wine backdrop animate and is not the current lead.

## What to check on a real affected device

1. With the Wine section visible, inspect the computed styles for `.wine__bg`:
   whether the portrait media query matches, plus `inset`, `animation-name`,
   `animation-timeline`, `transform`, and `will-change`.
2. Check whether `CSS.supports("animation-timeline", "view()")` is true. When it
   is true, `script.js` removes `.wine__bg` from its JavaScript parallax list and
   the CSS view-timeline is responsible for movement. When it is false, the
   JavaScript fallback is responsible.
3. Temporarily test the portrait rule with the animation and transform resets
   removed *and* a few percent of overscan given back — say `inset:-4% 0 auto 0`
   against a correspondingly taller height. Removing the resets on their own is
   not a useful test: with the backdrop pinned to exactly `100svh` there is no
   travel to clamp to, so a static result would not tell you which half is
   responsible. If motion returns, keep the image-layer fix and tune the
   overscan down to the smallest value that still moves, rather than leaving the
   backdrop static.
4. If it still does not move, inspect the view-timeline range/keyframes and the
   JavaScript fallback separately. Check the console for iOS-only errors.

Do not spend more time on the resolved hero/reel issues or the removed Lenis
theory until a new device provides contrary evidence.

## Testing notes

- Live Server serves the project root and reads `styles.css` and `script.js`.
- Safari caches the stylesheet aggressively; use a private tab when testing.
- Deploying is `npm run build` here, then dragging `dist/` to Cloudflare Pages.
  There is no build command on Cloudflare's side. A CSS fix is not live until
  that build has been rerun — editing `styles.css` and redeploying the old
  `dist/` is a fix that tests clean locally and changes nothing on device.
- Relevant checks:
  `npm run check:fonts && npm run check:layout && npm run check:csp && npm run test:pages && npm run check:memory`
- Desktop Chrome emulation is not a substitute for an actual iOS WebKit test.
