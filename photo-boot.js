/* ═══════════════════════════════════════════════
   AROMATI — the replaced photograph, before the first paint
   ═══════════════════════════════════════════════

   This is the only script the pages load from <head> apart from config.js, and
   the only one that runs before the body is parsed. That position is the entire
   point of it.

   ── the bug this exists to end ──
   Every photograph on the site ships in the markup as a real src:

       <img data-photo="hero.main" src="assets/web/hero-dining.jpg" ...>

   which is what makes the site correct from file://, with no database, and
   with JavaScript off. It is not a mistake and it is not going away.

   But render.js — like every other script — is at the *bottom* of the body.
   So when the owner has replaced a photograph, the browser's preload scanner
   finds the shipped file on line 129, fetches it (same origin, fast), paints
   it, parses another four hundred lines, and only then does renderPhotos()
   set the replacement src. The visitor watches the old photograph for as long
   as the new one takes to arrive. On the hero — above the fold, the largest
   element on the page — it reads as the site being broken.

   ── the second blink, which is the one that never went away ──
   The paragraphs above were written against *one* of the two swaps on this
   page, and for a long time the file only closed that one.

   There are two. The cache is one edit behind the database by construction —
   data.js writes it at the *end* of a visit, so what it holds is whatever the
   database said last time. That gives a returning visitor:

       shipped photograph  →  cached photograph  →  the photograph in the CMS
       └──── closed by hiding the slot ────┘   └──── still a visible swap ────┘

   The first arrow is what the original version of this file removed. The
   second one fires on *every* reload for as long as the owner keeps editing,
   because every edit puts the cache one behind again. From the owner's chair
   it looks like the site never stops flashing the old picture — which is
   exactly the report that produced this rewrite.

   So the hold now runs one step further: a slot stays hidden not until its
   *cached* picture is decoded, but until the refresh that might replace it has
   come back and the *final* picture is decoded. render.js drives that; see
   `settlePhotos` there. What a visitor sees is one photograph, once, and it is
   the right one.

   ── what this does about it ──
   Four things, in the order they matter:

     1. Reads the same cache data.js reads, synchronously, in <head>. On any
        reload or repeat visit the replacement URL is known here — before the
        <img> it belongs to has even been parsed.

     2. Starts the fetch immediately, as <link rel="preload">. The request now
        goes out in parallel with the shipped photograph instead of a few
        hundred milliseconds behind it.

     3. Hides *exactly* the slots that are going to change, and nothing else,
        until render.js has the final picture decoded and in place. A slot with
        no replacement and no chance of one is never touched, so most of the
        page paints exactly as it does today.

     4. When the site is wired to a CMS at all, also hides the one image on
        each page that sits above the fold — `data-photo-critical` — even with
        no cache to say it is going to change. This is the first-visit case the
        old version of this file gave up on, and the paragraph below explains
        what it costs.

   ── the cold visit, and what it now costs ──
   A visitor arriving for the very first time has no cache, so nothing here
   knows whether a replacement is coming. The old behaviour was to show the
   shipped photograph and swap if one turned up. The new behaviour is to hold
   the one above-the-fold image until the database has answered.

   That is a real trade and it is worth stating plainly. It buys: no visitor,
   ever, on any visit, sees a photograph replaced under them. It costs: on a
   first visit the hero photograph appears one network round trip late — call
   it 100–400ms on a working connection — and the visitor looks at a dark
   brand-coloured panel until it does. The hero's own entrance choreography
   (the eyebrow, the title lifting its words, the rule, the buttons) is not
   held and plays over that panel exactly on time, so the page is never
   *still*; it is the photograph behind the words that arrives a beat later.

   Only `data-photo-critical` pays this. Everything below the fold keeps the
   shipped picture and swaps if it has to, because a swap nobody is looking at
   is not worth a hold — and holding the whole page would be the SPA loading
   screen this site exists not to be.

   And it is only paid when a CMS is actually configured. Over file://, or with
   config.js emptied, no request is ever going to arrive, so nothing is held
   and the page behaves precisely as it did in Phase 1.

   ── why an external file and not four lines inline ──
   Inline would be simpler and is not available. script-src is 'self' with no
   'unsafe-inline' (see _headers), and tools/check-csp.mjs fails the build if
   an inline <script> appears anywhere. This is also why the rules below are
   inserted through CSSOM rather than written into a <style> block: an empty
   <style> element passes the policy, and insertRule is not gated by it.

   ── the failure this must never cause ──
   Hiding something on the critical path means a bug here is an invisible hero
   rather than a wrong one, which is worse. So: every step is wrapped, the
   reveal runs from a timeout that is armed before anything is hidden, and any
   failure at all reveals everything immediately. There is no path through this
   file that leaves a photograph hidden. */

