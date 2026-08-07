# Photographs: why a picture never changes in front of a visitor

If you are about to change anything in `tools/bake-photos.mjs`, `render.js`, or
the photo handling in `data.js`, read this first.

The symptom this file exists for: **the page paints one photograph, then
replaces it with another while the visitor watches.** The owner calls this "the
blink". It is worst on the hero, because the hero is the largest thing on the
page and the first thing anyone looks at.

There were two attempts at this. The first is described here as history,
because the reason it was wrong is the reason the second one is right, and
without that the second looks like a step backwards.

---

## 0. Where this stands — 7 Aug 2026

**Decided, proven, not yet shipped.** Production still runs the four-layer
design described in §2. The replacement in §3 has been tested end to end on a
preview deployment and works; nothing has been deleted from `main` yet, on
purpose. §6 has the order.

What was proven, on `photo-rebuild-test` at
`photo-rebuild-test.aromati-cafe.pages.dev`, with the middleware, `photo-boot.js`
and the runtime swap all removed:

| Step | Expected | Observed |
| --- | --- | --- |
| Bake reached the database | `N photographs baked in` | `9 photographs baked in (1141 kB)` |
| Middleware gone from the build | `No functions dir` | present in build log |
| `_headers` still applied without `_routes.json` | `2 valid header rules` | present |
| Hero changed in the CMS, no rebuild | site does not react | old photograph held, across reloads |
| After a rebuild | correct on first paint | `src="assets/baked-hero-main-5c6abf88.webp"` |

The fourth row is the whole result. The site did not flicker, did not swap, did
not correct itself a moment later — it showed the old photograph, unmoving,
until a build replaced the markup.

### Open

- [ ] **Alt text is not baked.** `renderPhotos()` sets `alt` from the database as
      well as `src`. `bake-photos.mjs` does not — it preserves the markup's alt
      and rewrites only the `src`. Removing the runtime swap without teaching the
      bake to write alt would silently strip the owner's alt edits from the site.
      This must land *before* §6 step 4. See §5.
- [ ] **The Publish button and its Edge Function.** §4.
- [ ] **The CMS wording.** §7.

---

## 1. Why this is hard at all

Every photograph ships in the markup as a real `src`:

```html
<img data-photo="hero.main" src="assets/web/hero-wine-frame.webp">
```

That is not a mistake and it is not going away. It is what makes the site
correct from `file://`, with no database, and with JavaScript off. If the
database is empty, unreachable, or has never been written to, the site still
shows the photographs committed to git and nothing looks broken.

The cost is that the markup can be **out of date**. The owner replaces a
photograph in the CMS; the file on disk still names the old one. Something has
to reconcile the two, and *when* that reconciliation happens is the entire
problem:

- Reconcile it **after** the browser has painted, and the visitor sees the swap.
  That is the blink.
- Reconcile it **before** the page is sent, and there is nothing to see.

Everything below is about moving the reconciliation earlier.

---

## 2. What was built first, and why it was the wrong shape

Four layers, each added because the one before it did not cover some case:

1. **`tools/bake-photos.mjs`** — at build time, download the owner's current
   photographs and write their paths into the markup.
2. **`functions/_middleware.js`** — at the edge, rewrite any `src` that changed
   since that build, using HTMLRewriter.
3. **`photo-boot.js`** — in `<head>`, read the browser's own cache, preload the
   replacement, and hide the slots about to change until they are ready.
4. **`renderPhotos()` in `render.js`** — swap whatever is left, at runtime.

It worked. It was also 854 lines across three files, a render-blocking script in
the head of all six pages, a CSP workaround (CSSOM instead of `<style>`, because
`script-src` forbids inline), and `ETag`/`Last-Modified` stripped from every HTML
response so a stale validator could not resurrect stale markup.

**The shape is the problem, not the code.** Layers 2–4 all exist to make a swap
invisible. A swap that has to be *made* invisible can always fail to be, and the
old §6 of this file was a list of eight ways it silently would — every one of
them leaving a site that "loads, looks perfect, and blinks." Three such bugs were
found in production *after* the layer above them had been verified.

That is what mitigation buys you: asymptotes. Not a fix.

---

## 3. The design now: the markup is already right

**Bake at build time, and rebuild when a photograph changes.** One layer.

```
owner uploads a photograph
    → it is in the database, and the editor shows it immediately
    → owner presses Publish
    → Cloudflare Pages rebuilds
    → tools/bake-photos.mjs downloads the current photographs into
      dist/assets/baked-<slot>-<hash>.<ext> and writes those paths into the HTML
    → every visitor from that moment gets correct markup on first paint
```

Nothing runs afterwards that is capable of changing a photograph. **The blink is
not suppressed here; it is unreachable.** There is no swap to hide, so there is
no list of eight ways the hiding can fail.

