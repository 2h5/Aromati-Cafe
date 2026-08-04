/* Opening hours — the single source for all five places they appear.
   Hand-authored, not extracted: today's markup cannot express a closed day or
   a per-day opening time, so there was nothing richer to extract from.

   Indexed by JavaScript's day number, 0 = Sunday, so SEED_HOURS[d.getDay()]
   needs no translation table. Always seven entries; a closed day is a flag,
   never a missing entry, because a missing entry is indistinguishable from a
   bug that dropped one.

   Times are minutes past midnight, matching how script.js already reasons
   about the clock (7 * 60). New York time always, wherever the page is read.

   The five consumers, all generated from this file in Phase 1:
     1. the live open/closed pill          (script.js)
     2. the Visit hours table              (index.html)
     3. the footer prose                   (all five pages)
     4. the mobile-menu prose              (all five pages, different format)
     5. the JSON-LD openingHoursSpecification (four pages, not faq.html) */

var SEED_HOURS = [
  /* 0 Sun */ { closed: false, opens: 7 * 60, closes: 22 * 60 },
  /* 1 Mon */ { closed: false, opens: 7 * 60, closes: 22 * 60 },
  /* 2 Tue */ { closed: false, opens: 7 * 60, closes: 22 * 60 },
  /* 3 Wed */ { closed: false, opens: 7 * 60, closes: 23 * 60 },
  /* 4 Thu */ { closed: false, opens: 7 * 60, closes: 23 * 60 },
  /* 5 Fri */ { closed: false, opens: 7 * 60, closes: 23 * 60 },
  /* 6 Sat */ { closed: false, opens: 7 * 60, closes: 23 * 60 }
];

/* Single dates that do not follow the week above — a holiday closure, or a day
   that opens late. Keyed by the date in New York, "YYYY-MM-DD", and shaped
   exactly like a day of the week so that anything reading one can read the
   other without a translation:

     "2026-12-25": { closed: true, opens: null, closes: null, note: "Christmas Day" }

   Keyed rather than a list because only two questions are ever asked of it —
   "is there one for today", which is a key lookup, and "which are still to
   come", which is a walk over the keys. ISO dates sort and compare correctly as
   plain strings, so neither call site has to parse a date, and parsing dates is
   where timezone bugs come from.

   Empty, and it should stay empty. This is the site as it shipped, and the site
   as it shipped had no closures; the owner's are in `hours_exceptions` in the
   database. What this being here buys is that the shape is real when the
   database is not — the offline floor can carry a closure rather than having
   nowhere to put one. */
var SEED_HOURS_EXCEPTIONS = {};

/* Free text under the Visit hours table. Copy, not hours data — it is here
   rather than in seed-copy.js because it is the one line that has to stay
   truthful when the hours change. */
var SEED_HOURS_NOTE = "Mornings for coffee, evenings for wine.";
