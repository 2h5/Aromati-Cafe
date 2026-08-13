/* The menu, once it has been round-tripped through the database.
   node tools/test-menu-shapes.mjs

   Phase 7, the Menu rows. There are six ways a price can be written on this
   site and they are not variations of one thing — each is a different set of
   DOM nodes and a different CSS grid. `tools/test-sql.mjs` already proves all
   six can be *stored*, and refuses the malformed ones with messages written for
   the owner to read. That is the database half.

   This is the other half: given rows in the shape PostgREST hands back, does
   `data.js` reshape them and does `render.js` draw them the way the hand-written
   markup did. Prices must remain bare on the public menu, and nothing between
   the constraint and the page should add a currency symbol.

   The awkward one is shape 2 with a gap — an item offered in one size and not
   the other. The blank is not a missing price, it is a statement that the item
   is not sold that way, and it has to render as an empty cell. That is checked
   here in both places it can go wrong: the class the renderer chooses and the
   stylesheet that controls the presentation — because jsdom will not compute a
   ::before, and a check that only looked at the class would not catch a stray
   currency symbol added by CSS.

   Then the two behaviours that only exist once the board has been *replaced*:
   the tab filter, and the two hand-written blocks that are out of scope to
   change and therefore have to survive being rebuilt around. */

import { readFileSync } from "node:fs";
import { boot, settle, seedEnv, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, fail, pass, check } = reporter();

/* ── one course carrying every shape ──────────────────────────────────────
   Written in the seed files' own vocabulary, which page-boot.mjs converts into
   the database columns and the stub hands back as PostgREST would. So the
   journey under test is the real one: rows → data.js → render.js → DOM. */
const SHAPES = {
  key: "zz-shapes",
  tabLabel: "Shapes",
  heading: "Every Shape",
  sizes: ["Small", "Large"],
  items: [
    { name: "One flat price", price: "21" },                                 // 1
    { name: "Priced by size", prices: ["4", "5"] },                          // 2
    { name: "Small only", prices: ["4", ""] },                               // 2, with a gap
    { name: "Large only", prices: ["", "9"] },                               // 2, the other gap
    { name: "One price, either size", priceAllSizes: "3" },                  // 3
    { name: "With pours", price: "15",                                       // 4
      pours: [{ label: "Glass", price: "15" }, { label: "Bottle", price: "60" }] },
    { name: "Ask us", noPrice: true },                                       // 5
    { name: "Expandable", price: "5", optionsId: "zzShapesOpts",             // 6
      options: [{ name: "Nutella", price: "2" }, { name: "Honey", price: "1" }] },
    { name: "With a tag", tag: "2022", price: "15", desc: "and a description" }
  ]
};

const withShapes = () => seedRows({ menu: (pages) => { pages.drinks.push(SHAPES); } });

/* Everything the renderer wrote for one item, by name. */
function itemNamed(doc, name) {
  const li = [...doc.querySelectorAll("#carteBody .mi")].find((n) => {
    const h = n.querySelector("h3");
    return h && h.textContent.replace(/\s+/g, " ").trim().startsWith(name);
  });
  if (!li) return null;
  return {
    li,
    classes: li.className,
    price: (li.querySelector(".mi__price") || {}).textContent ?? null,
    cells: [...li.querySelectorAll(".mi__cell")].map((b) => ({
      text: b.textContent, cls: b.className
    })),
    desc: (li.querySelector(".mi__desc") || {}).textContent ?? null,
    tag: (li.querySelector(".mi__tag") || {}).textContent ?? null,
    pours: [...li.querySelectorAll(".mi__pours li")]
      .map((n) => [...n.children].map((c) => c.textContent).join("=")),
    options: [...li.querySelectorAll(".mi__opts li")]
      .map((n) => [...n.children].map((c) => c.textContent).join("=")),
    toggle: !!li.querySelector(".mi__toggle")
  };
}

console.log("\nthe six price shapes, drawn from database rows\n");

