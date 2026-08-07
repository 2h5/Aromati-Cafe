/* The owner's photographs, correct in the HTML before the browser sees it.
   Cloudflare Pages middleware. Runs on every request to this site.

   ── why this exists ──
   A photograph the owner changes reaches the site immediately, but the *file*
   still names the previous one until somebody rebuilds. So the browser paints
   what the file says, render.js asks the database a moment later, and the
   picture changes in front of the visitor.

   tools/bake-photos.mjs fixes that at build time. This fixes the window
   afterwards — between the owner changing a photograph and the next build,
   which for a site nobody is maintaining is *all of the time*. It rewrites the
   src as the page streams out, so the HTML that arrives already names the
   current picture.

   Together: the build bakes what was true when it ran, and this covers
   anything that changed since. Neither needs the other to be correct.

   ── it must never be able to take the site down ──
   This sits in front of every request, which makes it the most dangerous file
   in the project. The rule it is built around: any failure returns the page
   exactly as the static host produced it. A database that is slow, down,
   deleted or answering nonsense costs nothing but a stale photograph, which is
   the same floor the rest of the site stands on. There is no path here that
   returns an error, and no path that waits on the network before responding
   with something.

   ── why middleware and not _worker.js ──
   An "advanced mode" _worker.js takes over serving entirely, and Cloudflare
   does not apply _headers to what a Function returns — so the Content-Security-
   Policy, the nosniff and the referrer policy would all have silently
   disappeared, on a site whose whole XSS story is that CSP. Middleware calls
   next() and hands back the asset server's own response with its own headers.

   Because "silently" is the word that matters there, the policy is also
   re-asserted below rather than trusted. If Cloudflare applied it, setting the
   identical value changes nothing; if it did not, the site still has it.
   tools/test-worker.mjs fails the build if what is written here ever stops
   matching _headers. */

/* Kept in step with config.js by tools/test-worker.mjs, which compares them and
   fails the build on a drift. Two copies of a constant is a thing to be
   uncomfortable about and it is the same trade data.js already makes with
   CACHE_KEY: this file cannot import a classic script, and a subrequest to read
   config.js on every cold isolate is a cost paid forever to avoid a check that
   costs nothing. The anon key is public by design — see config.js. */
const SUPABASE_URL = "https://yofoiqgknsqzsuwtlqvh.supabase.co";
const SUPABASE_KEY = "sb_publishable_pd33KkoVYvTcEpXcemAZnA_dhEI-qdf";

/* Mirrors the `/*` rule in _headers, asserted equal by tools/test-worker.mjs. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://yofoiqgknsqzsuwtlqvh.supabase.co; font-src 'self' data: ; connect-src 'self' https://yofoiqgknsqzsuwtlqvh.supabase.co; frame-ancestors 'self' https://aragvelipalazzolo.com https://www.aragvelipalazzolo.com; base-uri 'self'; form-action 'self'; object-src 'none'";

/* How long a photograph map is reused before the database is asked again.

   Sixty seconds is the whole latency budget the owner experiences: change a
   photograph, and within a minute every visitor is served HTML naming it. It
   is also what keeps this from being a database query per pageview — at any
   real traffic level the answer is already in hand and this costs nothing.

   The stale value is served *while* the refresh runs, never instead of a
   response. A visitor is never made to wait for Supabase. */
const TTL_MS = 60_000;

/* Module scope, so it survives between requests on the same isolate and is
   simply absent on a cold one — which is a cache miss, not an error. */
let photos = { at: 0, map: null };
let inflight = null;
let bakedAt = null;      // slot → storage_path, as the last build left it

