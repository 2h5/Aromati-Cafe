/* Would the Content-Security-Policy break the site it is protecting?
   node tools/check-csp.mjs

   A CSP is the one security control whose failure mode is the site breaking
   rather than the site being exposed — and breaking *quietly*, in a way that
   looks like a CSS bug or a dead button. Nobody tests it, because everything
   works locally: `_headers` is a Cloudflare Pages file and has no effect over
   file:// or under `vite dev`. The first place the policy is real is
   production.

   So this reads `_headers` and checks the site against it statically:

     - nothing inline that script-src / style-src would drop
     - every origin the pages and the stylesheet reference is allowed
     - the Supabase project in config.js is the one connect-src permits

   That last one is worth its own sentence. If the project ref changes in one
   file and not the other, the site does not error. data.js's fetch is blocked,
   the catch fires, and it falls back to the seed data — which renders a
   complete, correct-looking site that silently stopped showing live content.
   That could go unnoticed for months. */

import { readFileSync, existsSync } from "node:fs";

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

console.log("\nthe content security policy against the site it protects\n");

if (!existsSync("_headers")) {
  fail("_headers is missing", "Cloudflare Pages reads it from the root of the upload");
  process.exit(1);
}

const headers = readFileSync("_headers", "utf8");

/* The site-wide policy is the one under the `/*` rule. Comment lines start
   with # and are stripped, so a directive that has been commented out counts
   as absent rather than as present. */
const policy = (() => {
  const live = headers.split("\n").filter((l) => !/^\s*#/.test(l));
  const line = live.find((l) => /Content-Security-Policy:/i.test(l));
  if (!line) return null;
  const out = {};
  line.split(":").slice(1).join(":").split(";").forEach((part) => {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length) out[bits[0]] = bits.slice(1);
  });
  return out;
})();

if (!policy) {
  fail("_headers has no Content-Security-Policy", "there is a policy in the comments, but not in force");
  process.exit(1);
}

/* ── 1. nothing inline that script-src would drop ──────────────────────────
   A <script> with no src and an executable type needs 'unsafe-inline', which
   would give away most of the value of having a policy. JSON-LD is not
   executable and is not gated — that is why the site can be this strict. */
{
  const guilty = [];
  for (const p of PAGES) {
    if (!existsSync(p)) continue;
    const html = readFileSync(p, "utf8");
    for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const [, attrs, body] = m;
      if (/\bsrc=/i.test(attrs)) continue;
      const type = (/\btype=["']([^"']+)["']/i.exec(attrs) || [])[1] || "";
      /* Anything the browser will actually run. ld+json and other data blocks
         are inert and CSP leaves them alone. */
      const executable = !type || /^(text\/javascript|module|application\/javascript)$/i.test(type);
      if (executable && body.trim()) guilty.push(`${p} — inline <script${attrs}>`);
    }
  }
  const inlineOk = (policy["script-src"] || []).includes("'unsafe-inline'");
  if (guilty.length && !inlineOk) {
    fail("an inline script would be blocked in production", guilty.join("\n") +
         "\nmove it to a file — do not add 'unsafe-inline', it is most of the policy");
  } else pass("no page has an inline script the policy would drop");
}

/* ── 2. nothing inline that style-src would drop ───────────────────────────
   A style="…" attribute is silently ignored under style-src 'self'. The symptom
   is a layout that is subtly wrong on the live site and right everywhere else,
   which is a genuinely horrible thing to debug. */
{
  const guilty = [];
  for (const p of PAGES) {
    if (!existsSync(p)) continue;
    const html = readFileSync(p, "utf8");
    for (const m of html.matchAll(/\sstyle=["'][^"']*["']/gi)) {
      guilty.push(`${p} — ${m[0].trim().slice(0, 60)}`);
    }
    for (const m of html.matchAll(/\son[a-z]+=["'][^"']*["']/gi)) {
      guilty.push(`${p} — inline handler ${m[0].trim().slice(0, 40)}`);
    }
  }
  const styleInline = (policy["style-src"] || []).includes("'unsafe-inline'");
  if (guilty.length && !styleInline) {
    fail("an inline style or event handler would be dropped in production", guilty.join("\n") +
         "\nstyle attributes need 'unsafe-inline'; setProperty from JS does not");
  } else pass("no page has an inline style attribute or event handler");
}