/* ══ 1. every shape ══════════════════════════════════════════════════════ */
{
  const p = boot("menu-drinks.html", { fetcher: serve(withShapes()) });
  await settle();
  check("nothing threw", p.thrown, []);
  check("no render step reported a failure", p.errors, []);

  const got = (name) => itemNamed(p.doc, name);

  /* 1 — a flat price. One .mi__price, no cells. */
  {
    const it = got("One flat price");
    if (!it) fail("shape 1 (a flat price) did not render at all");
    else {
      check("1 flat price: the number is on the page", it.price, "21");
      check("1 flat price: and it is not in a sized cell", it.cells.length, 0);
      check("1 flat price: the price is bare, with no currency symbol",
            /\$/.test(it.price || ""), false);
    }
  }

  /* 2 — one price per size, index-aligned with the course's two columns. */
  {
    const it = got("Priced by size");
    if (!it) fail("shape 2 (priced by size) did not render at all");
    else {
      check("2 priced by size: two cells, one per column",
            it.cells.map((c) => c.text), ["4", "5"]);
      check("2 priced by size: neither is marked as not offered",
            it.cells.map((c) => /--none/.test(c.cls)), [false, false]);
      check("2 priced by size: no flat price element", it.price, null);
    }
  }

  /* 3 — one price spanning both columns. --solo is what makes it land on the
     same right-hand edge as the two-cell rows above it. */
  {
    const it = got("One price, either size");
    if (!it) fail("shape 3 (one price across the sizes) did not render at all");
    else {
      check("3 one price across the sizes: a single cell", it.cells.length, 1);
      check("3 one price across the sizes: it is the price", it.cells[0].text, "3");
      check("3 one price across the sizes: and it spans both columns",
            /--solo/.test(it.cells[0].cls), true);
    }
  }

  /* 4 — supplementary pours under the item. */
  {
    const it = got("With pours");
    if (!it) fail("shape 4 (supplementary pours) did not render at all");
    else {
      check("4 pours: both lines, label and price",
            it.pours, ["Glass=15", "Bottle=60"]);
      check("4 pours: the item keeps its own price", it.price, "15");
    }
  }

  /* 5 — no price at all. The class is what stops the leader dots running to a
     price that is not there. */
  {
    const it = got("Ask us");
    if (!it) fail("shape 5 (no price at all) did not render at all");
    else {
      check("5 no price: nothing where a price would be", it.price, null);
      check("5 no price: and no sized cells either", it.cells.length, 0);
      check("5 no price: the row is marked as priceless",
            /mi--noprice/.test(it.classes), true);
    }
  }

  /* 6 — the crêpe's expandable options, plus the button that opens them. */
  {
    const it = got("Expandable");
    if (!it) fail("shape 6 (expandable options) did not render at all");
    else {
      check("6 options: both are listed", it.options, ["Nutella=2", "Honey=1"]);
      check("6 options: the row carries the disclosure button", it.toggle, true);
      check("6 options: and is marked as an options row", /mi--opts/.test(it.classes), true);
      const btn = it.li.querySelector(".mi__toggle");
      check("6 options: the button starts closed", btn.getAttribute("aria-expanded"), "false");
      check("6 options: and points at the panel it opens",
            btn.getAttribute("aria-controls"), it.li.querySelector(".mi__opts").id);
    }
  }

  /* A tag and a description are not a shape, but they hang off the same row
     and the tag has to stay outside the name. */
  {
    const it = got("With a tag");
    if (!it) fail("an item with a tag and a description did not render");
    else {
      check("a tag renders beside the name, not inside it", it.tag, "2022");
      check("and the description is its own line", it.desc, "and a description");
    }
  }
}

