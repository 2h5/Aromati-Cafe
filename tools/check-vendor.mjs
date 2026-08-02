/* Is the vendored SDK still the published one?
   node tools/check-vendor.mjs            check
   node tools/check-vendor.mjs --update   re-copy from node_modules and rewrite
                                          the digest in vendor/README.md

   vendor/supabase.js is the only third-party script in the project, and it is
   loaded by the only page that holds the owner's session token. Checking it in
   rather than pointing at a CDN is what stops someone else's server being able
   to change that page whenever it likes — see vendor/README.md.

   The failure that invites is quiet: a file copied by hand once, patched by
   hand later to work around something, and thereafter neither the published
   artifact nor anything anybody would think to audit. Nothing about the page
   would look different.

   So three facts are checked against each other, and no two of them live in the
   same place:

     1. the bytes of vendor/supabase.js
     2. the sha256 recorded in vendor/README.md
     3. the version in package.json, and the copy in node_modules that it
        resolves to

   Any one of them can be changed by hand. Changing one alone is caught.

   node_modules is allowed to be missing — a checkout that has not run
   `npm install` can still verify (1) against (2), which is the half that
   matters to what actually ships. Everything else here degrades to a skip
   rather than a failure, because a check that cannot run is not a check that
   found something. */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const VENDORED = "vendor/supabase.js";
const README = "vendor/README.md";
const INSTALLED = "node_modules/@supabase/supabase-js/dist/umd/supabase.js";
const PKG_JSON = "node_modules/@supabase/supabase-js/package.json";

const update = process.argv.includes("--update");

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);
const skip = (msg) => console.log(`  skip ${msg}`);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

console.log("\nthe vendored SDK against the package it was copied from\n");

/* ── --update: do the copy, then fall through and verify it ───────────────── */
if (update) {
  if (!existsSync(INSTALLED)) {
    console.log(`  cannot update — ${INSTALLED} is not there. npm install first.\n`);
    process.exit(1);
  }
  const bytes = readFileSync(INSTALLED);
  const version = JSON.parse(readFileSync(PKG_JSON, "utf8")).version;
  writeFileSync(VENDORED, bytes);

  let readme = readFileSync(README, "utf8");
  readme = readme
    .replace(/(\| `supabase\.js` \| `@supabase\/supabase-js` \| )[^|]*( \| `)[0-9a-f]{64}(`)/,
             `$1${version}$2${sha(bytes)}$3`);
  writeFileSync(README, readme);
  console.log(`  updated vendor/supabase.js to ${version} and rewrote the digest\n`);
}

/* ── 1. the file exists and matches the digest that was written down ──────── */
if (!existsSync(VENDORED)) {
  fail(`${VENDORED} is missing`, "admin.html loads it; without it the editor does not open");
  console.log("\n1 problem\n");
  process.exit(1);
}

const bytes = readFileSync(VENDORED);
const digest = sha(bytes);
const readme = existsSync(README) ? readFileSync(README, "utf8") : "";

const recorded = (/\|\s*`supabase\.js`\s*\|[^|]*\|\s*([^|]*?)\s*\|\s*`([0-9a-f]{64})`/.exec(readme) || []);
const recordedVersion = recorded[1];
const recordedDigest = recorded[2];

if (!recordedDigest) {
  fail("vendor/README.md records no sha256 for supabase.js",
       "the table row is the independent record — without it this file checks itself");
} else if (recordedDigest !== digest) {
  fail("vendor/supabase.js is not the file vendor/README.md describes",
       `on disk:   ${digest}\nrecorded:  ${recordedDigest}\n` +
       "Either the file was edited — which it must not be — or it was refreshed\n" +
       "without running `node tools/check-vendor.mjs --update`.");
} else {
  pass(`vendor/supabase.js matches the digest recorded for it (${recordedVersion})`);
}

/* ── 2. and it is byte-identical to the installed package ─────────────────── */
if (!existsSync(INSTALLED)) {
  skip("node_modules has no @supabase/supabase-js — cannot compare against the package");
} else {
  const installed = readFileSync(INSTALLED);
  if (Buffer.compare(bytes, installed) !== 0) {
    fail("the vendored file and the installed package have drifted apart",
         `vendor:       ${digest}\nnode_modules: ${sha(installed)}\n` +
         "This is what a hand-patched vendor file looks like. If the package was\n" +
         "upgraded deliberately, run `node tools/check-vendor.mjs --update`.");
  } else {
    pass("vendor/supabase.js is byte-identical to the installed package");
  }

  /* ── 3. …at the version everything else claims ──────────────────────────── */
  const installedVersion = JSON.parse(readFileSync(PKG_JSON, "utf8")).version;
  const declared = (/"@supabase\/supabase-js"\s*:\s*"[^0-9]*([0-9][^"]*)"/
    .exec(readFileSync("package.json", "utf8")) || [])[1];

  if (declared && declared !== installedVersion) {
    fail("package.json asks for a different version than is installed",
         `package.json: ${declared}\ninstalled:    ${installedVersion}`);
  } else if (recordedVersion && recordedVersion !== installedVersion) {
    fail("vendor/README.md names a different version than is installed",
         `README:    ${recordedVersion}\ninstalled: ${installedVersion}\n` +
         "The digest may still match, which would mean the version was edited by hand.");
  } else {
    pass(`package.json, node_modules and vendor/README.md all say ${installedVersion}`);
  }
}

/* ── 4. nobody has quietly added a second vendored script ─────────────────── */
{
  const html = existsSync("admin.html") ? readFileSync("admin.html", "utf8") : "";
  const remote = [...html.matchAll(/<script[^>]*\bsrc=["']((?:https?:)?\/\/[^"']+)["']/gi)].map((m) => m[1]);
  if (remote.length) {
    fail("admin.html loads a script from another origin",
         remote.join("\n") + "\nCSP would block it, and vendoring exists so it never has to.");
  } else {
    pass("admin.html loads no script from another origin");
  }
}

console.log(failures
  ? `\n${failures} problem(s) — the vendored SDK is not what the repository says it is`
  : "\nthe vendored SDK is the published artifact, at the version recorded for it");
process.exit(failures ? 1 : 0);
