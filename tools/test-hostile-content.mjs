/* Every owner-editable field, filled with something hostile.
   node tools/test-hostile-content.mjs

   Phase 7, the Security rows that do not need a live project — and the one
   memory.md calls "the biggest one": stored XSS. A CMS means text the owner
   typed gets rendered into a public page. If any of it goes in as markup rather
   than as text, a compromised or careless owner account becomes script
   execution in every visitor's browser, on every page, until someone notices.

   The rule the whole project is built on is that this cannot happen by
   construction: `render.js` uses createElement and textContent and never
   innerHTML. That rule is already checked three ways — `test-copy.mjs` puts a
   script tag through the copy renderer, `test-ordering.mjs` refuses five kinds
   of ordering link, `test-photos.mjs` refuses six kinds of image src, and
   `test-rls.mjs` proves the database stores a script tag as the literal text it
   is. All good, all partial: between them they cover the copy fields, two
   attributes and the storage layer. **No menu field was covered at render
   time**, and the menu is where most of the owner's typing goes.

   So this poisons everything at once — item names, tags, descriptions, course
   headings and tab labels, pour labels, option names, copy, settings, the hours
   note — serves it from the stub, boots all five pages, and asks four questions
   of the resulting document:

     1. is there a script element that was not in the served markup
     2. does any element carry an on* handler attribute
     3. does any href or src carry a scheme that executes
     4. is the JSON-LD still parseable, and still describing a café

   ── one thing worth knowing before adding a sabotage here ──
   `renderContact` finds its targets by what they already are — `a[href^="mailto:"]`,
   `a[href*="instagram.com"]` — which is deliberate and is explained where it
   sits. It has a side effect that will waste an afternoon: a sabotage that
   makes it write a *malformed* href also destroys the selector that found the
   element, so the second paint matches nothing and the page settles somewhere
   harmless. Two sabotages here failed to be caught for exactly that reason and
   neither was a gap in this file. Neither field can produce an executing href
   in the first place: `mailto:` + anything is inert, and the Instagram handle is
   appended to a fixed `https://` origin.

   ── the control, which is the whole test ──
   All four of those are satisfied by a renderer that draws nothing at all. A
   page with no content has no injected script, no handler, no bad href and an
   untouched JSON-LD, and would sail through every assertion above while being
   completely broken. So each page is also required to *contain the payload as
   readable text*. Only both halves together mean anything: the words the owner
   typed are on the page, and they are words.

   The control is counted per region rather than as one total, which is not
   fastidiousness. The first version used a single count over the whole page,
   and with the board disabled entirely the copy fields alone kept it above the
   threshold — the control passed while the largest surface of owner text on the
   site was not being drawn at all. Three regions that do not nest: the board,
   the copy elements, the footer. */

import { boot, settle, seedEnv, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, fail, pass, check } = reporter();

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* Six payloads, each aimed at a different way of getting out of a value.
   MARK is what the control looks for — a string that cannot occur naturally and
   is inside every payload, so "did this field render at all" is one search.

   **Every field gets every payload**, one payload per pass, rather than the
   payloads being dealt round the fields. The dealt version was written first
   and it is a lottery: whether the `javascript:` payload happens to land on the
   one field that becomes an href depends on how many menu items there are.
   Two sabotages — the email written straight into a mailto and the Instagram
   handle used as a whole URL — went undetected under it, not because the
   assertions were wrong but because that field had drawn a harmless string
   that run. Six passes cost six times as many boots and remove the luck. */
const MARK = "ZZHOSTILEZZ";
const PAYLOADS = [
  `<script>alert(1)</script>${MARK}`,                    // a whole element
  `<img src=x onerror=alert(1)>${MARK}`,                 // an element that fires without a click
  `" onmouseover="alert(1)" data-x="${MARK}`,            // breaking out of an attribute
  `javascript:alert(1)${MARK}`,                          // a scheme that executes
  `</script><script>alert(1)</script>${MARK}`,           // closing the JSON-LD block early
  `'};alert(1);var x={'${MARK}`                          // ending a JS string, if one were built
];

