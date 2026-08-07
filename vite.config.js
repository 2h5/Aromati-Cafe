/* Vite is a preview server and a bundler for deployment. It is not part of
   development: the pages open from file:// by double-clicking them, every
   script is a classic script, and nothing here is required to see a change.
   See README.md and memory.md, "Workflow".

   Three things have to be spelled out, and all three fail silently without it.

   1. Every page, by name. Vite builds one entry by default, so `npm run build`
      quietly produced a dist/ with four pages missing.

   2. Every script, by hand. Vite only processes <script type="module">. Ours
      are deliberately classic — modules do not work over file:// — so Vite
      leaves the src attribute pointing at a file it never copies. The built
      site loaded no JavaScript at all: no nav, no hours, and since Phase 1,
      no menus either, because the items are no longer in the markup to fall
      back to.

   3. Every photograph the editor names. A path inside a classic script is a
      string to Vite, so the built-in photographs kept their source-tree paths
      while the files themselves were emitted under hashed names. The site was
      perfect and the editor showed a broken thumbnail on every photograph the
      owner had not yet replaced.

   None of the three raises anything. The build says "✓ built" and something is
   broken, which is why every step below ends by asserting that what it just
   did actually landed in dist/. */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { defineConfig } from "vite";

/* admin.html is built with the rest. It is not part of the site a visitor
   sees — robots.txt and its own meta tag ask crawlers to leave it alone — but
   it has to be *deployed*, or the owner cannot edit anything. Leaving it out
   here is a build that works perfectly and ships no editor. It also drags in
   vendor/supabase.js, which the copy step below then has to place. */
const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html",
               "menu-wine.html", "admin.html"];

/* Every local script the pages reference, read off the pages themselves rather
   than listed here, so adding one to a page is enough and this file cannot
   fall behind. */
function classicScripts(root) {
  const found = new Set();
  for (const page of PAGES) {
    const html = readFileSync(resolve(root, page), "utf8");
    for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
      if (!/^(https?:)?\/\//.test(m[1])) found.add(m[1]);
    }
  }
  return [...found].sort();
}

/* Root files no page links to, so nothing above would ever pull them in, and
   both fail *silently* when they are missing — which is how they went missing.
   _headers is the entire security posture: Cloudflare Pages turns it into the
   CSP, nosniff, and the noindex on admin.html. A deploy without it looks
   identical and has none of them. robots.txt is the other half of keeping the
   editor out of search results; the meta tag alone is the weaker half.
   tools/check-csp.mjs reads these from the source tree, so it passes whether or
   not they ever reached the build — it cannot catch this, and did not. */
/* _routes.json joined them in Phase 7. Once a project has any Function at all,
   Cloudflare invokes it for *every* request by default — every stylesheet,
   every photograph, every seed script — and each one is billed as a Worker
   request. The middleware has nothing to say about any of those; it rewrites
   photograph src attributes in HTML. This file confines it to the five public
   pages, which is the difference between a handful of invocations per visit
   and forty.

   It fails the same silent way as the other two: without it everything works,
   costs more, and says nothing. tools/test-worker.mjs asserts it lists exactly
   the pages that exist. */
const ROOT_FILES = ["_headers", "robots.txt"];

/* 3. The built-in photographs, at the path the *editor* asks for them by.

   Vite rewrites every image it finds in markup or CSS, so a visitor's pages
   get hashed filenames and are fine. data/seed-photos.js carries the same
   files as plain strings inside a classic script, which Vite has no way to
   see through — so `assets/web/` existed nowhere in dist/, while admin.js
   asks for exactly that path whenever a slot is still showing the photograph
   the site was built with.

   That is every slot, on the owner's first login: a broken thumbnail on every
   row, and "Adjust framing" reporting that the photograph "could not be
   reopened" when what actually happened was a 404. It cured itself one row at
   a time as photographs were replaced, which is how it survived being looked
   at — the only person who sees the un-replaced state is the owner, once, at
   the beginning.

   The fix is not to ship the files a second time under the name the seed uses.
   Vite has already emitted every one of them, and the editor should be looking
   at the very file the page shows — same bytes, same cache entry, no way for
   the preview and the site to drift apart. So the seed's `src` strings are
   rewritten in dist/ to the names Vite gave them.

   The source tree is untouched: `assets/web/…` is still what the pages carry
   and what opens from file://. Only the built copy is rewritten, and only the
   `src` — `alt` and the dimensions are the editor's and stay as they are. */
function seedPhotoSources(file) {
  const sandbox = {};
  runInNewContext(readFileSync(file, "utf8"), sandbox);
  if (!sandbox.SEED_PHOTOS) {
    throw new Error(`build: ${file} did not define SEED_PHOTOS — the editor's ` +
                    "built-in photographs cannot be located.");
  }
  return [...new Set(
    Object.values(sandbox.SEED_PHOTOS).map((p) => p && p.src).filter(Boolean)
  )].sort();
}

