/* Photographs — the hooks, and what render.js does with them.
   node tools/test-photos.mjs

   Two halves, and they fail for different reasons.

   The first is the markup against the data: every slot the seed knows about has
   somewhere on a page to go, every hook on a page has a slot, and the
   decorative flags agree in both directions. A mismatch here is a photograph
   that silently cannot be changed, or a backdrop the editor asks for a
   description of.

   The second runs the real render.js and asks what it actually writes. Three
   things matter and none of them is obvious:

     - an override reaches *every* drawing of its slot, including the
       aria-hidden repeat in the home page's photo strip
     - a decorative drawing keeps alt="", however described its slot is
     - a src that is not https is refused, the same way an ordering link is

   The last one is the security half. An <img src> is a URL the owner typed that
   the browser goes and fetches, and the rule the whole project runs on is that
   owner-typed values are checked at the point they are used, not only at the
   point they are stored. */

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { PHOTO_SLOTS, slotList } from "./photo-slots.mjs";

let failures = 0;

function check(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

function load(file, name) {
  const sandbox = {};
  runInNewContext(readFileSync(file, "utf8"), sandbox);
  return sandbox[name];
}

const SEED = load("data/seed-photos.js", "SEED_PHOTOS");
const SLOTS = slotList();
const RENDER = readFileSync("render.js", "utf8");

console.log("\nthe hooks on the pages against the slots in the data\n");

/* ── every page, read as it is served ─────────────────────────────────────── */
const hooks = [];
for (const [file] of PHOTO_SLOTS) {
  const doc = new JSDOM(readFileSync(file, "utf8")).window.document;
  for (const img of doc.querySelectorAll("[data-photo]")) {
    hooks.push({
      file,
      slot: img.getAttribute("data-photo"),
      decorative: img.hasAttribute("data-photo-decorative"),
      alt: img.getAttribute("alt"),
      src: img.getAttribute("src")
    });
  }
}

{
  const inMarkup = new Set(hooks.map((h) => h.slot));
  const inSeed = new Set(Object.keys(SEED));

  check("every slot in the data has somewhere on a page to go",
        [...inSeed].filter((s) => !inMarkup.has(s)), []);
  check("every hook on a page has a slot in the data",
        [...inMarkup].filter((s) => !inSeed.has(s)), []);
  check("and the slot table agrees with both",
        SLOTS.map((s) => s.slot).filter((s) => !inSeed.has(s)), []);
}

{
  /* A drawing marked decorative must carry alt="", or a screen reader gets the
     description anyway and the flag is decoration itself. */
  const wrong = hooks.filter((h) => h.decorative && h.alt !== "");
  check("every decorative drawing carries an empty alt", wrong.map((h) => h.slot), []);

  /* And the other direction: a hook with no description and no flag is the
     ambiguous case the extractor refuses to create — "" and "not written yet"
     are indistinguishable to the person who needs it. */
  const undecided = hooks.filter((h) => !h.decorative && !h.alt);
  check("no hook is undescribed without saying it means to be",
        undecided.map((h) => `${h.file} ${h.slot}`), []);

  /* A slot the data calls decorative must be decorative everywhere. The reverse
     is not true and must not be checked: the strip's nine photographs are drawn
     twice, once described and once aria-hidden, and the slot is described. */
  const seedDecorative = Object.keys(SEED).filter((s) => SEED[s].decorative);
  const drawnDescribed = seedDecorative.filter((s) =>
    hooks.some((h) => h.slot === s && !h.decorative));
  check("a slot the data calls decoration is decoration everywhere it is drawn",
        drawnDescribed, []);
}

{
  /* The strip is the case the whole element-versus-slot distinction exists for.
     If it ever stops being drawn twice, the rule can be simplified — and if it
     stops being drawn twice by accident, this says so. */
  const drawnTwice = [...new Set(hooks.map((h) => h.slot))]
    .filter((s) => hooks.filter((h) => h.slot === s).length > 1);
  check("nine slots are drawn more than once", drawnTwice.length, 9);
  check("and all of them are the photo strip",
        drawnTwice.every((s) => s.indexOf("kitchen.plate") === 0), true);
}

/* ── what render.js writes ────────────────────────────────────────────────── */

/* The described drawing and the aria-hidden repeat of the same slot, which is
   the home page's photo strip in miniature. */
const STRIP =
  '<img data-photo="p" src="assets/web/a.jpg" alt="A plate of khinkali">' +
  '<img data-photo="p" data-photo-decorative src="assets/web/a.jpg" alt="">';

function render(photos, markup = STRIP) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { runScripts: "dangerously" });
  const { window } = dom;
  const s = window.document.createElement("script");
  s.textContent = `var SEED_PHOTOS = {};\n` +
    `var AROMATI_DATA = { current: function () { return { photos: ${JSON.stringify(photos)} }; },\n` +
    `                     refresh: function (done) { done(null); } };\n` + RENDER;
  window.document.body.appendChild(s);
  return [...window.document.querySelectorAll("[data-photo]")];
}

