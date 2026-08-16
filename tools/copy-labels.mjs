/* What each copy field is called in the editor.

   The 62 values come out of the markup automatically (tools/extract-copy.mjs).
   These do not, and cannot: "hero.ctaPrimary" is a key, not a name, and an
   owner opening the editor should never have to read one. Deriving a label
   from a key produces exactly the kind of interface that makes people ring the
   developer instead of fixing their own typo.

   So this file is hand-written, and it is the one place in the pipeline that
   is. tools/gen-seed-sql.mjs refuses to run if it and the extracted data
   disagree by even one key — a field with no label would otherwise reach the
   editor as a blank row.

   Wording rules, from the Uptown port:
     - describe the position on the page, not the database column
     - "Paragraph under the headline", never "lede"
     - help is for a rule the owner cannot see, not for restating the label

   maxLength is set only on the ten headlines carrying data-split. Those are
   animated word by word against a fixed measure, so past a certain length they
   wrap into the section below. The numbers are PROVISIONAL — they are sized to
   catch something obviously too long, not measured in a browser. See
   memory.md, "What's still open". */

const HEAD_INDEX = 72;   // section headlines on the home page, set in h2
const HEAD_PAGE  = 32;   // masthead titles on an inner page — much larger type

export const COPY_FIELDS = {
  /* ── Home page ─────────────────────────────────────────────────────── */

  "hero.eyebrow":     { page: "index", section: "Hero", label: "Small line above the name" },
  "hero.desc":        { page: "index", section: "Hero", label: "Opening sentence",
                        help: "Starting a new line here puts one on the page." },
  "hero.ctaPrimary":  { page: "index", section: "Hero", label: "First button" },
  "hero.ctaSecondary":{ page: "index", section: "Hero", label: "Second button" },

  "story.label":      { page: "index", section: "The Idea", label: "Section tag" },
  "story.headline":   { page: "index", section: "The Idea", label: "Headline", maxLength: HEAD_INDEX },
  "story.lead":       { page: "index", section: "The Idea", label: "Opening paragraph",
                        help: "Put *asterisks* around words to set them in italic." },
  "story.body":       { page: "index", section: "The Idea", label: "Second paragraph" },
  "story.quote":      { page: "index", section: "The Idea", label: "Pull quote" },

  "kitchen.label":     { page: "index", section: "The Kitchen", label: "Section tag" },
  "kitchen.headline":  { page: "index", section: "The Kitchen", label: "Headline", maxLength: HEAD_INDEX },
  "kitchen.lede":      { page: "index", section: "The Kitchen", label: "Paragraph under the headline" },
  "kitchen.reelLabel": { page: "index", section: "The Kitchen", label: "Caption above the photo strip" },
  "kitchen.reelNote":  { page: "index", section: "The Kitchen", label: "Small note beside the caption" },

  "cafe.label":       { page: "index", section: "The Café", label: "Section tag" },
  "cafe.headline":    { page: "index", section: "The Café", label: "Headline", maxLength: HEAD_INDEX },
  "cafe.lede":        { page: "index", section: "The Café", label: "Paragraph under the headline" },
  "cafe.card1.title": { page: "index", section: "The Café", label: "Card 1 — drink" },
  "cafe.card1.note":  { page: "index", section: "The Café", label: "Card 1 — description" },
  "cafe.card2.title": { page: "index", section: "The Café", label: "Card 2 — drink" },
  "cafe.card2.note":  { page: "index", section: "The Café", label: "Card 2 — description" },
  "cafe.card3.title": { page: "index", section: "The Café", label: "Card 3 — drink" },
  "cafe.card3.note":  { page: "index", section: "The Café", label: "Card 3 — description" },
  "cafe.card4.title": { page: "index", section: "The Café", label: "Card 4 — drink" },
  "cafe.card4.note":  { page: "index", section: "The Café", label: "Card 4 — description" },
  "cafe.cta":         { page: "index", section: "The Café", label: "Sentence above the button" },
  "cafe.ctaButton":   { page: "index", section: "The Café", label: "Button" },

  "wine.label":       { page: "index", section: "The Wine Bar", label: "Section tag" },
  "wine.headline":    { page: "index", section: "The Wine Bar", label: "Headline", maxLength: HEAD_INDEX },
  "wine.lede":        { page: "index", section: "The Wine Bar", label: "Paragraph under the headline" },
  "wine.note1.title": { page: "index", section: "The Wine Bar", label: "Note 1 — title" },
  "wine.note1.text":  { page: "index", section: "The Wine Bar", label: "Note 1 — description" },
  "wine.note2.title": { page: "index", section: "The Wine Bar", label: "Note 2 — title" },
  "wine.note2.text":  { page: "index", section: "The Wine Bar", label: "Note 2 — description" },
  "wine.note3.title": { page: "index", section: "The Wine Bar", label: "Note 3 — title" },
  "wine.note3.text":  { page: "index", section: "The Wine Bar", label: "Note 3 — description" },
  "wine.hours":       { page: "index", section: "The Wine Bar", label: "Small line about the room" },
  "wine.ctaButton":   { page: "index", section: "The Wine Bar", label: "Button" },

  "gallery.label":    { page: "index", section: "The Room", label: "Section tag" },
  "gallery.headline": { page: "index", section: "The Room", label: "Headline", maxLength: HEAD_INDEX },

  "visit.label":      { page: "index", section: "Visit", label: "Section tag" },
  "visit.headline":   { page: "index", section: "Visit", label: "Headline", maxLength: HEAD_INDEX,
                        help: "Starting a new line here puts one on the page." },

  /* ── Food menu page ────────────────────────────────────────────────── */

  "food.label":      { page: "food", section: "Food menu", label: "Section tag" },
  "food.headline":   { page: "food", section: "Food menu", label: "Page title", maxLength: HEAD_PAGE },
  "food.lede":       { page: "food", section: "Food menu", label: "Paragraph under the title" },
  "food.footNote":   { page: "food", section: "Food menu", label: "Note at the foot of the menu" },
  "food.footButton": { page: "food", section: "Food menu", label: "Button at the foot of the menu" },

  /* ── Drinks menu page ──────────────────────────────────────────────── */

  "drinks.label":      { page: "drinks", section: "Drinks menu", label: "Section tag" },
  "drinks.headline":   { page: "drinks", section: "Drinks menu", label: "Page title", maxLength: HEAD_PAGE },
  "drinks.lede":       { page: "drinks", section: "Drinks menu", label: "Paragraph under the title" },
  "drinks.footNote":   { page: "drinks", section: "Drinks menu", label: "Note at the foot of the menu" },
  "drinks.footButton": { page: "drinks", section: "Drinks menu", label: "Button at the foot of the menu" },

  /* ── Wine list page ────────────────────────────────────────────────── */

  "wineList.label":      { page: "wine", section: "Wine list", label: "Section tag" },
  "wineList.headline":   { page: "wine", section: "Wine list", label: "Page title", maxLength: HEAD_PAGE },
  "wineList.lede":       { page: "wine", section: "Wine list", label: "Paragraph under the title" },
  "wineList.footNote":   { page: "wine", section: "Wine list", label: "Note at the foot of the list" },
  "wineList.footButton": { page: "wine", section: "Wine list", label: "Button at the foot of the list" }
};