/* ══ 2. a size the item is not offered in ════════════════════════════════ */
{
  console.log("\nan item offered in one size and not the other");
  const p = boot("menu-drinks.html", { fetcher: serve(withShapes()) });
  await settle();

  const small = itemNamed(p.doc, "Small only");
  const large = itemNamed(p.doc, "Large only");

  if (!small || !large) {
    fail("an item with a blank size did not render at all");
  } else {
    check("the empty column is still a cell, so the grid stays aligned",
          [small.cells.length, large.cells.length], [2, 2]);
    check("the blank cell is empty", [small.cells[1].text, large.cells[0].text], ["", ""]);
    check("the priced cell still has its price",
          [small.cells[0].text, large.cells[1].text], ["4", "9"]);
    check("the blank cell is marked as not offered",
          [/--none/.test(small.cells[1].cls), /--none/.test(large.cells[0].cls)],
          [true, true]);
    check("and the priced cell is not",
          [/--none/.test(small.cells[0].cls), /--none/.test(large.cells[1].cls)],
          [false, false]);
  }

  /* jsdom will not compute a ::before, so read the stylesheet directly and
     require that no currency symbol is injected by CSS. */
  const css = readFileSync("styles.css", "utf8").replace(/\s+/g, "");
  check("styles.css does not inject a currency symbol",
        css.includes('content:"$"'), false);
  check("the border-image lives in a static frame child",
        [css.includes(".page-menu.carte::before"),
         css.includes(".page-menu.carte-frame::before"),
         css.includes("border-image:url(")],
        [false, true, true]);
  check("each menu carries one single frame shell",
        ["menu-food.html", "menu-drinks.html", "menu-wine.html"].map((file) => {
          const html = readFileSync(file, "utf8");
          return [
            (html.match(/class="carte-frame"/g) || []).length,
            (html.match(/carte-frame__edge carte-frame__edge--/g) || []).length,
            (html.match(/carte-frame__corner carte-frame__corner--/g) || []).length,
            /class="carte-frame" aria-hidden="true"/.test(html)
          ];
        }),
        [[1, 0, 0, true], [1, 0, 0, true], [1, 0, 0, true]]);
  check("the frame is independent of database board rebuilds",
        !!p.doc.querySelector(".carte > .carte-frame") &&
        !p.doc.querySelector("#carteBody .carte-frame"), true);
  check("the static vector is revealed by a clip shell",
        [css.includes("animation:carte-frame-reveal1.8slinear.25sboth"),
         css.includes("@keyframescarte-frame-reveal"),
         css.includes("border:var(--m-frame)solidtransparent"),
         css.includes("clip-path:inset(0)")],
        [true, true, true, true]);
  check("the frame has no browser-detection path",
        ["menu-food.html", "menu-drinks.html", "menu-wine.html"].some((file) =>
          /userAgent|needs-webkit|is-ios|platform\.js/.test(readFileSync(file, "utf8"))),
        false);
}

/* ══ 3. the tab filter, after the board has been replaced ════════════════
   tools/test-replay.mjs proves the rebuild leaves nothing behind — one spacer,
   one click handler, the tab bar rebuilt rather than appended to. It never
   clicks a tab. So this asks the question that follows: with a board that
   arrived from the network rather than from the markup, does filtering to a
   course actually leave that course and hide the others.

   Reduced motion is reported by the rig, so `commit` runs on a 0ms timer
   rather than after the 180ms fade. One turn of the event loop is enough. */
{
  console.log("\nfiltering a board that arrived from the network");
  const p = boot("menu-drinks.html", { fetcher: serve(withShapes()) });
  await settle();

  const tabs = [...p.doc.querySelectorAll("#carteTabs .ctab")];
  const shapesTab = tabs.find((t) => t.textContent === "Shapes");

  check("the new course got a tab of its own", !!shapesTab, true);
  check("All is the tab that starts selected",
        (tabs[0] || {}).textContent, "All");

  if (shapesTab) {
    shapesTab.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    await settle();

    check("clicking it threw nothing", p.thrown, []);
    check("it is the selected tab now",
          shapesTab.classList.contains("is-on") &&
          shapesTab.getAttribute("aria-pressed") === "true", true);
    check("All is no longer selected", tabs[0].classList.contains("is-on"), false);

    const shown = [...p.doc.querySelectorAll("#carteBody .course")]
      .filter((c) => !c.classList.contains("is-hidden"))
      .map((c) => c.getAttribute("data-course"));
    check("exactly one course is left on screen", shown, ["zz-shapes"]);

    /* Back to All. Re-clicking the live tab is a no-op by design, so this also
       covers the path that used to replay every animation for nothing. */
    tabs[0].dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    await settle();
    const back = [...p.doc.querySelectorAll("#carteBody .course")]
      .filter((c) => c.classList.contains("is-hidden"));
    check("going back to All hides nothing", back, []);
    check("and threw nothing", p.thrown, []);
  }
}

