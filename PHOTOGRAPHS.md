# Photographs: why a picture never changes in front of a visitor

This file exists because the same bug came back three times wearing different
clothes, and each time it was invisible to the person who fixed it. If you are
about to change anything in `photo-boot.js`, `render.js`, `functions/_middleware.js`,
`tools/bake-photos.mjs`, or the photo handling in `data.js`, read this first.

The symptom, every time, was the same: **the page paints one photograph, then
replaces it with another while the visitor watches.** The owner calls this "the
blink". It is worst on the hero, because the hero is the largest thing on the
page and the first thing anyone looks at.

---

## 0. Where this stands — 7 Aug 2026

**Working, verified on the deployed site**, not inferred from the code.

All four layers are live at `aromati-cafe.pages.dev`, served by a Git-connected
Cloudflare Pages project building from `main`. Last verified against production
after commit `3203841`:

| Check | Expected | Observed |
| --- | --- | --- |
| Middleware ran | no `ETag` header | none |
| Returning visitor gets fresh HTML | `200` + body | `200`, 33924 bytes |
| Handshake present, charset still first | meta at byte ~79 | byte 79, charset byte 43 |
| Slots declared | every slot with an upload | 9 |
| Build compiled the Function | `Compiled Worker successfully` | present in build log |

Three bugs found and fixed, in order: the two-swap problem (§3.1), the ETag that
outlived its photograph (§3.2), and photo-boot hiding a correct photograph
(§3.3). The last two were both found *in production, after the layer above them
had been verified* — see §6 for why that keeps happening.

### Open

- [ ] **The CMS wording is now out of date and overstates the problem.** See §7.
      Nothing else is outstanding.

### Deliberately not done

- **An accurate "publishes left this month" counter** in the editor. It would
  need a Cloudflare API token held somewhere the browser can reach, which means
  a Supabase Edge Function to hold it. Explained and declined — the number is
  not actionable for the owner, because uploading a photograph does not consume
  a build at all.
- **Rebuilding on every photo change** (a Supabase webhook → deploy hook). The
  middleware makes it unnecessary for correctness, and it would spend the
  monthly build quota on something the owner never sees.

---

## 1. Why this is hard at all

Every photograph ships in the markup as a real `src`:

```html
<img data-photo="hero.main" src="assets/web/hero-wine-frame.webp">
```

That is deliberate and is not negotiable. It is what makes the site correct
from `file://`, with no database, with JavaScript disabled, and after we are
gone. The whole project stands on that floor: **when the live layer is
unavailable, serve what is in git.**

But the owner can replace any photograph from the CMS, and that writes to
Supabase — not to the file. So the markup says one thing and the database says
another, and something has to reconcile them.

If that reconciliation happens *in the browser*, it cannot be won. The browser
must paint before it can ask the database, so there are exactly two options:

- show the old picture, then swap → **the blink**
- show nothing, then reveal → **a blank hero**

There is no third option. Several attempts were made to find one — decoding
off-DOM before assigning, holding the paint, masking the reload on `pagehide` —
and all of them failed, because they were all trying to win a race that starts
before the starting gun. Two of those attempts are still in the git history
(`05fc9d7`, `430ef48`) with their reasoning intact, and were reverted.

**The fix is to remove the disagreement, not to hide it.** That means resolving
the photograph *before the HTML reaches the browser*. Everything below is that
idea, applied at two different moments.

---

## 2. The four layers

They compose. Each one is correct on its own, and each degrades to the one
below it. Nothing here needs anything above it to be right.

### Layer 1 — the bake (build time)

`tools/bake-photos.mjs`, run by `npm run build` immediately after `vite build`.

Downloads the current photograph for every slot, writes the files into `dist/`,
and rewrites the `src` in the built pages to point at them. The HTML that
reaches the browser already names the right picture. It paints once.

Key properties:

- **Writes to `dist/` only.** The source tree is never touched, so `file://`,
  `vite dev`, a fresh clone and a deleted database all behave exactly as they
  did before it existed. Running a build never shows up in `git status`.
- **Fail-soft.** Unreachable database, no `fetch`, no `config.js` → prints why,
  exits 0, leaves `dist/` as vite built it. A deploy must never fail because
  Supabase was slow.
