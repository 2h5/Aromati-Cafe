/* ═══════════════════════════════════════════════
   AROMATI — the replaced photograph, before the first paint
   ═══════════════════════════════════════════════

   This is the only script the pages load from <head>, and the only one that
   runs before the body is parsed. That position is the entire point of it.

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

   Nothing was wrong with the data. The replacement was already in localStorage
   before the page started parsing. It was simply not *asked for* until far too
   late.

   ── what this does about it ──
   Three things, in the order they matter:

     1. Reads the same cache data.js reads, synchronously, in <head>. On any
        reload or repeat visit the replacement URL is known here — before the
        <img> it belongs to has even been parsed.

     2. Starts the fetch immediately, as <link rel="preload">. The request now
        goes out in parallel with the shipped photograph instead of a few
        hundred milliseconds behind it.

     3. Hides *exactly* the slots that are going to change, and nothing else,
        until render.js has the real picture decoded and in place. A slot with
        no replacement is never touched, so the overwhelming majority of the
        page paints exactly as it does today.

   The result on a repeat visit is that the shipped photograph is never shown.
   Not shown-and-replaced: never painted at all.

   ── what it deliberately does not do ──
   A visitor arriving for the very first time has no cache, so nothing here
   knows a replacement is coming and nothing is hidden. That visit still shows
   the shipped photograph and still swaps. That is not an oversight — it is not
   solvable at runtime, because the URL only exists in a database the browser
   has not queried yet. The fix for that case is to bake the current
   photographs into the markup at build time; see README.md. What this file
   guarantees for the cold visit is narrower but still worth having: the swap,
   when it comes, is atomic and fully decoded, never a picture painting in
   over the top of another one.

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

  /* How long a slot may stay hidden waiting for its replacement.

     This is the only number in the file and it is a safety net, not a tuning
     knob. On the path this was written for — a repeat visit, the photograph
     immutable in the HTTP cache from `cacheControl: 31536000` — the reveal
     happens in single-digit milliseconds and this never fires. It exists for
     the visitor whose network dies between the cache being written and the
     page being opened. For them the shipped photograph appears a beat late,
     which is the correct outcome and the one the whole site is built around:
     when the live layer is unavailable, fall back to what is in git. */
  var HOLD_MS = 700;

  var hidden = {};      // slot → true, while it is waiting
  var sheet = null;
  var revealed = false;

  function overrides() {
    var out = {};
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      var photos = parsed && parsed.photos;
      if (!photos || typeof photos !== "object") return out;
      Object.keys(photos).forEach(function (slot) {
        var url = photos[slot] && photos[slot].url;
        if (typeof url === "string" && SAFE_URL.test(url)) out[slot] = url;
      });
    } catch (err) {
      /* Storage disabled, private browsing, an opaque origin, malformed JSON.
         All of them mean "no replacements known", none of them mean "stop". */
    }
    return out;
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

  function hide(slot) {
    var s = styleSheet();
    if (!s) return false;
    try {
      /* visibility, not display: the element keeps its box, so the hero and
         every framed figure hold their exact layout and nothing reflows when
         the picture arrives. A display:none here would collapse the hero to
         nothing and animate it back, which trades a wrong photograph for a
         jumping page.

         CSS.escape is not used because slot keys are already constrained to
         [a-z0-9.] by the editor and the seed, and it is absent in older
         browsers this site still renders in. The value is quoted, and a slot
         containing a quote could at worst break its own rule — which fails
         open, to visible. */
      s.insertRule('[data-photo="' + slot + '"]{visibility:hidden}', s.cssRules.length);
      hidden[slot] = true;
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
  function reveal(slot) {
    if (!hidden[slot]) return;
    delete hidden[slot];
    var s = styleSheet();
    if (!s) return;
    try {
      for (var i = s.cssRules.length - 1; i >= 0; i--) {
        if (s.cssRules[i].selectorText === '[data-photo="' + slot + '"]') {
          s.deleteRule(i);
        }
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

  var known = {};

  try {
    known = overrides();

    /* Armed before anything is hidden, not after. If the code between here and
       the end of this block throws, the timeout is already scheduled and the
       page still reveals itself. */
    window.setTimeout(revealAll, HOLD_MS);
    window.addEventListener("pageshow", function (e) { if (e.persisted) revealAll(); });

    Object.keys(known).forEach(function (slot) {
      preload(known[slot]);
      hide(slot);
    });
  } catch (err) {
    revealAll();
  }

  return {
    cacheKey: CACHE_KEY,
    urls: known,
    /* render.js calls these. They are the only reason this returns anything. */
    reveal: reveal,
    revealAll: revealAll,
    /* Was this slot held back? render.js uses it to decide whether a swap is
       replacing something a visitor can currently see — in which case the new
       picture is decoded before it goes in — or filling a box that has been
       deliberately blank for a few milliseconds, where it can go straight in. */
    isHeld: function (slot) { return !!hidden[slot]; }
  };
}());
