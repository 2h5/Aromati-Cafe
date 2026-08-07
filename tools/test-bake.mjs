/* The owner's photographs, in the built files.
   node tools/test-bake.mjs

   tools/bake-photos.mjs is the fix for a bug that took four attempts in the
   browser and could not be fixed there — the page shipping one photograph
   while the database holds another. It works by editing dist/, which means two
   classes of failure, and they want opposite tests:

     1. It does not bake. A path that quietly skips leaves the site exactly as
        it is today, blink included, and *every other test still passes*. That
        is the failure this file exists to catch, because nothing else can see
        it: the source tree is untouched by design, so there is nothing to
        assert against anywhere but the build output.

     2. It bakes wrongly. A rewritten page naming a file that is not there is a
        broken image on the live site — strictly worse than the blink. So the
        pages, the assets and the seed stamp are checked against each other
        rather than each being checked alone.

   And one rule that is not about photographs at all: the source tree must come
   out of a build byte for byte unchanged. A build step that edits committed
   files is one that turns `git status` into noise and eventually gets
   committed by accident.

   No network. The database is a stub and the pictures are bytes made up here,
   so this runs on a plane and in CI, and a red result means the code changed
   rather than that Supabase was slow. */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").slice(0, 6).map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);
const check = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(what);
  else fail(what, `want: ${JSON.stringify(want)}\n got: ${JSON.stringify(got)}`);
};

const WORK = "tmp-bake-test";
const SLOT = "hero.main";
const STORED = "hero.main/1786070812969.webp";

/* A one-pixel WebP. Real bytes, because the tool checks the response is not
   empty and writes what it got — a string would pass this test and ship a
   corrupt image. */
const PIXEL = Buffer.from(
  "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

/* A dist/ as vite leaves it: the pages with their shipped photographs, and the
   seed file the editor reads. Built by hand rather than by running vite, so a
   failure here is this tool's and not the bundler's. */
function stageDist() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(resolve(WORK, "dist/assets"), { recursive: true });
  mkdirSync(resolve(WORK, "dist/data"), { recursive: true });

  cpSync("config.js", resolve(WORK, "config.js"));

  for (const page of ["index.html", "faq.html", "menu-food.html",
                      "menu-drinks.html", "menu-wine.html"]) {
    cpSync(page, resolve(WORK, "dist", page));
  }
  cpSync("data/seed-photos.js", resolve(WORK, "dist/data/seed-photos.js"));
  cpSync("tools/bake-photos.mjs", resolve(WORK, "bake-photos.mjs"));
}

/* The tool talks to the network twice — the photos table, then each picture —
   and both are answered here. `rows` is what the database says; `serveImage`
   decides whether the bucket hands the bytes over. */
function run({ rows, serveImage = true, answerDb = true }) {
  const shim = `
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/rest/v1/")) {
    if (!${answerDb}) return { ok: false, status: 503, json: async () => [] };
    return { ok: true, status: 200, json: async () => (${JSON.stringify(rows)}) };
  }
  if (u.includes("/storage/v1/")) {
    if (!${serveImage}) return { ok: false, status: 404 };
    return { ok: true, status: 200,
             arrayBuffer: async () => Buffer.from(${JSON.stringify(PIXEL.toString("base64"))}, "base64") };
  }
  return realFetch(url);
};
await import("./bake-photos.mjs");
`;
  writeFileSync(resolve(WORK, "run.mjs"), shim);
  try {
    const out = execFileSync(process.execPath, ["run.mjs"],
      { cwd: WORK, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { out, code: 0 };
  } catch (err) {
    return { out: (err.stdout || "") + (err.stderr || ""), code: err.status };
  }
}

const read = (p) => readFileSync(resolve(WORK, "dist", p), "utf8");

console.log("\nthe photograph the owner uploaded, in the built page\n");
{
  stageDist();
  const r = run({ rows: [{ slot: SLOT, storage_path: STORED }] });
  check("the tool succeeds", r.code, 0);

  const html = read("index.html");
  const src = (html.match(/<img\b[^>]*data-photo="hero\.main"[^>]*>/) || [""])[0]
    .match(/src="([^"]+)"/);

  check("the hero's src now points at a baked file",
        !!(src && /^assets\/baked-hero-main-[0-9a-f]{8}\.webp$/.test(src[1])), true);
  check("and that file is actually in dist/",
        !!(src && existsSync(resolve(WORK, "dist", src[1]))), true);
  check("the shipped photograph is no longer named",
        html.includes("hero-wine-frame.webp"), false);

  /* The one that makes the bake worth doing rather than a wash. Without the
     stamp the page opens on the right picture and is then handed the same
     picture from the bucket — a second fetch and repaint, every load. */
  const seed = read("data/seed-photos.js");
  check("the slot is stamped with the storage path it was baked from",
        seed.includes(JSON.stringify(STORED)), true);

  /* Read the stamped seed the way the browser reads it, and ask data.js's
     question of it. Asserting on the text would pass on a stamp that is in a
     comment or in the wrong entry. */
  const sandbox = {};
  new Function("g", `with (g) { ${seed} } g.SEED_PHOTOS = SEED_PHOTOS;`)(sandbox);
  check("and it is on that slot's entry, where data.js looks",
        sandbox.SEED_PHOTOS[SLOT].baked, STORED);
  check("a slot with no upload is not stamped",
        "baked" in sandbox.SEED_PHOTOS["story.a"], false);
  check("the editor's thumbnail follows the baked file",
        sandbox.SEED_PHOTOS[SLOT].src, src && src[1]);
}

console.log("\nthe markup around the photograph is left alone\n");
{
  /* A build step editing a page it did not write should understand as little
     of it as possible. Everything except the src has to survive — alt is
     accessibility, loading and decoding are performance, data-parallax-img is
     script.js's. */
  const before = readFileSync("index.html", "utf8");
  const tagOf = (html, slot) =>
    (html.match(new RegExp(`<img\\b[^>]*data-photo="${slot.replace(".", "\\.")}"[^>]*>`)) || [""])[0];

  const wasHero = tagOf(before, SLOT);
  const nowHero = tagOf(read("index.html"), SLOT);

  check("alt survives", nowHero.includes('alt="The upstairs dining room'), true);
  check("every other attribute survives",
        wasHero.replace(/src="[^"]*"/, "src=X"), nowHero.replace(/src="[^"]*"/, "src=X"));

  const wasStory = tagOf(before, "story.a");
  check("an un-baked slot's tag is untouched entirely",
        tagOf(read("index.html"), "story.a"), wasStory);
}

console.log("\nthe source tree is never written to\n");
{
  /* The rule that keeps this safe to run. A build step that edits committed
     files makes `git status` lie, and the edit gets committed by somebody in a
     hurry.

     Compared by content around a bake, not read off `git status` — the working
     tree may be dirty for a hundred reasons that are none of this tool's
     business, and a check that reports those as its own failure is a check
     people learn to ignore. This one is false only if *this run* wrote to the
     source tree. */
  const WATCHED = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html",
                   "menu-wine.html", "data/seed-photos.js", "config.js"];
  const before = new Map(WATCHED.map((f) => [f, readFileSync(f, "utf8")]));

  stageDist();
  run({ rows: [{ slot: SLOT, storage_path: STORED }] });

  const written = WATCHED.filter((f) => readFileSync(f, "utf8") !== before.get(f));
  check("a bake writes to no file in the repository", written, []);
}

