/* Stamps the site's public origin everywhere a crawler reads it.
   node tools/apply-site-url.mjs           — rewrite the files to match site.config.mjs
   node tools/apply-site-url.mjs --check   — verify only; exit 1 on any drift

   Why this exists: the HTML carries absolute URLs as plain text — canonical
   links, og:url, og:image, twitter:image, the JSON-LD url — and sitemap.xml
   and robots.txt each carry one more copy. Eighteen strings that must always
   agree. When the custom domain is chosen they all change together, and the
   failure mode of changing seventeen of them is quiet: nothing breaks on the
   page, the wrong origin just keeps being handed to Google.

   The rewrite is deliberately narrow. Each substitution matches one specific
   tag in one specific shape and rewrites only its origin — the rest of the
   tag is left byte-for-byte alone, and a tag that is missing or shaped
   differently is a failure, not a skip. After writing, every file is read
   back and asked the only question that matters: does it now say exactly
   what site.config.mjs says? That is the house rule from vite.config.js —
   a step that cannot prove its own landing has not landed. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { SITE_URL, OG_IMAGE, PUBLIC_PAGES } from "../site.config.mjs";

const CHECK_ONLY = process.argv.includes("--check");
const ORIGIN = SITE_URL.replace(/\/$/, "");
const TODAY = new Date().toISOString().slice(0, 10);

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

console.log(`\nthe public origin, stamped everywhere a crawler reads it\n`);
console.log(`  origin: ${ORIGIN}${CHECK_ONLY ? "  (check only)" : ""}\n`);

/* Each rule: a human name, the tag shape to find, and what the tag should
   say once the origin is right. The pattern must capture everything around
   the URL so the rewrite can put it back untouched. */
function pageRules(path) {
  const pageUrl = ORIGIN + (path === "/" ? "/" : path);
  const imageUrl = `${ORIGIN}/${OG_IMAGE}`;
  return [
    ["canonical", /(<link rel="canonical" href=")https:\/\/[^"]+(" \/>)/, `$1${pageUrl}$2`],
    ["og:url", /(<meta property="og:url" content=")https:\/\/[^"]+(" \/>)/, `$1${pageUrl}$2`],
    ["og:image", /(<meta property="og:image" content=")https:\/\/[^"]+(" \/>)/, `$1${imageUrl}$2`],
    ["twitter:image", /(<meta name="twitter:image" content=")https:\/\/[^"]+(" \/>)/, `$1${imageUrl}$2`]
  ];
}

function applyRule(file, text, [name, pattern, replacement]) {
  const re = new RegExp(pattern.source, "");
  const m = re.exec(text);
  if (!m) return { text, error: `${file}: no ${name} tag to rewrite` };
  const wanted = m[0].replace(re, replacement);
  if (m[0] !== wanted && CHECK_ONLY) {
    const current = /https:\/\/[^"]+/.exec(m[0]);
    return { text, error: `${file}: ${name} says ${current ? current[0] : m[0]}, site.config.mjs says ${ORIGIN}` };
  }
  return { text: m[0] === wanted ? text : text.replace(re, replacement), error: null };
}

/* ── the four public pages ─────────────────────────────────────────────── */
for (const { file, path } of PUBLIC_PAGES) {
  if (!existsSync(file)) { fail(`${file} is missing`); continue; }
  let text = readFileSync(file, "utf8");
  const errors = [];

  for (const rule of pageRules(path)) {
    const out = applyRule(file, text, rule);
    if (out.error) errors.push(out.error);
    text = out.text;
  }

  /* The homepage's JSON-LD also names the origin, twice. */
  if (file === "index.html") {
    for (const [name, pattern, replacement] of [
      ["JSON-LD url", /("@context": "https:\/\/schema\.org"[\s\S]*?"url": ")https:\/\/[^"]+(",)/, `$1${ORIGIN}/$2`],
      ["JSON-LD image", /("image": ")https:\/\/[^"]+(",)/, `$1${ORIGIN}/${OG_IMAGE}$2`]
    ]) {
      const out = applyRule(file, text, [name, pattern, replacement]);
      if (out.error) errors.push(out.error);
      text = out.text;
    }
  }

  if (errors.length) { fail(`${file} could not be rewritten`, errors.join("\n")); continue; }
  if (!CHECK_ONLY) writeFileSync(file, text);
  pass(`${file} — canonical, og:url, og:image, twitter:image${file === "index.html" ? ", JSON-LD" : ""}`);
}

/* ── sitemap.xml — regenerated whole, never patched ────────────────────── */
{
  const body = PUBLIC_PAGES.map(({ path }) =>
    `  <url>\n    <loc>${ORIGIN}${path === "/" ? "/" : path}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </url>`
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  if (!CHECK_ONLY) writeFileSync("sitemap.xml", xml);
  const onDisk = CHECK_ONLY && existsSync("sitemap.xml") ? readFileSync("sitemap.xml", "utf8") : xml;
  const missing = PUBLIC_PAGES.filter(({ path }) =>
    !onDisk.includes(`<loc>${ORIGIN}${path === "/" ? "/" : path}</loc>`));
  if (missing.length) {
    fail("sitemap.xml does not match site.config.mjs", missing.map((p) => p.path).join("\n"));
  } else pass(`sitemap.xml — ${PUBLIC_PAGES.length} public pages, no admin`);
}

/* ── robots.txt — exactly one Sitemap line, pointing here ──────────────── */
{
  const file = "robots.txt";
  if (!existsSync(file)) { fail("robots.txt is missing"); }
  else {
    let text = readFileSync(file, "utf8");
    const wanted = `Sitemap: ${ORIGIN}/sitemap.xml`;
    if (text.includes(wanted)) {
      pass("robots.txt — Sitemap line already right");
    } else if (/^Sitemap:/im.test(text)) {
      const out = text.replace(/^Sitemap:.*$/im, wanted);
      if (!CHECK_ONLY) writeFileSync(file, out);
      pass("robots.txt — Sitemap line updated");
    } else {
      const sep = text.endsWith("\n") ? "" : "\n";
      if (!CHECK_ONLY) writeFileSync(file, `${text}${sep}\n${wanted}\n`);
      pass("robots.txt — Sitemap line added");
    }
    if (CHECK_ONLY && !readFileSync(file, "utf8").includes(wanted)) {
      fail("robots.txt Sitemap line does not match site.config.mjs", `wanted: ${wanted}`);
    }
  }
}

console.log(failures
  ? `\n${failures} problem(s) — the tree and site.config.mjs do not agree`
  : `\neverything a crawler reads points at ${ORIGIN}`);
process.exit(failures ? 1 : 0);