/* ── the same site, with every field the owner can type into replaced ────── */
function hostileRows(payload) {
  const next = () => payload;

  const rows = seedRows({
    menu: (pages) => {
      for (const page of Object.keys(pages)) {
        pages[page].forEach((course) => {
          /* A static course keeps its hand-written markup, so poisoning its
             heading proves nothing — and its items are not data at all. */
          if (course.isStatic) return;
          course.heading = next();
          course.tabLabel = next();
          (course.items || []).forEach((item) => {
            item.name = next();
            if (item.desc != null) item.desc = next();
            if (item.tag != null) item.tag = next();
            (item.pours || []).forEach((p) => { p.label = next(); });
            (item.options || []).forEach((o) => { o.name = next(); });
          });
        });
      }
    }
  });

  rows.menu_builder_options = rows.menu_builder_options.map((r) => ({
    ...r,
    label: next(),
    hint: r.group_key === "base" ? next() : r.hint,
    price: r.group_key === "bagel" ? null : "1"
  }));

  rows.site_copy = rows.site_copy.map((r) => ({ key: r.key, value: next() }));

  /* Settings are not uniform: the phone is ten digits or render.js refuses to
     write it at all, and the two URL fields have their own refusals which
     test-ordering.mjs owns. The free-text ones are what this poisons —
     business name and cuisine go straight into the Google listing. */
  rows.site_settings = rows.site_settings.map((r) => (
    ["business_name", "cuisine", "email", "instagram_handle"].includes(r.key)
      ? { key: r.key, value: next() }
      : r
  ));

  return rows;
}

/* ── what a poisoned page must not contain ──────────────────────────────── */
function audit(doc, cleanScripts) {
  const problems = [];

  const scripts = doc.querySelectorAll("script").length;
  if (scripts !== cleanScripts) {
    problems.push(`${scripts - cleanScripts} script element(s) appeared that the page did not serve`);
  }

  for (const node of doc.querySelectorAll("*")) {
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name)) {
        problems.push(`<${node.nodeName.toLowerCase()}> carries ${attr.name}="${attr.value.slice(0, 40)}"`);
      }
      if (/^(href|src|xlink:href|formaction)$/i.test(attr.name) &&
          /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        /* data: is allowed for the inlined fonts in the stylesheet, never for a
           link or an image the renderer wrote. */
        problems.push(`<${node.nodeName.toLowerCase()}> ${attr.name}="${attr.value.slice(0, 40)}"`);
      }
    }
  }

  /* An <img> that never loads is still an <img> that fires onerror. The
     renderer only ever writes src on the photo slots, so any other image with a
     src the payload could have supplied is a hole. */
  for (const img of doc.querySelectorAll("img")) {
    if ((img.getAttribute("src") || "").includes(MARK)) {
      problems.push(`<img> has a src built from owner text`);
    }
  }

  return problems;
}

function structuredData(doc) {
  const node = doc.querySelector('script[type="application/ld+json"]');
  if (!node) return { present: false };
  try {
    return { present: true, ok: true, data: JSON.parse(node.textContent) };
  } catch (e) {
    return { present: true, ok: false, why: e.message };
  }
}

console.log("\nevery field the owner can type into, filled with something hostile\n");

/* ══ the control ═════════════════════════════════════════════════════════
   Run first, and reported as its own line, because everything after it is an
   assertion about absence. If the payload never reaches the page, the whole
   file passes and means nothing. */