/* ══ 4. the two blocks that are out of scope to change ═══════════════════
   Build Your Own keeps hand-written markup and interaction; the editor may
   replace its choices but never its layout. It is listed in memory.md as a
   fixed boundary, and a rebuild of the board around it is exactly how it would
   be broken. The expandable options row is generated, but the behaviour that
   opens it is script.js's and is rebound on every rebuild, so it is checked in
   the same place for the same reason.

   The options row is supplied here rather than found on the board. It used to
   be the crêpe, a real dessert; the 2026-08-06 resync to the printed sheets in
   assets/menus/ retired it, and no item on the site carries options now. The
   code path is still live — the editor can put options back — so the fixture
   keeps it covered instead of letting the check quietly find nothing. */
{
  console.log("\nthe hand-written blocks, after a rebuild around them");
  const OPTS_ON = "Protein Plate";
  const rows = seedRows({ menu: (pages) => {
    /* a real change, so the board is genuinely replaced rather than compared
       equal and left alone */
    pages.food[1].items[0].name = "CHANGED SO THE BOARD IS REBUILT";
  } });
  rows.menu_builder_options = [
    { id: "bb1", group_key: "base", label: "CMS base", price: "11",
      hint: "A CMS-fed base.", sub_key: "bagel", is_hidden: false, sort_order: 1 },
    { id: "bb2", group_key: "bagel", label: "Sesame", price: null,
      hint: null, sub_key: null, is_hidden: false, sort_order: 1 },
    { id: "ba1", group_key: "add", label: "CMS topping", price: "2",
      hint: null, sub_key: null, is_hidden: false, sort_order: 1 }
  ];
  const host = (rows.menu_items || []).find((it) => it.name === OPTS_ON);
  if (!host) {
    throw new Error(
      `test-menu-shapes: no item named "${OPTS_ON}" to hang the options ` +
      `fixture on — the seed data moved, point OPTS_ON at an item that exists`
    );
  }
  host.options_dom_id = "shapesOpts";
  host.menu_item_options = [{ id: "shapeOpt1", item_id: host.id,
    name: "A topping", price: "1.00", sort_order: 1 }];
  const p = boot("menu-food.html", {
    fetcher: serve(rows)
  });
  await settle();

  const build = p.doc.querySelector("[data-static]");
  check("Build Your Own is still on the page", !!build, true);
  check("it is still in the board, not orphaned",
        !!(build && build.closest("#carteBody")), true);
  check("its CMS-fed base replaced the seed choice",
        build && build.querySelector('[data-group="base"] .chip').getAttribute("data-name"),
        "CMS base");
  check("its CMS-fed bagel variety is present",
        build && build.querySelector('[data-group="bagel"] .chip').getAttribute("data-name"),
        "Sesame");
  check("its CMS-fed add-on is present",
        build && build.querySelector('[data-group="add"] .chip').getAttribute("data-name"),
        "CMS topping");

  if (build) {
    const chip = build.querySelector('[data-group="base"] .chip');
    const total = build.querySelector("#byoTotal") ||
                  build.querySelector("[id$='Total']") ||
                  build.querySelector(".build__total");
    chip.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    await settle();
    check("clicking a chip threw nothing", p.thrown, []);
    check("and the chip took the selection",
          chip.classList.contains("is-on") && chip.getAttribute("aria-pressed") === "true", true);
    check("the CMS base opens its CMS-fed bagel choices",
          build.querySelector("#bagelField").classList.contains("is-open"), true);
    if (total) check("and the total is a bare price", /^\d/.test(total.textContent.trim()), true);
    else fail("Build Your Own has no total element to check");
  }

  /* The options row is a generated item, so it comes back through render.js —
     but the behaviour that opens it is script.js's, rebound on every rebuild. */
  const toggle = p.doc.querySelector("#carteBody .mi--opts .mi__toggle");
  if (!toggle) {
    fail(`the expandable row did not render on the food board`,
         `the fixture is hung on "${OPTS_ON}" — renderItem should have given ` +
         `it a .mi__toggle`);
  } else {
    check("the expandable row starts closed", toggle.getAttribute("aria-expanded"), "false");
    toggle.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    await settle();
    check("one click opens it after the rebuild", toggle.getAttribute("aria-expanded"), "true");
    check("and threw nothing", p.thrown, []);
  }
}

console.log(state.failures
  ? `\n${state.failures} problem(s) in how the menu renders`
  : "\nall six price shapes survive the round trip, and the board still filters after a rebuild");
process.exit(state.failures ? 1 : 0);
