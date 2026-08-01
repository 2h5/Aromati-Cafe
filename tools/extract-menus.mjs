/* Phase 1 — one-off extractor: menu markup -> seed data.
   node tools/extract-menus.mjs

   Reads the three menu pages as they stand today and emits data/seed-menu.js.
   This exists instead of hand-transcription: 84 items copied by hand would
   contain mistakes, and a wrong price on a live menu is a real problem. The
   parser is deliberately strict — it throws on anything it does not recognise
   rather than guessing, so an unhandled shape fails loudly here instead of
   silently vanishing from the site.

   Not part of the site. Kept because it is the record of how the seed data was
   produced, and because verify-phase1.mjs reuses its text-normalising helpers. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PAGES = [
  { slug: "food",   file: "menu-food.html",   expect: 25  },
  { slug: "drinks", file: "menu-drinks.html", expect: 28  },
  { slug: "wine",   file: "menu-wine.html",   expect: 31 }
];

/* ── text handling ───────────────────────────────
   Entities are decoded to the characters they represent so the seed data holds
   real text. The renderer puts it back through textContent, which re-escapes
   whatever needs escaping — so nothing is lost and nothing is double-encoded.
   Curly apostrophes and em dashes are already literal UTF-8 in the source. */

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&mdash;": "—",
  "&ndash;": "–", "&hellip;": "…"
};

function decode(s) {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => {
    if (ENTITIES[m]) return ENTITIES[m];
    const num = /^&#(\d+);$/.exec(m);
    if (num) return String.fromCodePoint(parseInt(num[1], 10));
    throw new Error(`unknown entity ${m}`);
  });
}

/* Tag-strip then collapse whitespace. Markup inside a field is a bug we want to
   hear about, with one exception: mi__tag, which is pulled out before this runs. */
function text(html) {
  const stripped = html.replace(/<[^>]+>/g, "");
  return decode(stripped).replace(/\s+/g, " ").trim();
}

function attr(tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : null;
}

/* Prices are stored bare. styles.css:904/944 render the "$" via ::before, but
   .mi__pours and .mi__opts carry a literal "$" in the markup today. Normalising
   here is what makes that inconsistency go away for good. */
function price(raw) {
  const v = decode(raw).replace(/\s+/g, " ").trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`unparseable price "${raw}"`);
  return v;
}

/* ── item parsing ───────────────────────────────── */

function parseItem(classes, body, where) {
  const item = {};

  const h3 = /<h3>([\s\S]*?)<\/h3>/.exec(body);
  if (!h3) throw new Error(`${where}: item with no <h3>`);

  /* .mi__tag is an inline qualifier inside the heading — a vintage, a volume,
     a topping count. Lifted out so the name is just the name. */
  const tag = /<span class="mi__tag">([\s\S]*?)<\/span>/.exec(h3[1]);
  if (tag) item.tag = text(tag[1]);
  item.name = text(h3[1].replace(/<span class="mi__tag">[\s\S]*?<\/span>/, ""));
  if (!item.name) throw new Error(`${where}: item with an empty name`);

  const desc = /<p class="mi__desc">([\s\S]*?)<\/p>/.exec(body);
  if (desc) item.desc = text(desc[1]);

  /* Exactly one price shape per item, checked below. */
  const flat = /<span class="mi__price">([\s\S]*?)<\/span>/.exec(body);
  const cells = /<span class="mi__cells">([\s\S]*?)<\/span>\s*<\/div>/.exec(body);

  if (flat) {
    item.price = price(flat[1]);
  } else if (cells) {
    const found = [...cells[1].matchAll(/<b class="mi__cell([^"]*)">([\s\S]*?)<\/b>/g)];
    if (!found.length) throw new Error(`${where}: mi__cells with no cells`);
    /* mi__cell--solo spans both size columns: one price, not "small only". */
    if (found.some((c) => c[1].includes("--solo"))) {
      if (found.length !== 1) throw new Error(`${where}: --solo alongside other cells`);
      item.priceAllSizes = price(found[0][2]);
    } else {
      item.prices = found.map((c) => price(c[2]));
    }
  } else if (classes.includes("mi--noprice")) {
    item.noPrice = true;
  } else {
    throw new Error(`${where}: "${item.name}" has no recognisable price`);
  }

  /* Supplementary pour lines — the "Bottle $60" under a by-the-glass price. */
  const pours = /<ul class="mi__pours">([\s\S]*?)<\/ul>/.exec(body);
  if (pours) {
    item.pours = [...pours[1].matchAll(/<li><span>([\s\S]*?)<\/span><b>([\s\S]*?)<\/b><\/li>/g)]
      .map((p) => ({ label: text(p[1]), price: price(p[2]) }));
    if (!item.pours.length) throw new Error(`${where}: empty mi__pours`);
  }

  /* The crêpe. Out of the editor's first pass, but modelled so Phase 1 does
     not drop it on the floor. */
  const opts = /<div class="mi__opts" id="([^"]+)">([\s\S]*?)<\/div>/.exec(body);
  if (opts) {
    item.optionsId = opts[1];
    item.options = [...opts[2].matchAll(/<li><span>([\s\S]*?)<\/span><b>([\s\S]*?)<\/b><\/li>/g)]
      .map((o) => ({ name: text(o[1]), price: price(o[2]) }));
    if (!item.options.length) throw new Error(`${where}: empty mi__opts`);
  }

  return item;
}