- **Never half-bakes.** A page is rewritten only after its photograph is on disk.
- **`admin.html` is excluded on purpose.** The editor reads the database at
  runtime; rewriting its markup would show the owner the picture from the last
  build rather than the one they just uploaded.
- Baked files are named by a hash of the storage path, so a different
  photograph is a different URL and can be cached hard.

It also writes **`dist/_baked.json`** — slot → storage path, as this build left
it. Layer 2 needs that.

And it **stamps `dist/data/seed-photos.js`** with `baked: "<storage path>"` for
each slot. `data.js` compares that against what the database says: equal means
the markup already has this picture, so no override is reported and `render.js`
leaves it alone. Without this stamp the bake is *worse than useless* — the page
would open on the correct photograph and then be handed the same photograph
again from the bucket URL, which is a fetch, a decode and a repaint for nothing.

### Layer 2 — the middleware (request time)

`functions/_middleware.js`, a Cloudflare Pages Function.

The bake is only true as of the last build. Between the owner uploading a
photograph and the next build — **which, for a site nobody is maintaining, is
all of the time** — the files are stale again. This closes that window.

On each HTML request it reads the photos table (cached 60s), compares against
`_baked.json`, and rewrites the `src` of any slot that has changed since the
build. It uses `HTMLRewriter`, so this is a streaming transform, not a
buffer-and-replace.

Deliberate choices:

- **Middleware, not `_worker.js`.** An advanced-mode `_worker.js` takes over
  serving entirely, and **Cloudflare does not apply `_headers` to what a
  Function returns**. The CSP, `nosniff` and referrer policy would all have
  vanished silently, on a site whose entire XSS story is that CSP. Middleware
  calls `next()` and hands back the asset server's own response. The policy is
  *also* re-asserted in code rather than trusted, and `tools/test-worker.mjs`
  fails the build if it ever stops matching `_headers`.
- **`_routes.json`** confines the Function to the five public pages plus `/`.
  Without it, Cloudflare invokes it for *every* request — every stylesheet,
  every photograph — which is ~40 Worker invocations per pageview instead of 1.
- **It can never take the site down.** Every failure path returns the untouched
  response. A database that is slow, down, deleted or answering nonsense costs
  a stale photograph and nothing else.
- **Nothing waits on the network when an answer is in hand.** A stale map is
  served immediately while the refresh runs behind the request via `waitUntil`.

### Layer 3 — the meta handshake (`aromati-photos-current`)

This one is subtle and was the last bug found. See §3.3.

`photo-boot.js` runs in `<head>` and hides any slot its cache says is about to
be replaced, so the visitor never sees a swap. That is right when the markup is
stale — and actively harmful once layers 1 and 2 have made the markup current,
because it blanks a *correct* photograph until `render.js` has parsed, run, and
heard back from the database.

It cannot work this out for itself: it runs at line ~50 of `<head>`, **before a
single `<img>` has been parsed and before `seed-photos.js` has loaded.** It has
nothing to compare against. Only the server knows.

So the middleware writes, immediately after `<meta charset>`:

```html
<meta name="aromati-photos-current" content="story.b gallery.g3 wine.board …">
```

and `photo-boot.js` skips hiding (and preloading) those slots.

- **After `<meta charset>`, not prepended to `<head>`** — the character set must
  stay inside the first 1024 bytes or the browser guesses it.
- **Slot names only, no URLs** — keeps it to a couple of hundred bytes.
- **Absent means the old behaviour**, unchanged: `file://`, a static host with
  no Function, an older deployment, or a database that answered with nothing.
- A slot wrongly named here costs exactly what the site did before any of this
  existed — `render.js` decodes the replacement off-DOM and swaps it in.
  **Never a blank.**

### Layer 4 — the runtime (`data.js` + `render.js`)

The original mechanism, still there and still the last line of defence. It
fetches the photos table in the browser and sets any `src` that is still wrong.

With layers 1–3 working it almost never has anything to do. `render.js` skips a
slot when the `src` it finds already equals the URL it would set — which is why
`publicUrl()` **must be spelled identically** in `data.js`,
`tools/bake-photos.mjs` and `functions/_middleware.js`. A missing
`encodeURIComponent` in one of them makes them disagree and puts the swap back.
`tools/test-worker.mjs` runs all three over paths containing spaces, `&` and
non-ASCII and requires identical output.

