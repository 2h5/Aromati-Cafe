# Aromati CMS — redesign working spec

Scratch file for this piece of work. Delete it when the redesign lands.
It exists so the design does not drift halfway through.

Scope: **restyle + relayout of `/admin` as it exists today.** No new features,
no new routes, no new buttons. If a control is not in the current build, it does
not get invented here.

---

## 0. Hard rules for this work

1. **Do not break any functionality.** Every panel, every field, every
   validation message, every save/discard path keeps working exactly as it does
   now. `npm test` must stay green (updating `tools/test-admin.mjs` for the new
   markup is expected; weakening what it asserts is not).
2. **Do not break the time picker.** `makeTimePicker` and its `.tpick` markup
   and behaviour are kept as-is on desktop. The dial design does not change.
   It is *moved* into the new layout and repainted with the new palette only.
   Mobile still gets the native OS picker (`desktopTimePicker()` gate stays).
3. **No inline styles, no `innerHTML`.** `_headers` sets `style-src 'self'` and
   `script-src 'self'` for `/admin.html`; `tools/check-csp.mjs` and
   `tools/test-admin.mjs` both fail the build if either rule is broken. Every
   node stays `createElement` + `textContent`.
4. **`admin.css` stays independent of `styles.css`.** The public stylesheet's
   font arrangement stops the nav shifting and is fragile. Do not touch it, do
   not import it. The editor loads no webfont — see §2 note.
5. **The rendering contract stays.** `baseline` vs `draft`, derived change
   state, partial-and-honest saves, `only_photo_may_change`, seed fallbacks —
   untouched.

---

## 1. The one structural change

Today: one centred ~840px column of collapsed accordions per tab.
Target: **three panes, full viewport width, only the panes scroll.**

```
┌────────────────────────────────────────────────────────────┐
│ top bar  64px                                              │
├──────────┬───────────────┬─────────────────────────────────┤
│ nav rail │ section index │ editor pane                     │
│ 224px    │ 300px         │ 1fr (content max-width 760px,   │
│ dark     │ light, list   │ centred in the pane)            │
│          │ + search      │ scrolls; sticky save bar at foot│
└──────────┴───────────────┴─────────────────────────────────┘
```

- **Nav rail** replaces the horizontal tab strip. Same six destinations
  (Words, Hours, Contact, Menus, Photos, FAQ), vertical, dark maroon. Active =
  warm gold text on a low-opacity gold wash, 8px radius. Each item carries a
  right-aligned count of sections in that tab.
- **Section index** replaces the accordion. Flat scrollable list of that tab's
  sections, grouped under small uppercase group labels. One click selects.
  Nothing expands or collapses. Row: status dot, label, field count.
  States: default transparent → hover warm tint → selected warm tan fill,
  medium weight.
- **Editor pane** shows the selected section's fields, already open. Header =
  group eyebrow, section name in the display serif, one line of plain-English
  description of what it controls on the live site.
- **Status dot** (6px, index row only): gold = unsaved edits, maroon =
  currently selected, pale tan = clean. The only place unsaved state is
  signalled in the list.

### Responsive
- `< 1200px` — rail collapses to a 64px icon-less strip (initials/short label),
  index + editor keep their panes.
- `< 900px` — single column. Index is the default view; selecting a section
  swaps to the editor with a back arrow in its header.

---

## 2. Visual language

| Token | Value | Use |
|---|---|---|
| `ink` | `#2A1A15` | body text |
| `ink-soft` | `#7A6A5E` | descriptions, help text |
| `ink-faint` | `#A08E80` | eyebrows, counts |
| `maroon-900` | `#33100D` | top bar |
| `maroon-800` | `#3E1512` | nav rail |
| `maroon-600` | `#6B1F19` | primary button |
| `gold` | `#C9A227` | accents, active nav, dirty state |
| `gold-soft` | `#E4C87A` | links / text on dark |
| `cream` | `#F7F2EA` | app background |
| `card` | `#FFFDF9` | cards, index pane |
| `field` | `#FBF7F0` | input fill |
| `line` | `#E8DFD1` | hairlines |
| `line-input` | `#E4DACA` | input borders |

Two surfaces only — cream background, off-white cards. No third grey.
**No blue anywhere**; focus rings are gold, never the browser default.

**Type**
- Display serif for section titles (~34px/500) and pane titles (~20px). Nothing
  else. Playfair Display is the site's wordmark face — the editor loads no
  webfont (rule §0.4), so the display face is a **local-only** stack:
  `"Playfair Display", "Iowan Old Style", "Palatino Linotype", Georgia, serif`.
  It renders as Georgia where Playfair is not installed, which is correct and
  costs nothing. Do not add an `@font-face` or a `<link>` to fonts.