console.log("\nnothing reachable means nothing changes\n");
{
  /* The floor the whole project stands on: when the live layer is unavailable,
     serve what is in git. A deploy must not fail because Supabase was slow,
     and it must not ship a page with a hole in it either. */
  stageDist();
  const before = read("index.html");
  const r = run({ rows: [], answerDb: false });
  check("a database that will not answer is survivable", r.code, 0);
  check("and it says so out loud", /skip/.test(r.out), true);
  check("the page still names the photograph in git", read("index.html"), before);
}
{
  stageDist();
  const before = read("index.html");
  const r = run({ rows: [] });
  check("no uploads at all is not an error", r.code, 0);
  check("and the page is left as built", read("index.html"), before);
}
{
  /* The database says there is a photograph and the bucket will not hand it
     over — a deleted object, a bucket that stopped being public. Rewriting the
     page to a file that was never written would be a broken image on the live
     site, which is worse than the blink this exists to fix. */
  stageDist();
  const before = read("index.html");
  const r = run({ rows: [{ slot: SLOT, storage_path: STORED }], serveImage: false });
  check("a photograph that cannot be fetched does not get baked", r.code, 0);
  check("and the page keeps the one it shipped with", read("index.html"), before);
  check("nothing is stamped either",
        read("data/seed-photos.js").includes(JSON.stringify(STORED)), false);
}

console.log("\nthe build machine is told which Node to use\n");
{
  /* Not a detail. Cloudflare Pages picks a very old default Node for a project
     that does not pin one, and old Node has no global `fetch` — so the bake
     would fail on the deploy machine and nowhere else, which is the worst
     place for a failure to live. The tool skips rather than crashing if it
     lands there anyway, but the pin is what stops it landing there. */
  check(".nvmrc exists", existsSync(".nvmrc"), true);
  const pinned = existsSync(".nvmrc")
    ? parseInt(readFileSync(".nvmrc", "utf8").trim().replace(/^v/, ""), 10) : 0;
  check("and pins Node 18 or newer", pinned >= 18, true);

  const tool = readFileSync("tools/bake-photos.mjs", "utf8");
  check("the tool survives an old Node rather than failing the deploy",
        /typeof fetch !== "function"/.test(tool), true);
}

console.log("\nthe editor is not rewritten\n");
{
  /* admin.html builds its thumbnails from the photos table at runtime — it is
     looking at the database, not being served from it. Baking its markup would
     show the owner the picture from the last build while they are staring at
     the one they just uploaded. */
  const tool = readFileSync("tools/bake-photos.mjs", "utf8");
  const pages = (tool.match(/const PAGES = \[[^\]]*\]/) || [""])[0];
  check("admin.html is not in the list of pages to rewrite",
        pages.includes("admin.html"), false);
}

rmSync(WORK, { recursive: true, force: true });

console.log(failures
  ? `\n${failures} problem(s) — the built site may blink, or show a broken image\n`
  : "\nthe built pages name the owner's photographs, and git is untouched\n");
process.exit(failures ? 1 : 0);