---

## 3. The three bugs, and why each was invisible

### 3.1 The two-swap problem (the original)

Shipped `src` in git → cached photograph → current CMS photograph. The old
`photo-boot.js` closed only the first arrow. Fixed by layers 1 and 2.

### 3.2 The ETag that outlived its photograph

**Found in production, after layers 1 and 2 were live and verified.**

Cloudflare builds the `ETag` from the static file on disk. That file does not
change when the owner uploads a photograph — only what the middleware rewrites
*into* it does. So the body varied and its ETag did not, which is the one thing
an ETag is a promise about.

A returning browser sent `If-None-Match`, the asset server compared it against
the unchanged file, and answered **304 Not Modified with no body**. The browser
reused the HTML it already had, naming the previous photograph, and `render.js`
swapped it a moment later.

Measured directly:

```
$ curl -sS -o /dev/null -w '%{http_code}' \
    -H 'If-None-Match: "1e5f70e40e5e0b9a5460d99d8e21874c"' https://…/
304
```

**A first visit was always correct**, which is exactly what made it invisible —
it can only be reproduced by someone who loaded the page before the upload.

Fixed in two halves, both needed:

- the request's validators are stripped before `next()`, so the asset server is
  never asked a question it cannot answer correctly;
- the response's `ETag` and `Last-Modified` are dropped for any page the
  middleware may rewrite, so a browser cannot store a new one — a visitor
  already holding the stale ETag heals on their next request rather than one
  blink later.

The drop happens **before** the "no photographs" early return, because "nothing
to rewrite" is itself an answer that changes the moment the owner uploads
something.

Cost: a full body instead of a 304 on six small pages that already revalidate
on every visit (`Cache-Control: max-age=0, must-revalidate`). Assets are
untouched — `_routes.json` keeps this code away from them and they keep their
long cache lives.

### 3.3 photo-boot hiding a photograph that was already right

**Found immediately after 3.2, while the owner was still testing.**

`photo-boot.js` hid every slot in its cached override map unconditionally:

```js
Object.keys(known).forEach(function (slot) {
  preload(known[slot]);
  hide(slot);           // ← even when the markup already had this exact URL
});
```

Baked slots were already safe by accident: `data.js`'s `alreadyInMarkup()` gives
them `url: null`, so they never enter the cache as overrides. But
**middleware-rewritten slots did enter it** — so every slot layer 2 fixed got
hidden on repeat visits despite the markup being correct, and stayed blank
until `render.js` answered.

That is a blank hero caused by the very mechanism meant to prevent a blink.

Fixed by layer 3.

---

## 4. What a visitor actually gets

| Situation | What happens |
|---|---|
| First-ever visit, photo baked | Correct photograph, one paint. No JS needed. |
| First-ever visit, photo uploaded since the build | Middleware rewrote it. Correct photograph, one paint. |
| Repeat visit, nothing changed | Correct photograph, one paint, no hiding (layer 3). |
| Repeat visit, owner changed a photo <60s ago | Middleware cache still warm → old photo, then a decoded swap. Self-corrects within a minute. |
| Owner changed a photo >60s ago, no rebuild | Correct photograph, served cross-origin from Supabase. One paint. |
| Supabase down | Whatever the last build baked. One paint. |
| `file://` or a host with no Functions | Whatever is in git, then the runtime layer. Old behaviour. |

**The 60-second window is the design, not a fault.** It is the middleware's
photo-map TTL and the entire latency the owner experiences: change a
photograph, and within a minute every visitor is served HTML naming it.

---

## 5. Verifying it, without guessing

These are the checks that actually distinguish "working" from "looks fine".

**Is the middleware running?**

```sh
curl -sS -o /dev/null -D - https://aromati-cafe.pages.dev/ | grep -i etag
```

No `ETag` → the middleware handled it. An `ETag` → it did not.

> The CSP header does **not** prove the middleware ran — `_headers` supplies the
> same header on the static path. Only the absent ETag is an honest signal.

**Does a returning visitor get fresh HTML?**

```sh
curl -sS -o /dev/null -w '%{http_code} %{size_download}\n' \
  -H 'If-None-Match: "<any old etag>"' https://aromati-cafe.pages.dev/
```

