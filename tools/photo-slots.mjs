/* Where a photograph can go, what to call it, and whether it is decoration.

   Imported by tools/extract-photos.mjs, which stamps the markup and writes
   data/seed-photos.js from it, and by tools/gen-photo-sql.mjs, which writes the
   migration that creates one row per slot. One table, three files, no chance of
   the editor listing a slot the markup does not have.

   Same arrangement as tools/copy-labels.mjs and for the same reason: the label
   is what the *owner* reads in the editor, so it belongs beside the slot rather
   than in the seed file that every visitor downloads.

   ── the shape ──
   [file, [[slot, label, decorative], …]] in document order. The order is
   checked against the page: an image added or removed makes the extractor stop
   rather than silently re-number every slot after it.

   A slot may appear twice in one page. The home page's photo strip scrolls
   forever by holding two identical groups and sliding between them, so its nine
   photographs are drawn eighteen times — one decision each, drawn twice. The
   second group is aria-hidden, which is why those entries are marked
   decorative: the *slot* is a described photograph, but that particular drawing
   of it must go on announcing nothing.

   ── decorative ──
   True where the image is texture: behind a scrim, behind a gradient,
   aria-hidden, and carrying alt="" on purpose. The editor never asks for a
   description for these, and render.js never writes one. Getting it wrong in
   either direction is an accessibility bug — a described backdrop is noise, an
   undescribed photograph is a hole — so it is written down once, here. */

export const PHOTO_SLOTS = [
  ["index.html", [
    ["hero.main",       "The photograph behind the opening headline", false],

    ["story.a",         "The Idea — the upper photograph", false],
    ["story.b",         "The Idea — the lower photograph", false],

    ["kitchen.plate1",  "The Kitchen strip — 1st photograph", false],
    ["kitchen.plate2",  "The Kitchen strip — 2nd photograph", false],
    ["kitchen.plate3",  "The Kitchen strip — 3rd photograph", false],
    ["kitchen.plate4",  "The Kitchen strip — 4th photograph", false],
    ["kitchen.plate5",  "The Kitchen strip — 5th photograph", false],
    ["kitchen.plate6",  "The Kitchen strip — 6th photograph", false],
    ["kitchen.plate7",  "The Kitchen strip — 7th photograph", false],
    ["kitchen.plate8",  "The Kitchen strip — 8th photograph", false],
    ["kitchen.plate9",  "The Kitchen strip — 9th photograph", false],

    /* the aria-hidden repeat of the nine above */
    ["kitchen.plate1",  "The Kitchen strip — 1st photograph", true],
    ["kitchen.plate2",  "The Kitchen strip — 2nd photograph", true],
    ["kitchen.plate3",  "The Kitchen strip — 3rd photograph", true],
    ["kitchen.plate4",  "The Kitchen strip — 4th photograph", true],
    ["kitchen.plate5",  "The Kitchen strip — 5th photograph", true],
    ["kitchen.plate6",  "The Kitchen strip — 6th photograph", true],
    ["kitchen.plate7",  "The Kitchen strip — 7th photograph", true],
    ["kitchen.plate8",  "The Kitchen strip — 8th photograph", true],
    ["kitchen.plate9",  "The Kitchen strip — 9th photograph", true],

    ["cafe.card1",      "The Café — 1st card", false],
    ["cafe.card2",      "The Café — 2nd card", false],
    ["cafe.card3",      "The Café — 3rd card", false],
    ["cafe.card4",      "The Café — 4th card", false],

    ["wine.backdrop",   "The Wine Bar — the background behind the section", true],
    ["wine.board",      "The Wine Bar — the board photograph", false],

    ["gallery.g1",      "The gallery — 1st photograph", false],
    ["gallery.g2",      "The gallery — 2nd photograph", false],
    ["gallery.g3",      "The gallery — 3rd photograph", false],
    ["gallery.g4",      "The gallery — 4th photograph", false],
    ["gallery.g5",      "The gallery — 5th photograph", false],
    ["gallery.g6",      "The gallery — 6th photograph", false],

    ["visit.storefront", "Visit — the storefront photograph", false]
  ]],

  ["faq.html", [
    ["faq.masthead", "FAQ page — the banner photograph", true]
  ]],
  ["menu-food.html", [
    ["menuFood.masthead", "Food menu — the banner photograph", true]
  ]],
  ["menu-drinks.html", [
    ["menuDrinks.masthead", "Drinks menu — the banner photograph", true]
  ]],
  ["menu-wine.html", [
    ["menuWine.masthead", "Wine list — the banner photograph", true]
  ]]
];

/* Distinct slots, in the order they are first drawn, which is the order the
   editor lists them in: walk down the page and you walk down the panel. */
export function slotList() {
  const out = [];
  const seen = new Set();
  for (const [, slots] of PHOTO_SLOTS) {
    for (const [slot, label, decorative] of slots) {
      if (seen.has(slot)) {
        /* Drawn again. Decorative only if every drawing of it is. */
        const found = out.find((s) => s.slot === slot);
        found.decorative = found.decorative && decorative;
        continue;
      }
      seen.add(slot);
      out.push({ slot, label, decorative });
    }
  }
  return out;
}
