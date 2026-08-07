/* The owner's photographs, into the files, before the browser sees them.
   node tools/bake-photos.mjs        (run after `vite build`; see package.json)

   ── the problem this ends ──
   Every photograph ships in the markup as a real src:

       <img data-photo="hero.main" src="assets/web/hero-wine-frame.webp">

   which is what makes the site correct from file://, with no database and with
   JavaScript off. When the owner uploads a replacement, that line does not
   change — the database learns about it and the markup does not. So the
   browser paints what the file says, render.js asks the database, and the
   picture changes in front of the visitor.

   Everything that was tried in the browser to hide that moment failed in the
   same way, because the browser cannot win it: it has to paint before it can
   ask, so the only choices are "show the old one" and "show nothing". There is
   no third one. photo-boot.js narrows the window and cannot close it.

   This closes it, by removing the disagreement instead of hiding it. At build
   time — where there is no visitor waiting and a network request costs nothing
   — the current photograph is downloaded and written into the built page as
   the src. The HTML the browser receives already names the right picture. It
   paints once. There is nothing for JavaScript to replace, and on a baked slot
   render.js is told to leave it alone entirely.

   ── it writes to dist/, never to the source tree ──
   Deliberate, and the reason the whole thing is safe.

   The source tree keeps the photographs that are committed to git, so
   file://, `vite dev`, a fresh clone and a database that has been deleted all
   behave exactly as they did before this file existed. Nothing here can leave
   the repository in a state a person has to notice or undo, and running a
   build never shows up in `git status`. The bake exists only in the artifact
   that gets uploaded.

   ── failure is not fatal, on purpose ──
   If the database cannot be reached, this prints what happened and exits 0,
   leaving dist/ exactly as vite built it — which is the site as committed,
   which is correct. That is the same floor the rest of the project stands on
   (see memory.md): when the live layer is unavailable, serve what is in git.
   A deploy must never fail because Supabase was slow.

   The one thing it will not do is half-bake. A page is rewritten only after
   every photograph it needs is on disk.

   ── what it costs to keep current ──
   A photograph changed in the CMS reaches the site on the next build, not
   immediately. Cloudflare Pages counts builds against a monthly quota, so
   nothing here triggers one — a person does, or a deploy hook does. The
   editor says so in as many words; see photoNote() in admin.js. Until that
   build happens the old runtime path still covers the slot, so the change is
   live either way — it just blinks until the files catch up. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, extname } from "node:path";

const OUT = "dist";
const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html",
               "menu-wine.html"];

/* admin.html is not in that list and must not be. The editor's thumbnails are
   built by admin.js from the photos table at runtime — it is *looking at* the
   database, not being served from it — and rewriting its markup would make it
   show a picture from the last build rather than the one currently uploaded. */

let notes = 0;
const say = (m) => console.log("  " + m);
const skip = (why) => {
  console.log(`\n  skip  ${why}`);
  console.log("        dist/ keeps the photographs committed to git, which is correct.\n");
  process.exit(0);
};

console.log("\nbaking the owner's photographs into dist/\n");

if (!existsSync(OUT)) skip(`there is no ${OUT}/ — run \`vite build\` first`);

/* ── where the photographs live ──────────────────────────────────────────────
   Read out of config.js rather than an environment variable, because config.js
   is the file the site itself reads and the one a person edits when the project
   moves. A second copy of the project URL is a second thing to forget. The anon
   key is public by design — see the note at the top of config.js. */
const cfg = existsSync("config.js") ? readFileSync("config.js", "utf8") : "";
const BASE = (cfg.match(/url:\s*"(https:\/\/[^"]+)"/) || [])[1];
const KEY = (cfg.match(/anonKey:\s*"([^"]+)"/) || [])[1];

if (!BASE || !KEY || KEY.length < 20) {
  skip("config.js names no Supabase project — this build has no live content");
}

async function rest(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/* Same shape data.js builds, and for the same reason it builds it there: the
   storage path is a path, and turning it into a URL is one rule that must not
   have two spellings. */
const publicUrl = (p) =>
  `${BASE}/storage/v1/object/public/site-photos/` +
  String(p).split("/").map(encodeURIComponent).join("/");

let rows;
try {
  rows = await rest("photos?select=slot,storage_path");
} catch (err) {
  skip(`the database did not answer — ${err.message}`);
}

const uploaded = rows.filter((r) => r && r.slot && r.storage_path);
if (!uploaded.length) {
  console.log("  no slot has an uploaded photograph — nothing to bake");
  console.log("\n  dist/ ships the photographs in git, which is the current set.\n");
  process.exit(0);
}

/* ── fetch the pictures ──────────────────────────────────────────────────────
   Named by a hash of the storage path rather than by slot, so the filename
   changes when the photograph does. That is what makes them safe to serve with
   a long cache lifetime, and it is why a visitor whose browser has last week's
   copy is not shown it: a different photograph is a different URL. */
const dir = resolve(OUT, "assets");
mkdirSync(dir, { recursive: true });

const baked = new Map();     // slot → { file, storage_path }
const failed = [];

for (const row of uploaded) {
  const url = publicUrl(row.storage_path);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) throw new Error("empty");

    /* The extension comes off the stored path. The bucket only ever holds what
       the editor put in it, and the editor writes the extension it uploaded. */
    const ext = extname(row.storage_path) || ".webp";
    const stamp = createHash("sha256").update(row.storage_path).digest("hex").slice(0, 8);
    const file = `assets/baked-${row.slot.replace(/[^a-z0-9]+/gi, "-")}-${stamp}${ext}`;

    writeFileSync(resolve(OUT, file), bytes);
    baked.set(row.slot, { file, path: row.storage_path, bytes: bytes.length });
  } catch (err) {
    failed.push(`${row.slot} (${err.message})`);
  }
}