var AROMATI_PHOTO_BOOT = (function () {
  "use strict";

  /* MUST match CACHE_KEY in data.js. The two are checked against each other at
     runtime — data.js compares its own key to this one and warns if they have
     drifted, because the symptom otherwise is silent: this file finds no cache,
     hides nothing, preloads nothing, and the blink quietly comes back with
     every page still working perfectly. */
  var CACHE_KEY = "aromati:content:v3";

  /* Same rule as render.js. A src is a URL the owner typed that the browser
     goes and fetches, and this file makes the browser fetch it earlier than
     render.js does — so it applies the identical test rather than trusting
     that the value came from somewhere already checked. */
  var SAFE_URL = /^https:\/\/[^\s]+$/i;

  /* The ceiling on how long any photograph may be hidden. One number, covering
     everything: the database round trip, the decode, and any bug between here
     and render.js.

     It was 700ms when the only thing being waited for was a decode out of the
     HTTP cache. It is longer now because the wait includes one request to
     Supabase, which on the path this was written for lands in 100–400ms and
     never comes near this. What is on the other side of the number is a
     visitor on a dying connection: at 1200ms they get the picture the site
     already had — cached, or the one in git — and the page stops waiting.

     Raising it further would buy correctness on slower connections at the cost
     of a longer dark hero for everyone whose network fails outright. Lowering
     it puts the blink back for anyone slower than the number. This is the
     knob; it is deliberately the only one.

     `sealed` below is the other half of the same decision — see it. */
  var HOLD_MS = 1200;

  /* A reserved key, not a slot. It stands for the one above-the-fold image on
     the page, which is held as a group rather than by name: nothing in <head>
     can query the DOM, so this cannot be a list of slot names without that
     list drifting from the markup silently. A single attribute selector costs
     one rule and cannot go stale — an image that gains or loses the attribute
     changes what is held with no edit here. */
  var CRITICAL = ":critical";

  var hidden = {};      // key → true, while it is waiting
  var sheet = null;
  var revealed = false;

  /* Set when HOLD_MS fires with things still hidden — i.e. the page gave up
     waiting and revealed whatever it had.

     render.js reads this and, if it is set, declines to apply photographs from
     a refresh that arrives afterwards. That looks like throwing away a correct
     answer, and it is. The alternative is worse: the visitor is by then
     *looking* at the cached photograph, and dropping the new one in on top is
     precisely the blink this whole file exists to remove — reintroduced by the
     safety net meant to prevent a different failure. The fresh content is
     still written to the cache by data.js, so the next load opens on the right
     picture with no wait at all. One late visit shows one-edit-old
     photographs; nobody watches a photograph change. */
  var sealed = false;

  function selectorFor(key) {
    return key === CRITICAL ? "[data-photo-critical]" : '[data-photo="' + key + '"]';
  }

  /* Two answers, and the second one is easy to overlook and load-bearing.

     `urls` is what it has always been: the slots with a usable replacement.

     `known` is whether this browser has a record of what the CMS said at all —
     a cache that parsed and carried a photos object. That is a different
     question from "are there any replacements", and conflating them is what
     made the hero sit behind a dark panel on every load of a site whose hero
     has no replacement and never had one. An empty photos map is not silence;
     it is the site saying, in as many words, that these slots are showing what
     they ship with. */
  function readCache() {
    var out = { urls: {}, known: false };
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      var photos = parsed && parsed.photos;
      if (!photos || typeof photos !== "object") return out;
      out.known = true;
      Object.keys(photos).forEach(function (slot) {
        var url = photos[slot] && photos[slot].url;
        if (typeof url === "string" && SAFE_URL.test(url)) out.urls[slot] = url;
      });
    } catch (err) {
      /* Storage disabled, private browsing, an opaque origin, malformed JSON.
         All of them mean "nothing is known", none of them mean "stop". */
    }
    return out;
  }

  /* Is there a database to wait for at all?

     The same test data.js makes before it fetches, made here because this file
     now has to decide something before data.js exists: whether to hold the
     above-the-fold image on a visitor with no cache. Holding it when nothing
     is ever going to arrive would be a dark hero until HOLD_MS on every
     file:// open and on every deploy with config.js emptied — the two states
     this site treats as fully supported.

     Two copies of a rule is a thing worth being uncomfortable about, and this
     one is safe to duplicate in a way CACHE_KEY is not: if the two ever
     disagree, render.js releases the hold the moment its first paint is done,
     because it asks data.js — not this file — whether a refresh is coming. A
     drift here costs a few milliseconds, not a hidden photograph. */
  function liveContent() {
    try {
      return typeof AROMATI_CONFIG === "object" && AROMATI_CONFIG &&
        typeof AROMATI_CONFIG.url === "string" && /^https:\/\//.test(AROMATI_CONFIG.url) &&
        typeof AROMATI_CONFIG.anonKey === "string" && AROMATI_CONFIG.anonKey.length > 20;
    } catch (err) {
      return false;
    }
  }

  /* An empty <style> satisfies style-src 'self'; everything after this is
     CSSOM, which CSP does not gate. Building it here rather than shipping the
     rules in styles.css is deliberate — the rules have to name specific slots,
     and which slots those are is not known until the cache has been read. */
  function styleSheet() {
    if (sheet) return sheet;
    try {
      var el = document.createElement("style");
      el.setAttribute("data-photo-boot", "");
      document.head.appendChild(el);
      sheet = el.sheet;
    } catch (err) {
      sheet = null;
    }
    return sheet;
  }

  function hide(key) {
    var s = styleSheet();
    if (!s) return false;
    try {
      /* visibility, not display: the element keeps its box, so the hero and
         every framed figure hold their exact layout and nothing reflows when
         the picture arrives. A display:none here would collapse the hero to
         nothing and animate it back, which trades a wrong photograph for a
         jumping page. It would also break script.js, which measures the
         masthead and the hero to place the scroll cue and the parallax.

         What is behind the hidden image is not the page's cream — styles.css
         gives .hero__media and .mhead__bg a dark brand panel precisely so this
         hold reads as intentional and the cream hero type stays legible over
         it. The two changes belong together.

         CSS.escape is not used because slot keys are already constrained to
         [a-z0-9.] by the editor and the seed, and it is absent in older
         browsers this site still renders in. The value is quoted, and a slot
         containing a quote could at worst break its own rule — which fails
         open, to visible. */
      s.insertRule(selectorFor(key) + "{visibility:hidden}", s.cssRules.length);
      hidden[key] = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function preload(url) {
    try {
      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      /* The hero is the largest contentful paint. Telling the browser that
         explicitly matters more here than usual, because this request is
         competing with the shipped photograph it is going to replace — which
         the preload scanner has already queued and which nobody will ever
         see. */
      link.setAttribute("fetchpriority", "high");
      link.href = url;
      document.head.appendChild(link);
    } catch (err) {
      /* An unsupported rel is not a failure worth acting on: the fetch simply
         happens later, from render.js, exactly as it does today. */
    }
  }

  /* Reveal is idempotent and total. Called per-slot as each picture lands, and
     called for everything by the timeout, by any error, and by pagehide — a
     bfcache restore must never come back to a hidden hero. */
  function reveal(key) {
    if (!hidden[key]) return;
    delete hidden[key];
    var s = styleSheet();
    if (!s) return;
    try {
      var want = selectorFor(key);
      for (var i = s.cssRules.length - 1; i >= 0; i--) {
        if (s.cssRules[i].selectorText === want) s.deleteRule(i);
      }
    } catch (err) {
      revealAll();
    }
  }

  function revealAll() {
    if (revealed) return;
    revealed = true;
    hidden = {};
    try {
      var s = styleSheet();
      if (!s) return;
      while (s.cssRules.length) s.deleteRule(0);
    } catch (err) {
      /* Last resort: if the stylesheet itself cannot be emptied, take the
         element out of the document entirely. Its rules go with it. */
      try {
        var el = document.querySelector("style[data-photo-boot]");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch (err2) { /* nothing left to try, and nothing left to break */ }
    }
  }

  /* The deadline. Distinct from revealAll() only in that it records *why*
     everything became visible, which is the fact render.js needs in order not
     to undo it. */
  function expire() {
    if (revealed) return;
    sealed = true;
    revealAll();
  }

  var known = {};
  var live = false;
  var cacheKnown = false;

  try {
    var cache = readCache();
    known = cache.urls;
    cacheKnown = cache.known;
    live = liveContent();

    /* Armed before anything is hidden, not after. If the code between here and
       the end of this block throws, the timeout is already scheduled and the
       page still reveals itself. */
    window.setTimeout(expire, HOLD_MS);
    window.addEventListener("pageshow", function (e) { if (e.persisted) revealAll(); });

    Object.keys(known).forEach(function (slot) {
      preload(known[slot]);
      hide(slot);
    });

    /* The cold-visit hold — and note what it is gated on, because the first
       version of this was gated on `live` alone and that was wrong in a way
       that took a browser to see.

       This rule holds the above-the-fold image without knowing whether it is
       going to change. That is the right call when nothing is known. It is a
       bad call the moment something *is* known, and on a returning visit
       something always is: the cache carries the CMS's own answer for every
       slot, including "this one has no replacement".

       Held on anyway, the hero on a site whose hero has no upload sat behind
       the dark panel on every single load, waiting out a request that came
       back saying nothing had changed, and then appeared with a jolt — an
       image that had been decoded and ready the whole time. Measured at 177ms
       held with `complete=true`, revealed at 225ms. That is not the blink this
       file exists to remove; it is a new one, paid by every visitor on every
       load, in exchange for nothing.

       So a returning visitor is held to what the cache actually says: the
       slots with a replacement are hidden by name above, and everything else
       paints immediately, exactly as it did before any of this existed.

       What that gives up is narrow and self-correcting. If the owner uploads a
       photograph for a slot that had none, the next visitor to arrive with an
       older cache sees the shipped picture swap once — and their cache is
       written before they leave, so every load after that is clean. One swap,
       once, per visitor, per slot that goes from empty to filled. Against a
       dark hero on every load forever, it is not a close call. */
    if (live && !cacheKnown) hide(CRITICAL);
  } catch (err) {
    revealAll();
  }

  return {
    cacheKey: CACHE_KEY,
    urls: known,
    /* The reserved key, exported so render.js names it from here rather than
       writing the string out a second time. */
    CRITICAL: CRITICAL,
    /* render.js calls these. They are the only reason this returns anything. */
    reveal: reveal,
    revealAll: revealAll,
    /* Was this slot held back? render.js uses it to decide whether a swap is
       replacing something a visitor can currently see — in which case the new
       picture is decoded before it goes in — or filling a box that has been
       deliberately blank for a few milliseconds, where it can go straight in. */
    isHeld: function (key) { return !!hidden[key]; },
    /* Did the page give up waiting? If so, refreshed photographs are dropped
       rather than swapped in. See `sealed` above. */
    isSealed: function () { return sealed; },
    /* Is a refresh worth waiting for? Read by nothing on the happy path —
       render.js asks data.js, which is the file that actually decides — and
       exported so tools/test-photo-boot.mjs can assert the cold-visit hold is
       gated on it. */
    isLive: function () { return live; }
  };
}());