/* dist/ is flat — every page sits at its root — so a path relative to the
   built page is the emitted name as Rollup reports it. */
function rewriteSeedPhotos(root, outDir, emitted) {
  const file = resolve(root, outDir, "data/seed-photos.js");
  let text = readFileSync(file, "utf8");
  const unresolved = [];

  for (const src of seedPhotoSources(resolve(root, "data/seed-photos.js"))) {
    const built = emitted.get(src);
    if (!built) { unresolved.push(`${src} (no page or stylesheet references it)`); continue; }
    if (!existsSync(resolve(root, outDir, built))) {
      unresolved.push(`${src} → ${built} (named by the build, absent from ${outDir}/)`);
      continue;
    }
    text = text.split(`"${src}"`).join(`"${built}"`);
  }

  if (unresolved.length) {
    throw new Error(
      "build: these built-in photographs could not be pointed at their built " +
      "copy — the editor would show a broken thumbnail for every slot still " +
      "using one, and could not open them for framing:\n  " +
      unresolved.join("\n  ") +
      "\n\nA photograph reaches dist/ by being referenced from a page or a " +
      "stylesheet. One that only data/seed-photos.js names is never emitted."
    );
  }

  writeFileSync(file, text);

  /* Then read the written file back and ask the only question that matters: is
     every photograph it now names actually there? A rewrite that silently
     matched nothing leaves a file that parses, loads, and 404s — which is the
     failure this whole step exists to end, restored in a new spelling. */
  const missing = seedPhotoSources(file)
    .filter((src) => !existsSync(resolve(root, outDir, src)));

  if (missing.length) {
    throw new Error(
      `build: ${outDir}/data/seed-photos.js still names photographs that are ` +
      `not in ${outDir}/ — the editor would show them as broken:\n  ` +
      missing.join("\n  ")
    );
  }
}

function copyClassicScripts() {
  let root = process.cwd();
  let outDir = "dist";
  /* source path as the seed file spells it → the name Vite emitted it under */
  const emitted = new Map();

  return {
    name: "aromati:copy-classic-scripts",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    /* The only place the two names are known together. By closeBundle the
       bundle object is gone and all that is left on disk is a hash. */
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        for (const from of chunk.originalFileNames || []) {
          emitted.set(from.split("\\").join("/"), chunk.fileName);
        }
      }
    },
    configureServer(server) {
      /* Vite normally transforms .js requests in dev. The vendored Supabase
         browser build is already a complete classic script, but it contains an
         optional dynamic telemetry import that is intentionally not installed.
         Serve this one third-party file as-is so the optional import can fail
         quietly in the browser instead of making Vite return a 500. */
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || "").split("?", 1)[0];
        if (pathname !== "/vendor/supabase.js") return next();

        const file = resolve(root, "vendor/supabase.js");
        if (!existsSync(file)) return next();

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/javascript");
        res.setHeader("Cache-Control", "no-cache");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const missing = [];

      for (const src of classicScripts(root)) {
        const from = resolve(root, src);
        const to = resolve(root, outDir, src);
        if (!existsSync(from)) { missing.push(`${src} (not in the source tree)`); continue; }
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        if (!existsSync(to)) missing.push(src);
      }

      if (missing.length) {
        throw new Error(
          "build: these scripts are referenced by a page but did not reach " +
          `${outDir}/ — the built site would load no JavaScript:\n  ` +
          missing.join("\n  ")
        );
      }

      /* Same discipline as above: copy, then assert. A silent failure here is a
         site that serves no CSP and an editor that search engines may index. */
      const lost = [];
      for (const name of ROOT_FILES) {
        const from = resolve(root, name);
        const to = resolve(root, outDir, name);
        if (!existsSync(from)) { lost.push(`${name} (not in the source tree)`); continue; }
        copyFileSync(from, to);
        if (!existsSync(to)) lost.push(name);
      }

      if (lost.length) {
        throw new Error(
          `build: these root files did not reach ${outDir}/ — the deployed site ` +
          "would have no CSP and no robots.txt, and would look completely " +
          "normal:\n  " + lost.join("\n  ")
        );
      }

      /* Last, because it rewrites a file the script copy above has just put
         there — the source seed file, verbatim, source-tree paths and all. */
      rewriteSeedPhotos(root, outDir, emitted);
    }
  };
}

export default defineConfig({
  /* Relative asset paths, so dist/ works from a subdirectory, from a preview
     host, and by double-clicking — the same way the source tree does. The
     default is root-absolute and only works when dist/ is the web root. */
  base: "./",
  appType: "mpa",                       // no SPA fallback: a missing page is a 404
  plugins: [copyClassicScripts()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map((p) => [p.replace(/\.html$/, ""), resolve(__dirname, p)])
      )
    }
  }
});