async function fetchPhotos() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/photos?select=slot,storage_path`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
                 Accept: "application/json" },
      /* Cloudflare will happily hand back its own cached copy, which is fine
         and is a second layer under TTL_MS. */
      cf: { cacheTtl: 30, cacheEverything: true } }
  );
  if (!res.ok) throw new Error(String(res.status));
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("not a list");

  const map = new Map();
  for (const row of rows) {
    if (row && typeof row.slot === "string" && typeof row.storage_path === "string"
        && row.storage_path) {
      map.set(row.slot, row.storage_path);
    }
  }
  return map;
}

/* Never throws, never blocks longer than it has to, and never returns a
   half-built map. A failure leaves whatever was already known in place — an
   hour-old answer is worth incomparably more than no answer, because no answer
   means the visitor watches the photograph change. */
function currentPhotos(context) {
  const fresh = Date.now() - photos.at < TTL_MS;
  if (fresh && photos.map) return Promise.resolve(photos.map);

  if (!inflight) {
    inflight = fetchPhotos()
      .then((map) => { photos = { at: Date.now(), map }; return map; })
      .catch(() => {
        /* Back off for a full TTL rather than retrying on every request, so a
           database that is down cannot turn one visitor into a thousand
           outbound requests. */
        photos = { at: Date.now(), map: photos.map };
        return photos.map;
      })
      .finally(() => { inflight = null; });
  }

  /* Something already in hand is served now and refreshed behind the request.
     Only a cold isolate with nothing cached actually waits. */
  if (photos.map) {
    if (context && context.waitUntil) context.waitUntil(inflight);
    return Promise.resolve(photos.map);
  }
  return inflight;
}

/* What the last build wrote into the pages, so this only touches the slots
   that have changed since. Without it every baked photograph would be
   rewritten from a same-origin file to a Supabase URL on every request —
   correct, and needlessly slower for the common case where nothing has
   changed at all.

   Absent (an older build, or a bake that skipped) simply means "assume nothing
   is baked", which is safe: every slot with an upload gets rewritten. */
async function baked(context) {
  if (bakedAt) return bakedAt;
  try {
    const res = await context.env.ASSETS.fetch(
      new URL("/_baked.json", context.request.url));
    bakedAt = res.ok ? new Map(Object.entries(await res.json())) : new Map();
  } catch (err) {
    bakedAt = new Map();
  }
  return bakedAt;
}

/* Same rule data.js and tools/bake-photos.mjs use, and it has to stay the same
   one: render.js compares the src it finds against the URL it would build, and
   skips the slot when they match. That comparison is what stops this rewrite
   and the runtime layer from both acting on the same photograph. A different
   spelling here — a missing encode, a stray slash — makes them disagree and
   puts the swap back. */
function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/site-photos/` +
    String(path).split("/").map(encodeURIComponent).join("/");
}

export async function onRequest(context) {
  const { request, next } = context;

  let response;
  try {
    response = await next();
  } catch (err) {
    /* next() failing is the asset server failing; there is nothing useful to
       add and nothing to rewrite. */
    throw err;
  }

  try {
    /* The policy, whether or not the platform already applied it. Set, not
       appended: two CSP headers are intersected by the browser, and a
       duplicate that differed by a space would quietly forbid something. */
    response.headers.set("Content-Security-Policy", CSP);

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    /* The editor reads the photographs table itself and shows the owner what
       they just uploaded. Rewriting its markup would show them the picture
       from the last build instead. */
    if (new URL(request.url).pathname.endsWith("admin.html")) return response;

    const [map, already] = await Promise.all([currentPhotos(context), baked(context)]);
    if (!map || !map.size) return response;

    return new HTMLRewriter()
      .on("img[data-photo]", {
        element(el) {
          const slot = el.getAttribute("data-photo");
          const path = slot && map.get(slot);
          if (!path) return;
          /* Already in the file, put there by the build. Leave it: a
             same-origin asset with a long cache life beats a cross-origin
             fetch of the identical picture. */
          if (already.get(slot) === path) return;
          el.setAttribute("src", publicUrl(path));
        }
      })
      .transform(response);
  } catch (err) {
    /* Anything at all — a malformed row, HTMLRewriter refusing a document, a
       binding that is not there in some preview environment. The page the
       static host produced is already correct apart from one photograph. */
    return response;
  }
}