if (!baked.size) skip(`not one photograph could be fetched — ${failed.join(", ")}`);

/* ── rewrite the pages ───────────────────────────────────────────────────────
   The src on the <img> carrying that slot, and nothing else on the line. The
   attribute is replaced by position rather than by rebuilding the tag, so
   alt, loading, decoding, data-parallax-img and everything else the markup
   says about that image survives untouched — this is a build step editing a
   page it did not write, and the less of it it understands the better. */
function rewritePage(html, page) {
  let count = 0;
  const out = html.replace(
    /<img\b[^>]*>/g,
    (tag) => {
      const slot = (tag.match(/\bdata-photo="([^"]+)"/) || [])[1];
      if (!slot || !baked.has(slot)) return tag;
      if (!/\bsrc="[^"]*"/.test(tag)) return tag;
      count++;
      return tag.replace(/\bsrc="[^"]*"/, `src="${baked.get(slot).file}"`);
    }
  );
  if (count) say(`${page.padEnd(17)} ${count} photograph${count === 1 ? "" : "s"}`);
  return out;
}

for (const page of PAGES) {
  const file = resolve(OUT, page);
  if (!existsSync(file)) { failed.push(`${page} is not in ${OUT}/`); continue; }
  writeFileSync(file, rewritePage(readFileSync(file, "utf8"), page));
}

/* ── tell the runtime to stand down ──────────────────────────────────────────
   The last and least obvious step, and the site blinks without it.

   After the rewrite the page carries the current photograph — but the database
   still carries a storage_path for that slot, so data.js would go on reporting
   an override and render.js would go on setting a src. The visitor would be
   shown the correct picture and then handed the *same* picture from a
   different URL, which is a fetch, a decode and a repaint for no change at all.

   So each baked slot is stamped in dist/data/seed-photos.js with the exact
   storage path it was baked from. data.js compares that against what the
   database says: equal means the markup already has this picture and no
   override is reported; different means the owner has changed it since this
   build, and the override applies exactly as it always did. The runtime layer
   turns itself off for what is baked and stays on for what is not, with no
   flag to set and nothing to keep in step by hand.

   `src` is stamped too, because the editor reads it to show a thumbnail of the
   built-in photograph — and after a bake the built-in photograph *is* the one
   from the bucket. See the same rewrite in vite.config.js, which this follows. */
const seedFile = resolve(OUT, "data/seed-photos.js");
if (!existsSync(seedFile)) {
  skip(`${OUT}/data/seed-photos.js is missing — the build did not finish`);
}

let seed = readFileSync(seedFile, "utf8");
let stamped = 0;

for (const [slot, info] of baked) {
  /* The entry for this slot, from its key to the end of its object. Anchored on
     the quoted key so a slot whose name is a prefix of another cannot match the
     wrong line. */
  const entry = new RegExp(`("${slot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*\\{)([^}]*)\\}`);
  if (!entry.test(seed)) { failed.push(`${slot} has no entry in seed-photos.js`); continue; }
  seed = seed.replace(entry, (_m, open, body) => {
    const withSrc = body.replace(/src:\s*"[^"]*"/, `src: "${info.file}"`);
    return `${open}${withSrc.replace(/,\s*$/, "")}, baked: ${JSON.stringify(info.path)} }`;
  });
  stamped++;
}

writeFileSync(seedFile, seed);

/* Then read it back and ask the only question that matters, the same way
   vite.config.js does: does every baked slot actually name a file that is
   there? A rewrite that silently matched nothing leaves a page that loads and
   404s, which is worse than not baking at all. */
for (const [slot, info] of baked) {
  if (!existsSync(resolve(OUT, info.file))) failed.push(`${slot} → ${info.file} missing`);
  if (!seed.includes(JSON.stringify(info.path))) failed.push(`${slot} was not stamped`);
}

if (failed.length) {
  console.error("\n  bake failed:\n    " + failed.join("\n    "));
  console.error("\n  dist/ may be half-rewritten. Rebuild before deploying.\n");
  process.exit(1);
}

const kb = [...baked.values()].reduce((n, b) => n + b.bytes, 0) / 1024;
console.log(`\n  ${baked.size} photograph${baked.size === 1 ? "" : "s"} baked in ` +
            `(${kb.toFixed(0)} kB), ${stamped} stamped so the runtime leaves them alone`);
console.log("  the built pages now name the owner's photographs directly\n");
notes = 0;
process.exit(0);
