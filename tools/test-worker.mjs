/* The edge middleware, and the three copies it keeps.
   node tools/test-worker.mjs

   functions/_middleware.js runs in front of every request to the deployed
   site. That makes it the most dangerous file in the project and the hardest
   to see: it does not run over file://, it does not run under `vite dev`, and
   nothing else in this repository loads it. A mistake in it is invisible until
   it is live.

   Three of its failures would be completely silent, and they are what this is
   for:

     1. **The policy stops matching _headers.** Cloudflare does not apply
        _headers to what a Function returns, so the middleware carries the
        Content-Security-Policy itself. Edit _headers and forget this file and
        the deployed site quietly runs a stale policy — the site looks perfect
        and its XSS story is a month out of date.

     2. **The Supabase project stops matching config.js.** The middleware asks
        a different database than the site does. It gets no rows, rewrites
        nothing, and the blink comes back with every test passing.

     3. **The URL is spelled differently from data.js.** render.js skips a slot
        when the src it finds equals the URL it would build. That comparison is
        the entire reason the rewrite and the runtime layer do not fight over
        the same photograph — a missing encodeURIComponent here and they both
        act, which is the swap this was built to remove.

   What this does NOT do is run the middleware. HTMLRewriter is a Workers
   runtime API and does not exist in Node; a stub of it would be a test of the
   stub. The rewrite is exercised for real by `npx wrangler pages dev dist`,
   which is written up in README.md. This file guards the parts that can be
   checked honestly without inventing a runtime. */

import { readFileSync, existsSync } from "node:fs";

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").slice(0, 8).map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);
const check = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(what);
  else fail(what, `want: ${JSON.stringify(want)}\n got: ${JSON.stringify(got)}`);
};

const MW = "functions/_middleware.js";
if (!existsSync(MW)) {
  console.log(`\n  FAIL ${MW} is missing — the deployed site has no photograph rewrite\n`);
  process.exit(1);
}
const mw = readFileSync(MW, "utf8");
const cfg = readFileSync("config.js", "utf8");
const headers = readFileSync("_headers", "utf8");

const pick = (re, text, what) => {
  const m = re.exec(text);
  if (!m) fail(`could not find ${what}`);
  return m ? m[1] : null;
};

console.log("\nthe middleware talks to the project the site talks to\n");
{
  check("the Supabase URL matches config.js",
        pick(/const SUPABASE_URL = "([^"]+)"/, mw, "SUPABASE_URL in the middleware"),
        pick(/url:\s*"([^"]+)"/, cfg, "url in config.js"));
  check("and so does the key",
        pick(/const SUPABASE_KEY = "([^"]+)"/, mw, "SUPABASE_KEY in the middleware"),
        pick(/anonKey:\s*"([^"]+)"/, cfg, "anonKey in config.js"));
}

console.log("\nthe policy the middleware sets is the policy in _headers\n");
{
  /* The `/*` rule, read the same way tools/check-csp.mjs reads it: comment
     lines stripped first, so a directive commented out counts as absent. */
  const live = headers.split("\n").filter((l) => !/^\s*#/.test(l));
  const line = live.find((l) => /Content-Security-Policy:/i.test(l));
  const fromHeaders = line ? line.split(/Content-Security-Policy:/i)[1].trim() : null;
  const fromWorker = pick(/const CSP = "([^"]+)"/, mw, "CSP in the middleware");

  /* Compared directive by directive rather than as one string. Whitespace
     between directives is not meaningful to a browser and a test that fails on
     it is a test people edit until it passes. */
  const directives = (p) => (p || "").split(";")
    .map((d) => d.trim().replace(/\s+/g, " ")).filter(Boolean).sort();

  check("every directive matches, none added, none dropped",
        directives(fromWorker), directives(fromHeaders));
}

console.log("\nthe storage URL is built the way data.js builds it\n");
{
  /* Not compared as source — the two are written in different styles and
     always will be. Both are lifted out and run, and asked the same questions,
     including the ones that are easy to get wrong: a space, a slash inside a
     slot name, and a character that has to survive being encoded. */
  const data = readFileSync("data.js", "utf8");

  const bodyOf = (text, name) => {
    const at = text.indexOf(`function ${name}(`);
    if (at < 0) return null;
    const open = text.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
    }
    return null;
  };

  const dataBody = bodyOf(data, "publicUrl");
  const mwBody = bodyOf(mw, "publicUrl");
  if (!dataBody || !mwBody) fail("one of the two publicUrl functions could not be read");
  else {
    const base = pick(/url:\s*"([^"]+)"/, cfg, "url in config.js");
    const fromData = new Function("AROMATI_CONFIG", "path", dataBody);
    const fromWorker = new Function("SUPABASE_URL", "path", mwBody);

    for (const path of ["hero.main/1785788648192.webp",
                        "story.a/name with spaces.webp",
                        "gallery.g2/a&b+c.webp",
                        "wine.board/ünïcode.webp"]) {
      check(`"${path.slice(0, 28)}" resolves identically`,
            fromWorker(base, path), fromData({ url: base }, path));
    }
  }
}