const clean = {};
{
  console.log("first: does the poison actually reach the page");
  for (const page of PAGES) {
    const c = boot(page, { fetcher: serve(seedRows()) });
    await settle();
    clean[page] = c.doc.querySelectorAll("script").length;
  }

  const p = boot("menu-food.html", { fetcher: serve(hostileRows(PAYLOADS[0])) });
  await settle();

  /* Counted per region, not over the whole page. A single total is satisfied by
     any one renderer still working: with the board disabled the copy fields
     alone kept the count above a flat threshold, and the control passed while
     the entire menu — the largest surface of owner text on the site — was not
     being drawn at all. Every region that renders owner text has to show it. */
  /* Selectors that do not nest. `main` would have worked for the copy on the
     home page and been meaningless on a menu page, where it contains the board
     — the board's own hits would keep the copy region above zero however
     thoroughly renderCopy had stopped running. So the copy is counted across
     the elements it actually writes into. */
  const region = (name, sel) => {
    const nodes = [...p.doc.querySelectorAll(sel)];
    if (!nodes.length) { fail(`${name} is not on the page at all`, `nothing matches ${sel}`); return; }
    const n = nodes.reduce((sum, node) =>
      sum + (node.textContent.match(new RegExp(MARK, "g")) || []).length, 0);
    if (n > 0) pass(`the payload reached ${name} (${n}×)`);
    else fail(`the payload never reached ${name}`,
      `Nothing below proves anything about ${name}: a region that renders no\n` +
      `owner text has no owner text to be injected through.`);
  };

  region("the menu board", "#carteBody");
  region("the page copy", "[data-copy]");
  region("the footer", "footer");

  /* And it is text, not markup: the angle brackets survived as characters. */
  check("the script tag is on the page as characters",
        p.doc.body.textContent.includes("<script>alert(1)</script>"), true);
}

/* ══ every payload, on every page ════════════════════════════════════════
   The document audit and the Google listing share a boot, because they are two
   questions about the same rendered page and booting it twice only doubles the
   cost.

   The listing gets its own assertion rather than riding on the audit because
   its failure is silent in a different way. render.js parses the JSON-LD block,
   mutates the object and writes it back through textContent — which does not
   re-parse HTML, so a business name containing "</script>" cannot end the block
   early. That is the reasoning in the comment at renderHours; this is the check
   that it is true. A broken listing does not look broken. It is invisible until
   Google reads it. */
for (const payload of PAYLOADS) {
  console.log(`\nwith every field set to  ${payload.replace(MARK, "…")}`);
  const rows = hostileRows(payload);

  for (const page of PAGES) {
    const p = boot(page, { fetcher: serve(rows) });
    await settle();

    const problems = audit(p.doc, clean[page]);
    if (p.thrown.length) problems.push(`the page threw: ${p.thrown[0]}`);

    const ld = structuredData(p.doc);
    if (ld.present && !ld.ok) problems.push(`the Google listing is no longer valid JSON: ${ld.why}`);
    if (ld.present && ld.ok) {
      /* Still a document about a business, not a fragment that happened to
         parse. */
      const root = ld.data.isPartOf || ld.data;
      if (!(root["@type"] || ld.data["@type"])) {
        problems.push("the Google listing parsed but has no @type left");
      }
    }

    if (problems.length) fail(`${page} is injectable`, problems.slice(0, 6).join("\n"));
    else pass(`${page.padEnd(17)} clean: no injected script, no handler, no executing href, listing intact`);
  }
}

/* ══ the one field that is validated rather than escaped ═════════════════
   The phone is the exception in render.js: it is written into a tel: href and
   into the listing, so escaping is not enough — a tel: built from arbitrary
   text is still a link the renderer wrote. It is checked against ten digits and
   dropped entirely if it fails, which means the *old* number stays on the page.
   That is the right failure and it is worth pinning: a blank number would be
   worse than a stale one. */
{
  console.log("\na phone number that is not a phone number");
  const rows = seedRows();
  rows.site_settings = rows.site_settings.map((r) =>
    r.key === "phone_digits" ? { key: r.key, value: `javascript:alert(1)${MARK}` } : r);

  const p = boot("index.html", { fetcher: serve(rows) });
  await settle();

  const tels = [...p.doc.querySelectorAll('a[href^="tel:"], a[href*="alert"]')]
    .map((a) => a.getAttribute("href"));
  check("no tel: link was built from it",
        tels.some((h) => h.includes(MARK) || /javascript:/i.test(h)), false);
  check("the page still has a working phone link", tels.length > 0, true);
  check("and it is still ten digits",
        tels.every((h) => /^tel:\+?\d{10,12}$/.test(h)), true);
  check("nothing threw", p.thrown, []);
}

console.log(state.failures
  ? `\n${state.failures} problem(s) — owner text is reaching the page as markup`
  : "\nowner text reaches the page as text, on every page, in every field");
process.exit(state.failures ? 1 : 0);