Three things fall out of it that were not the goal:

- The baked file is same-origin on Cloudflare's CDN with a long cache life,
  rather than a cross-origin fetch from Supabase storage.
- No render-blocking script in `<head>` on any page.
- HTML gets its `ETag` back, so a repeat visit can be a 304 instead of a full
  body.

**What it costs.** Between the upload and the end of the build — about forty
seconds — the site serves the *previous* photograph. Not a flicker: the old
picture, sitting still, exactly as it did the day before. And if the build fails
for any unrelated reason, the new photograph does not appear at all. That is a
real coupling that did not exist before, and it is the honest price. It is worth
paying because a stale photograph is a state a person can understand and a
flicker is a bug they report.

---

## 4. Publish, rather than a webhook per row

A database webhook on the photographs table would fire one deploy per row. Ten
photographs in a sitting would be ten builds, and the owner would watch the site
not change for forty seconds with nothing telling them why.

**A Publish button instead.** The owner uploads as many photographs as they
like, sees each one in the editor immediately — the editor reads the table
directly and always has — and presses Publish when they are done. One build, any
number of photographs, and the delay becomes a step they took rather than a lag
they noticed.

It also gives them staging, which they have never had: upload, look, change
their mind, upload again, publish once.

**The deploy hook URL cannot live in the browser.** Anyone holding it can
trigger builds. It goes in a Supabase Edge Function that holds the URL
server-side and fires it only for a signed-in owner; the editor calls the
function. This is the same conclusion this file already reached about the build
counter, for the same reason.

**If that is ever too much**, the fallback needs no UI: have the webhook mark
the table dirty and a scheduled job fire one deploy every few minutes if
anything changed. Uploads batch by themselves, and builds are capped no matter
how much anyone uploads. It is worse for the owner — no feedback, no staging —
and it is the same architecture underneath.

---

## 5. What must stay true

Short, because there is little left to break.

1. **The bake must fail loudly, or be checked.** `bake-photos.mjs` calls
   `process.exit(0)` when it cannot reach the database, because a site deployed
   without a bake is the site as committed — correct, if stale — while a site
   not deployed at all is an outage. That is the right call and it has a
   consequence: **a bake that silently did nothing produces a green build.**
   Read the build log for `photographs baked in`. `tools/test-bake.mjs` asserts
   the tool's own behaviour; it cannot assert that a deployment ran it.
2. **Alt text must be baked with the `src`.** The database holds both. If the
   bake writes only one of them, the other silently stops reaching the site the
   moment the runtime swap is removed. See §0.
3. **`publicUrl` must be spelled the same way in `bake-photos.mjs` and
   `data.js`.** The editor builds URLs from the same rule.
4. **`.nvmrc` must stay.** Pages picks a very old default Node otherwise, and
   old Node has no global `fetch`, so the bake would work on every machine here
   and fail on the one that matters. `tools/test-bake.mjs` guards it.
5. **Nothing may set an `img` `src` after paint.** This is the whole design in
   one line. If a future change reintroduces a runtime photo swap, it
   reintroduces the blink, and everything above becomes decoration.

---

## 6. Migration order

Each step is safe on its own, and the site is correct after every one of them.
**Do not reorder — steps 1–3 leave the current design fully working.**

1. **Create the Pages deploy hook** for `main`, and the Edge Function that holds
   it. Nothing changes for a visitor.
2. **Add the Publish button** to the editor. Now a rebuild can be triggered on
   demand. The four layers are still doing their job; this is redundant with
   them, deliberately.
3. **Teach `bake-photos.mjs` to bake alt text**, and prove it on a preview.
   Still redundant.
4. **Only now, remove the layers** — `photo-boot.js` and its `<script>` on all
   five public pages, `functions/_middleware.js`, `_routes.json` and its entry in
   `vite.config.js`'s `ROOT_FILES`, the photos step in `renderPhotos()`, and the
   two test tools that exist solely to guard them (`test-worker.mjs`,
   `test-photo-boot.mjs`) along with their `npm` scripts.

Step 4 is the only one that can regress anything, and by then every part of its
replacement has been watched working.

`photo-rebuild-test` holds the proof for step 4 and is not for merging — it
disables the runtime swap with `if (false && …)` rather than removing it, and it
predates the alt-text finding.

---

## 7. What the owner is told — ⚠️ needs rewriting

The editor's wording still describes the old design: the photograph live on
save, a flicker until someone republishes, republishing a thing done outside the
editor by whoever looks after the site.

Under §3 and §4 all three sentences are wrong. The photograph is live when they
press Publish, about a minute later, and republishing is the button in front of
them. There is no flicker to warn anyone about.

Rewrite it when step 2 lands, not before — wording that describes a button that
does not exist yet is worse than wording that is out of date.