console.log("\nit cannot take the site down\n");
{
  /* The rule the file is built around. A rewrite is a nicety; serving the page
     is not. Every one of these is a path that must end in the untouched
     response rather than an error, and each is easy to remove by accident
     while tidying. */
  const flat = mw.replace(/\s+/g, " ");
  check("a failure while rewriting returns the original response",
        /catch \(err\) \{ .*? return response; \}/.test(flat), true);
  check("a database that cannot be reached is caught",
        /\.catch\(\(\) => \{/.test(flat), true);
  check("a response that is not HTML is passed straight through",
        flat.includes('if (!type.includes("text/html")) return response;'), true);
  check("the editor is never rewritten",
        flat.includes('endsWith("admin.html")'), true);
  check("nothing waits on the network when an answer is already in hand",
        flat.includes("context.waitUntil(inflight)"), true);
}

console.log("\nit never hands back a validator it cannot honour\n");
{
  /* This one was live, and it restored the entire blink for returning visitors
     while every other check here passed.

     Cloudflare's ETag describes the file on disk. The middleware's output
     depends on the photos table as well, so the two disagree the moment the
     owner uploads anything — and a browser holding the old ETag is answered
     304 and shown the page it already had, naming the previous photograph.

     A first visit is unaffected, which is what makes it invisible: it can only
     be reproduced by someone who loaded the page before the upload. */
  const flat = mw.replace(/\s+/g, " ");
  check("the asset server is never asked a conditional question for a page this rewrites",
        /headers\.delete\("if-none-match"\)/.test(flat) &&
        /headers\.delete\("if-modified-since"\)/.test(flat), true);
  check("and the stripped request is the one passed to next()",
        /next\(unconditional\(request\)\)/.test(flat), true);
  check("the page's own ETag is dropped before it goes out",
        /response\.headers\.delete\("ETag"\)/.test(flat), true);
  check("and so is Last-Modified, which answers the same question",
        /response\.headers\.delete\("Last-Modified"\)/.test(flat), true);

  /* Order matters and is easy to lose in a tidy-up: the drop has to happen
     before the early return for a database that answered with nothing, or the
     "no photographs" page is cached under the file's ETag and served to
     everyone after the first upload. */
  const dropAt = mw.indexOf('response.headers.delete("ETag")');
  const bailAt = mw.indexOf("if (!map || !map.size) return response;");
  check("dropped before the no-photographs early return, not after",
        dropAt > 0 && bailAt > 0 && dropAt < bailAt, true);
}

console.log("\nand the build tells it what it already put in the pages\n");
{
  const bake = readFileSync("tools/bake-photos.mjs", "utf8");
  check("the bake writes the manifest the middleware reads",
        bake.includes("_baked.json"), true);
  check("and the middleware reads it", mw.includes("/_baked.json"), true);
  /* Without this pairing the middleware rewrites every baked photograph from a
     same-origin file to a Supabase URL on every request — correct, and slower
     than doing nothing on the path where nothing has changed. */
}

console.log("\nthe middleware only runs where it has something to do\n");
{
  /* A project with any Function invokes it for every request by default —
     every stylesheet, every photograph, every seed script — and each is billed
     as a Worker request. _routes.json confines it to the pages it rewrites.

     Checked against the pages that actually exist rather than a list written
     here, because the failure is silent in the direction that matters: a page
     added and not listed simply never gets its photographs rewritten, and
     looks completely normal while doing it. */
  const PUBLIC = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html",
                  "menu-wine.html"].filter(existsSync);
  if (!existsSync("_routes.json")) fail("_routes.json is missing");
  else {
    const routes = JSON.parse(readFileSync("_routes.json", "utf8"));
    const want = ["/", ...PUBLIC.map((p) => "/" + p)].sort();
    check("every public page invokes the middleware",
          [...(routes.include || [])].sort(), want);
    check("and the editor does not", (routes.include || []).includes("/admin.html"), false);

    /* Pages serves "/" for index.html and redirects /index.html to it, so the
       bare root has to be listed or the home page — the one with the hero —
       is the single page the middleware never sees. */
    check("the bare root is listed, which is the path the home page is served on",
          (routes.include || []).includes("/"), true);
  }

  const vite = readFileSync("vite.config.js", "utf8");
  check("and the build copies it into dist/", vite.includes('"_routes.json"'), true);
}

console.log(failures
  ? `\n${failures} problem(s) — the deployed site may lose its policy, or blink\n`
  : "\nthe middleware agrees with config.js, _headers and data.js\n");
process.exit(failures ? 1 : 0);