/* ── 3. every origin the site references is allowed ────────────────────────
   Catches the font regression from a different direction: a Google Fonts <link>
   added back would be blocked by style-src rather than merely shifting the
   layout. Also catches a CDN slipping into the admin page. */
{
  const allowed = new Set(Object.values(policy).flat());
  const offenders = [];
  const files = [...PAGES, "styles.css"].filter(existsSync);

  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const origin = `https://${m[1]}`;
      /* Only references the browser actually fetches matter. A URL inside a
         comment, or one the site merely links to, is not a subresource. */
      const context = text.slice(Math.max(0, m.index - 90), m.index);
      const fetched = /(src|href)\s*=\s*["']?$|url\(\s*["']?$/i.test(context);
      const isStylesheet = /rel=["']?stylesheet/i.test(context);
      if (!fetched && !isStylesheet) continue;
      /* An <a href> is a navigation, not a subresource — the delivery links
         are exactly this and no directive covers them. */
      if (/<a\b[^>]*$/i.test(context)) continue;
      if (allowed.has(origin)) continue;
      offenders.push(`${f} → ${origin}`);
    }
  }
  if (offenders.length) {
    fail("the site fetches from an origin the policy does not allow",
         [...new Set(offenders)].join("\n") +
         "\neither self-host it, or add the origin deliberately to _headers");
  } else pass("every origin the site fetches from is in the policy");
}

/* ── 4. connect-src matches config.js ──────────────────────────────────────
   The quiet one. A mismatch here does not error — data.js falls back to the
   seeds and the site looks completely fine while showing content that stopped
   updating. */
{
  const connect = policy["connect-src"] || [];
  const cfg = existsSync("config.js") ? readFileSync("config.js", "utf8") : "";
  const url = (/url\s*:\s*["'](https:\/\/[^"']+)["']/.exec(cfg) || [])[1];

  if (!url) {
    fail("config.js has no https url", "data.js needs one, and connect-src has to match it");
  } else if (!connect.includes(url.replace(/\/$/, ""))) {
    fail("connect-src does not allow the project config.js points at",
         `config.js:   ${url}\nconnect-src: ${connect.join(" ")}\n` +
         "the site will not error — it will silently serve seed data forever");
  } else pass("connect-src allows exactly the project config.js points at");
}

/* ── 5. the font data: URIs stay loadable ─────────────────────────────────
   font-src without data: puts the site back in Georgia and the nav back to
   shifting on every navigation. See the ⛔ section at the top of memory.md. */
{
  const fontSrc = policy["font-src"] || policy["default-src"] || [];
  const inlined = existsSync("styles.css") &&
    /url\(data:font\/woff2/.test(readFileSync("styles.css", "utf8"));
  if (inlined && !fontSrc.includes("data:")) {
    fail("font-src does not allow data:, but the critical faces are inlined",
         "the pages would render in the fallback and the nav would shift again");
  } else pass("the inlined faces are loadable under font-src");
}

/* ── 6. the admin page is not indexable ───────────────────────────────────── */
{
  const robots = existsSync("robots.txt") ? readFileSync("robots.txt", "utf8") : "";
  if (!/Disallow:\s*\/admin\.html/i.test(robots)) {
    fail("robots.txt does not exclude admin.html",
         "not a security control — auth and RLS are — but a client's login form " +
         "in search results invites attention for no benefit");
  } else pass("robots.txt keeps the editor out of search results");
}

console.log(failures
  ? `\n${failures} problem(s) — the policy would break the site, or is not covering it`
  : "\nthe policy covers the site and blocks nothing the site needs");
process.exit(failures ? 1 : 0);
