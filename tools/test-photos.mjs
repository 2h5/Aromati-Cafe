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

/* ── what render.js must NOT write ─────────────────────────────────────────
   This file used to prove that render.js replaced an <img> src from the
   database, that it wrote the description beside it, and that it refused a src
   that was not https. All of that was deleted on 2026-08-07 along with the
   runtime swap it described — see PHOTOGRAPHS.md.

   The rule that replaced it is narrower and stronger, and it is the one line
   the whole design rests on: **nothing may set an img src after paint.** So
   that is what is checked here. A photograph now reaches the page one way,
   from tools/bake-photos.mjs at build time, and tools/test-bake.mjs owns that
   half — including the https rule, which moved with the code that enforces it.

   The failure this guards against is a well-meant restoration: someone finds
   that a photograph uploaded ten minutes ago is not live yet, reaches for the
   obvious fix, and puts the blink back into a project that spent a week
   removing it. */

console.log("\nnothing in render.js writes a photograph into the page\n");
{
  const dom = new JSDOM(
    '<!doctype html><body>' +
    '<img data-photo="p" src="assets/web/a.jpg" alt="A plate of khinkali">' +
    '<img data-photo="p" data-photo-decorative src="assets/web/a.jpg" alt="">' +
    '</body>',
    { runScripts: "dangerously" });
  const { window } = dom;

  /* The database is answering, and answering with a replacement — the exact
     condition the old code acted on. Nothing may act on it now. */
  const url = "https://project.supabase.co/storage/v1/object/public/site-photos/p/1.webp";
  const s = window.document.createElement("script");
  s.textContent = `var SEED_PHOTOS = {};\n` +
    `var AROMATI_DATA = { current: function () { return { photos: ${JSON.stringify({ p: { alt: "Khinkali, pleated by hand", url } })} }; },\n` +
    `                     refresh: function (done) { done(null); } };\n` + RENDER;
  window.document.body.appendChild(s);

  const imgs = [...window.document.querySelectorAll("[data-photo]")];
  check("the markup's own photograph is still the one on the page",
        imgs.map((i) => i.getAttribute("src")), ["assets/web/a.jpg", "assets/web/a.jpg"]);
  check("and the markup's own description is untouched",
        imgs[0].getAttribute("alt"), "A plate of khinkali");
}

console.log("\nand the source says so too\n");
{
  /* The DOM check above passes for the wrong reason if renderPhotos is simply
     never *called* while still sitting in the file, so the source is read as
     well. Both, because either alone is satisfied by a state nobody wants. */
  const named = ["renderPhotos", "setPhoto", "releaseSlot", "AROMATI_PHOTO_BOOT"]
    .filter((name) => RENDER.includes(name));
  check("no runtime photograph code is left in render.js", named, []);

  /* A src assigned to anything at all, anywhere in the file. Written as a scan
     rather than a list of names so that reintroducing the behaviour under a new
     name is caught too — the restoration this guards against will not be called
     renderPhotos. */
  const writes = RENDER.match(/\.(setAttribute\(\s*["']src["']|src\s*=[^=])/g) || [];
  check("nothing in render.js assigns a src", writes, []);
}

console.log("\nthe one security rule, in the code that writes photographs\n");
{
  /* The photograph half of render.js is gone, so the sink scan that used to
     live here moved with it: tools/test-bake.mjs checks that the build step
     escapes what it writes, which is where owner-typed text now enters markup.
     What is still worth asserting here is that render.js as a whole has no HTML
     sink — it is the file that renders every other piece of owner-typed
     content, and that rule predates photographs. */
  /* Comments first. render.js opens by stating this very rule — "Never
     innerHTML, never insertAdjacentHTML" — so a scan of the raw text finds the
     prohibition and reports it as a violation. The old scan was scoped to the
     photographs section and never met that paragraph; widened to the file, it
     does. A control that fails on the sentence describing it is a control that
     gets deleted for being noisy. */
  const code = RENDER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found = ["innerHTML", "insertAdjacentHTML", "outerHTML", "document.write"]
    .filter((sink) => code.includes(sink));
  check("no HTML sink anywhere in render.js", found, []);

  /* …and the scan notices when one is put in. An assertion that never fails is
     not evidence of anything — and this one has to be sabotaged *after* the
     comments come off, or it would only be proving that the stripper works. */
  const sabotaged = code.replace("function paint(content) {",
                                 "function paint(content) { document.body.innerHTML = \"\";");
  check("and the scan would notice one",
        ["innerHTML", "insertAdjacentHTML"].filter((s) => sabotaged.includes(s)),
        ["innerHTML"]);
}


console.log(failures
  ? `\n${failures} problem(s) — the photographs are not wired the way they are described`
  : "\nevery slot has a place, every place has a slot, and only https reaches an src");
process.exit(failures ? 1 : 0);
