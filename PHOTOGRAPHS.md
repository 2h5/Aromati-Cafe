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

**Done.** All four steps of §6 are shipped. `photo-boot.js`,
`functions/_middleware.js`, `_routes.json`, the runtime swap in `render.js` and
the two harnesses that guarded them are deleted. A photograph reaches the site
one way: `tools/bake-photos.mjs`, at build time, triggered by the owner pressing
Publish.

`tools/test-photos.mjs` now asserts the rule rather than the old machinery —
that nothing in `render.js` assigns a `src`, in the DOM and in the source.
Sabotage-verified: putting a swap back fails both halves.

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

Nothing. Both items that stood here are closed:

- **The CMS wording** was rewritten — see §7.
- **data.js fetching the photos table** turned out not to be dead, and is
  staying. See §8.

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

## 6. How it was migrated — done 7 Aug 2026

Kept here because the order was the safe part, and a future change of this
shape wants the same shape. Each step left the site correct, and the first
three were redundant with the four layers still running:

1. **Deploy hook + `supabase/functions/publish-site`.** Nothing changed for a
   visitor.
2. **Publish in the editor.** A rebuild could now be asked for. Watched working
   before anything was removed — that was the whole point of doing it second.
3. **The bake learned to write descriptions.** Still redundant.
4. **The layers deleted.** The only step that changed what a visitor gets, and
   it happened after every part of its replacement had been seen working.

The branch `photo-rebuild-test` held the proof for step 4 and has been deleted.

---

## 7. What the owner is told — done

`photoNote()` in `admin.js`. The old wording opened with **"Your photograph is
live straight away"** and warned about a flicker. Both were true of the old
design and neither is true now, and the first one was the dangerous one: an
owner who believes it uploads a photograph and walks away, and the site never
changes. Out-of-date wording that invites the wrong action is worse than no
wording.

It now says the opposite, in the same place: saving shows the photograph *here*
and leaves the site alone until Publish. Then it says the delay is about a
minute, ends by itself, and does not want Publish pressed twice — because the
owner's instinct on seeing an unchanged site is to press it again.

Two things it deliberately leaves out. **Quotas**, because a build allowance
this owner will not approach is a number that only makes them hesitate. And
**the flicker**, because there is no longer one to warn about; describing a
failure mode that has been removed teaches somebody to fear a thing that cannot
happen.

If the note changes again, the sentence that must survive is that the site
waits for Publish.

---

## 8. Why `data.js` still fetches the photos table

It looks like dead weight — nothing on a public page reads `content.photos` any
more, because the runtime swap that used to read it is gone. It was listed for
deletion. **Do not delete it.**

`tools/check-live-project.mjs` is the reader. It compares the descriptions in
the live database against `data/seed-photos.js` and reports drift — the owner
reworded an alt text, the seed file did not hear about it, and a visitor on the
offline fallback gets the old wording read out to them. It reaches that
comparison through `data.js`, deliberately, so that it is comparing *what the
site would render* and not its own second opinion about the table's shape.

The diagnostic is worth more than the saving. The fetch is one request inside a
`Promise.all` that already makes six others, so removing it saves no round
trip — only a column list.

What that does leave is a genuine oddity worth knowing before you touch this:
`shapePhotos` and `publicUrl` in `data.js` are now maintained for a tool rather
than for the site. §5.3 — `publicUrl` spelled the same way in `bake-photos.mjs`
and `data.js` — still holds, and this is why it is not obvious that it does.
