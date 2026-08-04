/* Taking an item off the menu without destroying it.
   node tools/test-menu-hidden.mjs

   Before is_hidden the only way to remove an item was Delete, which is
   permanent and cascades: menu_item_options goes with it, and the crêpe's seven
   toppings are not rebuildable through the editor. So an owner whose salmon was
   off for a week either deleted it and retyped it on Friday, or left it up.

   The danger in the feature is not the column. It is the shape of the check.
   `if (!item.hidden)` sprinkled through the renderers makes a leak one
   forgotten branch away, and silent when it happens — the item appears on the
   page, or worse, only in the structured data, where nobody looks. So the
   design is a single prune in data.js's shapeMenu, upstream of every consumer,
   and the tests here are written to hold that line rather than to spot-check
   the places a leak was imagined.

   Two of them are the important ones:

     * **Nowhere at all.** Not "absent from .mi" — absent from the serialised
       document. Name, description, price, tag, pours, options. That check does
       not need to know which surfaces exist, so it keeps covering surfaces
       added after it was written.

     * **Identical to never having existed.** Hiding an item is required to
       produce the same DOM as deleting it from the seed. Anything left behind
       by a hidden item — a stray separator, an off-by-one in a filter count, a
       gap in the grid — is a difference, and this is what finds it.

   Everything runs through tools/page-boot.mjs: real markup, real data.js, real
   render.js, real script.js, a stub network, a stopped clock. */

import { readFileSync } from "node:fs";
import { boot, settle, seedEnv, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, check, pass, fail } = reporter();

/* A small course of our own, pushed onto the drinks page. Using invented items
   rather than real ones means the "does this name appear anywhere" sweep cannot
   be fooled by the word also occurring in the copy, and means the case survives
   the owner renaming something on the real menu. */
const COURSE = () => ({
  key: "zz-hide",
  tabLabel: "Hideable",
  heading: "Hideable Things",
  items: [
    { name: "Alpha Kept", price: "11", desc: "Stays on the board." },
    /* The prices are deliberately absurd. The sweep below asks whether a string
       survives anywhere in the document, and "22" survives on any menu with a
       $22 item on it — a check that cannot fail is not coverage. */
    { name: "Beta Gone", price: "877.71", tag: "2019", desc: "Withdrawn for a week.",
      pours: [{ label: "Glass", price: "944.62" }, { label: "Carafe", price: "988.53" }] },
    { name: "Gamma Kept", price: "33", desc: "Also stays." }
  ]
});

/* `mark` decides what happens to Beta: hidden, deleted, or left alone. */
function board(mark) {
  return seedRows({
    menu: (pages) => {
      const c = COURSE();
      if (mark === "hidden") c.items[1].hidden = true;
      if (mark === "deleted") c.items.splice(1, 1);
      pages.drinks.push(c);
    }
  });
}

async function drinks(mark) {
  const rig = boot("menu-drinks.html", { fetcher: serve(board(mark)) });
  await settle();
  return rig;
}

const names = (doc) =>
  [...doc.querySelectorAll("#carteBody .mi h3")]
    .map((h) => h.textContent.replace(/\s+/g, " ").trim());

const tabs = (doc) =>
  [...doc.querySelectorAll("#carteTabs .ctab")].map((t) => t.textContent);


/* ── 1. the whole document, not the part we thought to look at ───────────── */

console.log("\na hidden item is nowhere in the page at all");
{
  const rig = await drinks("hidden");
  check("nothing threw", rig.thrown, []);
  check("no render step reported a failure", rig.errors, []);

  /* Every string that belongs only to Beta. If any of them survives anywhere in
     the serialised page — an element, an attribute, the JSON-LD, a data- hook —
     something published a row data.js was supposed to have pruned. */
  const html = rig.doc.documentElement.outerHTML;
  const leaked = ["Beta Gone", "Withdrawn for a week", "2019",
                  "Carafe", "877.71", "944.62", "988.53"]
    .filter((s) => html.includes(s));
  check("no trace of its name, words, tag, price or pours", leaked, []);

  check("the items either side are untouched",
    names(rig.doc).filter((n) => n.startsWith("Alpha") || n.startsWith("Gamma")),
    ["Alpha Kept", "Gamma Kept"]);
}


/* ── 2. the invariant that catches what a list of checks would miss ──────── */

console.log("\nhiding an item leaves exactly what deleting it would");
{
  const hidden = await drinks("hidden");
  const deleted = await drinks("deleted");

  const same = hidden.doc.getElementById("carteBody").innerHTML ===
               deleted.doc.getElementById("carteBody").innerHTML;
  check("the board is identical, node for node", same, true);
  check("and so is the tab bar", tabs(hidden.doc), tabs(deleted.doc));
}

console.log("\nand showing it again leaves exactly what never hiding it would");
{
  const shown = await drinks(null);
  /* The tag rides in the same h3 as the name, so Beta reads "Beta Gone 2019"
     on the page. Asserting the rendered string rather than a tidied one keeps
     this honest about what a visitor sees. */
  check("three items on the board",
    names(shown.doc).filter((n) => /Kept|Gone/.test(n)),
    ["Alpha Kept", "Beta Gone 2019", "Gamma Kept"]);
  check("its pours came back with it",
    [...shown.doc.querySelectorAll("#carteBody .mi__pours li")]
      .map((n) => n.textContent).some((t) => t.includes("Carafe")), true);
}