- UI sans (DM Sans where installed, else the system stack): labels 13px/500,
  field text **15px**/1.6, help 12–13px, eyebrows 10–11px uppercase `.2em`.
- Field text is 15px, not 13px. This is a text-editing tool.
- Mobile keeps `font-size: 16px` on inputs (iOS focus-zoom). Non-negotiable.

**Shape & depth**
- Cards 12px radius, 1px hairline, at most `0 1px 0 rgba(58,42,34,.03)`.
  No drop shadows, no elevation stacks.
- Inputs 8px radius, 1px border, `field` fill; focus = gold border + white fill.
- Buttons are pills (`999px`).
- Spacing scale 4/8/12/16/20/26/34. Card padding 18–20px, 14px between cards.

---

## 3. Per-tab notes

- **Words** — one column of field cards: label + right-aligned counter,
  textarea sized to expected content, optional 12px help line. The markdown
  rule (line break = line break, `*asterisks*` = italic, never code) leaves the
  top-of-page paragraph and becomes **one gold-tinted note card** at the top of
  the editor pane, stated once.
- **Hours** — day rows as a compact grid inside a single card: day name,
  "Closed all day", Opens, Closes. `Opens`/`Closes` appear once as column
  headers, not per row. "Holidays and one-off days" is a separate card with its
  explanation and `Add a date`.
- **Contact** — the three groups become index entries; the selected group's
  fields render open. **Every help line stays verbatim.**
- **Menus** — Food/Drinks/Wine stays as a segmented pill at the top of the
  **index** pane (it scopes the index). Section rows keep reorder ▲▼ and item
  counts. `Add a section` sits at the foot of the index list. Item-level
  accordions inside the editor pane stay as they are.
- **Photos** — index rows show photo counts; editor pane shows that section's
  slots as thumbnails with alt text under each. Exact existing behaviour and
  wording: a chosen file changes nothing until Save, and "Put the original
  back" stays available.
- **FAQ** — the studio notice stays, as a note card at the top of the editor
  pane. `Add a question` below it.

---

## 4. Save bar

Sticky at the foot of the **editor pane** (not the viewport), translucent cream
with blur and a top hairline.

- Left: status dot + plain sentence — `3 unsaved changes in Hero`,
  `All changes saved`, or `No changes yet`.
- Right: `Discard` (ghost pill), `Save changes` (maroon pill, muted and
  non-interactive when clean).
- ⌘S / Ctrl+S saves.
- Warn on navigating away from a dirty section.

Not added, because none of it exists: Preview on site, publish/draft toggles,
version history, per-field revert, role UI.

---

## 5. Copy tone

Plain, direct, restaurant-owner English — the tone already in the app
("Ten digits, no country code, no punctuation."). Second person. No product
jargon: no "content model", "entity", "CTA", "slug".

---

## 6. "Last saved" — cut, by request

It was built (no migration needed: every content table already carries
`updated_at`, maintained by `public.touch_updated_at()` in the first
migration, so it was one extra column per select and a max across the loaded
rows) and then **removed from the page on request**. The rail has no foot, and
`SELECTS` is back to what it was.

What survives is the save bar's third state: it says `No changes yet` until
something has been written in this session and `All changes saved` after, from
a plain in-page flag. No timestamp is claimed anywhere.

If it is ever wanted again: `updated_at` is already on every table, it is not
in `WRITABLE` so it can never be sent back, and one `max()` across the loaded
rows is the whole implementation. Word it "last saved", not "last published" —
the site reads the database live and there is no publish step.

---

## 7. Interpretation calls made while building

Recorded so they are visible rather than silent.

1. **Hours has two index rows** — "The usual week" and "Holidays and one-off
   days" — rather than one row containing both cards. A one-row index reads as
   broken, and the three-pane model is one-thing-at-a-time. The holidays card
   keeps its own explanation and `Add a date`.
2. **FAQ index rows are the questions.** `Add a question` sits at the foot of
   the index list, matching Menus' `Add a section`, rather than in the editor
   pane. The studio notice stays at the top of the FAQ editor pane, always.
3. **The rail item keeps the class `.tab`** (and `.tab__dot`). It is still a
   tab semantically, and the class is the anchor for ~30 assertions in
   `tools/test-admin.mjs`. Renaming it would be churn with no gain.
4. **Menu search stays in the index pane**, under the Food/Drinks/Wine
   segment, since it scopes the list. It continues to filter items and to open
   sections that contain a match.
5. **The problems list** renders inside the editor pane, directly above the
   save bar, rather than fixed to the viewport.
6. **No warning when moving between sections.** The spec asks for one, but
   this editor keeps a single draft across every tab and section: leaving a
   dirty section loses nothing, the gold dot stays on its index row, and the
   save bar keeps counting. A modal there would be a false alarm. The two
   places where work really can be lost — closing the tab and signing out —
   already confirm, and still do.
