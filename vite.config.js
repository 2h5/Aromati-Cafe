/* Vite is a preview server and a bundler for deployment. It is not part of
   development: the pages open from file:// by double-clicking them, every
   script is a classic script, and nothing here is required to see a change.
   See README.md and memory.md, "Workflow".

   Two things have to be spelled out, and both fail silently without it.

   1. Every page, by name. Vite builds one entry by default, so `npm run build`
      quietly produced a dist/ with four pages missing.

   2. Every script, by hand. Vite only processes <script type="module">. Ours
      are deliberately classic — modules do not work over file:// — so Vite
      leaves the src attribute pointing at a file it never copies. The built
      site loaded no JavaScript at all: no nav, no hours, and since Phase 1,
      no menus either, because the items are no longer in the markup to fall
      back to.

   Neither failure raises anything. The build says "✓ built" and the site is
   broken, which is why the copy step ends by asserting that every <script src>
   on every page actually landed in dist/. */

import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
const ROOT_FILES = ["_headers", "robots.txt"];

function copyClassicScripts() {
  let root = process.cwd();
  let outDir = "dist";

  return {
    name: "aromati:copy-classic-scripts",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
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