console.log("\nwhat render.js writes into them\n");

{
  const url = "https://project.supabase.co/storage/v1/object/public/site-photos/p/1.webp";
  const [described, repeat] = render({ p: { alt: "Khinkali, pleated by hand", url } });

  check("the uploaded photograph replaces the built-in one", described.getAttribute("src"), url);
  check("in the aria-hidden repeat too", repeat.getAttribute("src"), url);
  check("the description is written", described.getAttribute("alt"), "Khinkali, pleated by hand");
  check("but not into the repeat, which stays silent", repeat.getAttribute("alt"), "");
}

{
  const [img] = render({ p: { alt: "A new description", url: null } });
  check("no upload leaves the built-in photograph alone",
        img.getAttribute("src"), "assets/web/a.jpg");
  check("and still writes the description", img.getAttribute("alt"), "A new description");
}

{
  const [img] = render({ p: { alt: "", url: null } });
  check("an empty description does not blank the one in the markup",
        img.getAttribute("alt"), "A plate of khinkali");
}

{
  const [img] = render({ somethingElse: { alt: "x", url: "https://a/b" } });
  check("a slot the data never mentions is untouched",
        [img.getAttribute("src"), img.getAttribute("alt")],
        ["assets/web/a.jpg", "A plate of khinkali"]);
}

console.log("\na src is a URL the owner typed\n");
{
  /* Each of these is stored by a database that refuses them and rendered by a
     renderer that refuses them, deliberately both — see render.js. What must
     never happen is the page fetching, or navigating to, whatever this says. */
  const refused = [
    ["javascript:", "javascript:alert(1)"],
    ["a data: URL", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["plain http", "http://example.com/photo.jpg"],
    ["a protocol-relative address", "//example.com/photo.jpg"],
    ["a relative path", "../../etc/passwd"],
    ["something with a space in it", "https://example.com/a b.jpg"]
  ];

  /* The control. Six assertions that a thing did not happen are all satisfied
     by a renderer that does nothing at all, so first: prove it does something.
     This has caught a whole harness once already — see memory.md, Deviations. */
  const [ok] = render({ p: { alt: "x", url: "https://example.com/photo.webp" } });
  check("a good https address really is written",
        ok.getAttribute("src"), "https://example.com/photo.webp");

  for (const [what, url] of refused) {
    const [img] = render({ p: { alt: "x", url } });
    check(`${what} is refused, and the built-in photograph stands`,
          img.getAttribute("src"), "assets/web/a.jpg");
  }
}

console.log("\nthe one security rule, in the code that writes photographs\n");
{
  /* render.js is scanned whole elsewhere; this is the photograph half of it,
     read on its own so that adding an innerHTML here is caught by the harness
     that owns this code rather than only by a general one. */
  const photoHalf = RENDER.slice(RENDER.indexOf("function renderPhotos"),
                                 RENDER.indexOf("/* ── go ──"));
  const found = ["innerHTML", "insertAdjacentHTML", "outerHTML", "document.write"]
    .filter((sink) => photoHalf.includes(sink));
  check("no HTML sink anywhere in it", found, []);

  /* …and the scan notices when one is put in. An assertion that never fails is
     not evidence of anything. */
  const sabotaged = photoHalf.replace("if (!photo) return;",
                                      "if (!photo) { img.innerHTML = \"\"; return; }");
  check("and the scan would notice one",
        ["innerHTML", "insertAdjacentHTML"].filter((s) => sabotaged.includes(s)),
        ["innerHTML"]);
}

console.log(failures
  ? `\n${failures} problem(s) — the photographs are not wired the way they are described`
  : "\nevery slot has a place, every place has a slot, and only https reaches an src");
process.exit(failures ? 1 : 0);