Must be `200` with a non-zero body. A `304` is bug 3.2 returning.

**Which photograph is actually being served?**

```sh
curl -sS https://aromati-cafe.pages.dev/ | grep -o '<img[^>]*data-photo="hero.main"[^>]*>'
```

**Is the meta handshake present, and before the boot script?**

```sh
curl -sS https://aromati-cafe.pages.dev/ | head -c 400
```

`<meta charset>` must still be first; `aromati-photos-current` right after it.

**Locally, against the real Workers runtime** — `HTMLRewriter` does not exist in
Node and cannot be honestly stubbed, so this is the only way to exercise the
rewrite:

```sh
npm run build
npx wrangler pages dev dist
```

**The static drift guards:**

```sh
npm run test:worker    # middleware vs _headers, config.js, data.js, photo-boot.js
npm run test:bake      # the bake writes what it claims to
npm test               # everything
```

---

## 6. Things that will silently break this

Every one of these leaves a site that loads, looks perfect, and blinks.

1. **Editing `_headers` without editing `CSP` in the middleware.** Guarded.
2. **Changing the Supabase project in `config.js` only.** Guarded.
3. **Spelling `publicUrl` differently in any of the three copies.** Guarded.
4. **Renaming the meta in one file but not the other.** Guarded.
5. **Removing the ETag drop, or moving it after the early return.** Guarded.
6. **Adding a page and not listing it in `_routes.json`.** Guarded — the test
   reads the pages that exist rather than a list written down.
7. **Deploying by direct upload instead of from git.** *Not* guarded, and it
   silently disables layer 2 entirely: a direct upload does not compile
   `functions/`. The site will still bake correctly at build time and will still
   blink for anything uploaded since. The project must stay Git-connected.
8. **Letting `photo-boot.js` hide a slot the server vouched for.** Guarded.

The guards live in `tools/test-worker.mjs` and `tools/test-photo-boot.mjs`.
Every one of them has been sabotage-verified: the check was broken deliberately
and required to fail. **If you add a check here, do that too** — this file's
history is three bugs whose tests all passed.

---

## 7. What the owner is told — ⚠️ needs rewriting

`photoNote()` in `admin.js` (~line 1429) renders the note on the Photos panel.
**It was written before the middleware existed and is now wrong.** No code has
been changed for this yet; this section is the brief.

### What it currently says

> **Your photograph is live straight away.** Save it and visitors see it on
> their next visit — there is nothing else you need to do for the picture to be
> on the site.
>
> **One thing to know.** Until the site is republished, a visitor may glimpse
> the previous picture for a moment before the new one appears. Republishing
> puts the photograph into the page itself and that flicker stops. It is a
> separate step, done by whoever looks after the site — so change all the
> photographs you want to change, then ask for it once.

### Why it is wrong now

The second paragraph describes the world before layer 2. With the middleware
live:

- **The flicker does not happen at all**, republished or not. The middleware
  rewrites the `src` at the edge, so the HTML already names the new photograph.
- **Republishing is no longer needed for correctness.** It is now purely a
  performance nicety: the bake moves the picture from a cross-origin Supabase
  fetch to a same-origin file with a long cache life.
- **"Ask whoever looks after the site" is the wrong instruction** for a site
  sold on a one-time fee with nobody maintaining it. It tells the owner to
  chase a person who by design does not exist, for something they do not need.
- The only genuinely true caveat is the **60-second window** (§4) — the
  middleware's photo-map TTL — during which a returning visitor may still get
  the previous picture.

### What it should say instead

Roughly, and in the editor's existing voice:

- Your photograph is live straight away. Nothing else to do.
- Give it about a minute to reach everyone. If you reload immediately you may
  still see the old one; that is normal and clears itself.
- No republishing, no quota, nobody to ask.

Constraints when writing it:

- It must **not** name a deployment quota. Uploading a photograph does not
  cause a Cloudflare build. Only a git push does.
- It must **not** promise instantaneous global propagation either — the
  60-second TTL is real and a returning visitor inside it sees the old picture.
- Keep it honest about the one case that still degrades: if the site is ever
  moved to a host with no Functions, or deployed by direct upload, the old
  behaviour returns (§6, item 7).
- `tools/test-admin.mjs` covers the Photos panel; check whether it asserts on
  this text before changing it.