7. **The save bar never hides.** It used to slide away when clean. It now
   stays and goes quiet (`.savebar--clean`), because the pane's foot moving
   out from under the pointer as the last edit is undone is worse than a line
   of text changing. `Save changes` and `Discard` are disabled when clean.

   It is also **the shell's, not the editor's** — a grid item in the editor's
   column rather than a child of `.editor`. Under 900px the index and the
   editor take turns, and a savebar inside the editor vanishes the moment the
   owner goes back to the list, with unsaved work still in the draft and
   nothing on screen saying so. Same for the problems list. The shell is
   `minmax(0,1fr) auto auto` rows; rail and index span all of them.
8. **The time picker hangs below its input** instead of pushing the layout
   down. Same markup, same dials, same keys — only its position moved. The
   in-flow version existed because the old accordion body clipped its own
   overflow to animate; there is no accordion any more. It anchors to the
   right edge of its field so the rightmost column of the hours grid cannot
   push it outside the pane.
9. **All three selection fills slide.** The rail's gold wash, the index's tan
   row fill and the Food/Drinks/Wine pill are each one absolutely-positioned
   element (`.rail__list::after`, `.index__list::after`, `.pagepick::after`),
   sized and moved from the chosen element's own geometry via the CSSOM
   (`positionRailMark`, `positionIndexMark`, `positionPagePick`). Not a
   `style` attribute — `style-src 'self'` would drop that in production and
   nowhere else. The index fill snaps rather than slides when the area
   changes, because the rows it would be travelling between no longer exist.
   For the pill to slide at all the index head must survive a re-render, so
   it is now rebuilt only when the area changes and refreshed in place
   otherwise (`refreshHead`) — which also stops the search box being replaced
   under a cursor that is in it.

   The index fill has one thing to remember: **the menu search moves rows
   without re-rendering.** `renderIndex` positions the fill against the whole
   list, and `applyMenuSearch` then hides rows, moving everything below them.
   So `applyMenuSearch` re-positions the fill as its last act — on every
   keystroke and at the end of every menu render. Without that the fill is
   left standing at an offset that no longer has a row in it, and clicking a
   section afterwards animates between two stale positions. A chosen section
   the search has hidden leaves nothing to fill, and the fill goes to zero.
   Renders that snap re-enable sliding on the next frame, so the filtering
   itself is watchable even when arriving at the area was not.

   And the one that catches all three: **an element with no box measures
   zero.** Under 900px whichever pane is not showing is `display: none`, so
   `renderAll` sets `shell--editing` *before* it draws anything — a pass that
   drew first and switched panes second sized the pill and the index fill
   against a pane that was still hidden and left both collapsed. The three
   `position*` helpers also refuse to measure a host that is off screen at
   all, so what they last knew survives being hidden rather than being
   overwritten with zeroes and having to grow back.

   The rail fill has the matching trap: **the unsaved dot lives inside the
   button and changes its width.** `updateSavebar` adds and removes dots
   without re-rendering, and the removal happens a fifth of a second later
   when the exit animation finishes. `setTabDot` re-positions the fill on
   both, or the wash grows with the first edit and never shrinks back.
10. **Reordering is a FLIP, not a jump.** `move()` records where every
   `[data-section]` and `[data-item]` row is, re-renders, then puts each row
   that ended up elsewhere back where it was and releases it
   (`whereRowsAre` / `playReorder`). Measured rather than calculated: a
   section swapping across a group heading travels a distance nothing would
   have guessed. Rows the search has hidden are skipped in both passes, and
   under `prefers-reduced-motion` nothing is measured at all.
11. **Four animation modes, each animating only what moved.** `true` = a
   different section (editor pane), `"tab"` = a different area (both panes),
   `"menu-list"` = a different menu page (both panes — the page switch changes
   the index *and* puts a different section in the editor), `"back"` = the
   narrow-screen back arrow (the index arrives from the side it left towards,
   scoped under 900px where it really was off-screen).

   Two traps here, both hit once:
   - The editor pane is a new node every pass, so a class on it always plays.
     The index list is one long-lived element, and setting a class it already
     carries restarts nothing — Food → Drinks → Wine animated once and then
     stopped. `replayEnter` removes it, reads the layout, and puts it back.
   - A menu page switch no longer preserves the editor's scroll position. It
     is showing a different section, so it starts at the top.
12. **The hours grid hides the per-field labels rather than dropping them.**
   `Opens`/`Closes` are column headers, said once; the labels stay in the
   markup at `font-size: 0` for anyone listening rather than looking. The
   "edited" badge sets its own size, so it still shows.