/* ── page parsing ───────────────────────────────── */

function parsePage(html, slug) {
  const bodyStart = html.indexOf('<div class="carte__body"');
  if (bodyStart < 0) throw new Error(`${slug}: no carte__body`);

  const courses = [];
  const rx = /<section class="course([^"]*)"([^>]*)>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = rx.exec(html.slice(bodyStart)))) {
    const [, extraClass, attrs, inner] = m;
    const courseKey = attr(attrs, "data-course");
    const label = attr(attrs, "data-label");
    const heading = text(/<h2>([\s\S]*?)<\/h2>/.exec(inner)?.[1] ?? "");
    if (!courseKey || !label || !heading) {
      throw new Error(`${slug}: course missing key, label or heading`);
    }

    const course = { key: courseKey, tabLabel: label, heading };

    /* Build-Your-Own. Explicitly out of scope: it keeps its hardcoded markup
       and the renderer leaves it alone. Recorded so the tab filter still knows
       it exists and so its position in the page order is preserved. */
    if (extraClass.includes("course--build")) {
      course.isStatic = true;
      course.staticId = attr(attrs, "data-static");
      if (!course.staticId) {
        throw new Error(`${slug}/${courseKey}: a static course needs data-static="…" ` +
          `so the renderer can find its markup and put it back in order`);
      }
      courses.push(course);
      continue;
    }

    /* Sizes are declared per course — a column header, not a per-item label. */
    const sizes = /<div class="course__sizes"[^>]*>([\s\S]*?)<\/div>/.exec(inner);
    if (sizes) {
      course.sizes = [...sizes[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((s) => text(s[1]));
      /* styles.css:926 is repeat(2, var(--cell)). A third size overflows the
         grid silently, so it is rejected at the source rather than at render. */
      if (course.sizes.length !== 2) {
        throw new Error(`${slug}/${courseKey}: ${course.sizes.length} sizes, the grid holds 2`);
      }
    }

    /* Items are located by their opening tag and sliced to the next one, never
       by matching </li>. The crêpe and every wine with pours contain nested
       <li> elements, so closing-tag matching silently truncates them — which is
       exactly the bug the item-count assertion below caught. */
    course.items = [];
    const starts = [...inner.matchAll(/<li class="(mi[^"]*)"[^>]*>/g)];
    starts.forEach((li, n) => {
      const from = li.index + li[0].length;
      const to = n + 1 < starts.length ? starts[n + 1].index : inner.length;
      course.items.push(parseItem(li[1], inner.slice(from, to), `${slug}/${courseKey}`));
    });
    if (!course.items.length) throw new Error(`${slug}/${courseKey}: no items`);

    courses.push(course);
  }

  if (!courses.length) throw new Error(`${slug}: no courses`);
  return courses;
}

/* ── run ────────────────────────────────────────── */

const out = {};
let grand = 0;

for (const page of PAGES) {
  const courses = parsePage(readFileSync(page.file, "utf8"), page.slug);
  const count = courses.reduce((n, c) => n + (c.items ? c.items.length : 0), 0);
  const shapes = {};
  for (const c of courses) {
    for (const i of c.items ?? []) {
      const s = i.prices ? "sized" : i.priceAllSizes ? "solo" : i.noPrice ? "noprice" : "flat";
      shapes[s] = (shapes[s] || 0) + 1;
    }
  }
  console.log(
    `${page.slug.padEnd(7)} ${String(count).padStart(3)} items ` +
    `(expected ${page.expect}) ${count === page.expect ? "ok" : "MISMATCH"}  ` +
    `${courses.length} courses  ${JSON.stringify(shapes)}`
  );
  if (count !== page.expect) {
    throw new Error(`${page.slug}: expected ${page.expect} items, parsed ${count}`);
  }
  out[page.slug] = courses;
  grand += count;
}

mkdirSync("data", { recursive: true });
writeFileSync(
  "data/seed-menu.js",
  "/* Generated by tools/extract-menus.mjs — do not hand-edit.\n" +
  "   The last-resort fallback: the menu as it shipped. Refreshed from live\n" +
  "   data at each release (Phase 8). Prices are bare; styles.css renders \"$\". */\n" +
  "var SEED_MENU = " + JSON.stringify(out, null, 2) + ";\n",
  "utf8"
);

console.log(`\n${grand} items -> data/seed-menu.js`);