/* ── 3. a section with nothing visible left in it ────────────────────────── */

console.log("\nhiding every item in a section takes the section with it");
{
  const rows = seedRows({
    menu: (pages) => {
      const c = COURSE();
      c.items.forEach((it) => { it.hidden = true; });
      pages.drinks.push(c);
    }
  });
  const rig = boot("menu-drinks.html", { fetcher: serve(rows) });
  await settle();

  check("nothing threw", rig.thrown, []);
  check("the heading is gone",
    rig.doc.documentElement.outerHTML.includes("Hideable Things"), false);
  /* A heading with no items under it is bad; a filter tab that leads to an
     empty board is worse, because it looks like the page failed to load. */
  check("and so is its filter tab", tabs(rig.doc).includes("Hideable"), false);
  check("the rest of the drinks menu is still there",
    tabs(rig.doc).length > 1, true);
}

console.log("\nbut a section with no rows at all keeps its heading");
{
  /* The distinction this rule turns on, and the one it would be easy to lose.
     Emptied by hiding is deliberate and disappears. Empty because the rows are
     not there is the shape of an accident — case 3 of tools/test-resilience.mjs
     is the owner who selected a section's items to retype them and got
     interrupted, and a section that vanishes mid-edit takes its tab with it
     and quietly removes a chunk of the menu.

     Both states look identical on the page, which is exactly why the rule has
     to read the rows rather than the rendered result. */
  const rows = seedRows({
    menu: (pages) => { const c = COURSE(); c.items = []; pages.drinks.push(c); }
  });
  const rig = boot("menu-drinks.html", { fetcher: serve(rows) });
  await settle();
  check("the heading is still there",
    rig.doc.documentElement.outerHTML.includes("Hideable Things"), true);
  check("and so is its tab", tabs(rig.doc).includes("Hideable"), true);
}


/* ── 4. the filter, after a hidden item has been pruned out from under it ── */

console.log("\nthe tab filter still counts what is actually on the board");
{
  const rig = await drinks("hidden");
  const tab = [...rig.doc.querySelectorAll("#carteTabs .ctab")]
    .find((t) => t.textContent === "Hideable");
  check("the section kept its tab", !!tab, true);

  if (tab) {
    tab.dispatchEvent(new rig.window.MouseEvent("click", { bubbles: true }));
    await settle();
    const shown = [...rig.doc.querySelectorAll("#carteBody .mi")]
      .filter((n) => !n.closest(".course").classList.contains("is-hidden"))
      .map((n) => n.querySelector("h3").textContent.replace(/\s+/g, " ").trim());
    check("filtering to it shows the two that are left",
      shown, ["Alpha Kept", "Gamma Kept"]);
  }
}


/* ── 5. the offline floor ────────────────────────────────────────────────── */

console.log("\nthe seed files carry no hidden items, by definition");
{
  /* A seed is the menu as the public sees it. If a live→seed dump is ever
     written and hands the column through, the fallback would start serving
     items the owner took down — and only when Supabase was unreachable, which
     is the hardest moment to notice anything. This is the tripwire for that. */
  let flagged = [];
  for (const page of Object.keys(seedEnv.SEED_MENU)) {
    for (const course of seedEnv.SEED_MENU[page]) {
      for (const item of course.items || []) {
        if ("hidden" in item || "is_hidden" in item) flagged.push(item.name);
      }
    }
  }
  check("no seed item carries a hidden flag", flagged, []);

  const seedFile = readFileSync("data/seed-menu.js", "utf8");
  check("and the file has no such key in it", /"(is_)?hidden"\s*:/.test(seedFile), false);
}

console.log("\nand a hidden item never reaches the cache either");
{
  const rig = await drinks("hidden");
  const raw = rig.window.localStorage.getItem(
    (await import("./page-boot.mjs")).CACHE_KEY);
  check("something was cached", !!raw, true);
  check("but not the withdrawn item", String(raw).includes("Beta Gone"), false);
}


/* ── 6. the page that has nothing left to show ───────────────────────────── */

console.log("\nhiding an entire menu page leaves the built-in markup, not a hole");
{
  /* The editor refuses to save this state — see tools/test-admin.mjs — so it
     should not arise. If it does, render.js's own rule takes over: no data for
     a page means keep the markup the page was served with. A stale menu is bad
     and an empty menu page is worse, so this is the right way round. */
  const rows = seedRows({ menu: (pages) => {
    pages.drinks.forEach((c) => (c.items || []).forEach((it) => { it.hidden = true; }));
  } });
  const rig = boot("menu-drinks.html", { fetcher: serve(rows) });
  await settle();

  check("nothing threw", rig.thrown, []);
  const board = rig.doc.getElementById("carteBody");
  check("the board is not empty", board.querySelectorAll(".mi").length > 0, true);
}


/* ── 7. the home page, which shows no menu but does carry the listing ────── */

console.log("\nthe search listing is unaffected by a hidden item");
{
  const rig = boot("index.html", { fetcher: serve(board("hidden")) });
  await settle();
  check("nothing threw", rig.thrown, []);
  const ld = rig.doc.querySelector('script[type="application/ld+json"]').textContent;
  check("the withdrawn item is not in the structured data",
    ld.includes("Beta Gone"), false);
}


console.log(state.failures
  ? `\n${state.failures} failed`
  : "\na hidden item leaves no trace on any page, in the listing, or in the cache");
process.exit(state.failures ? 1 : 0);
