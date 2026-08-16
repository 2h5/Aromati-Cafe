/* Section copy — the behaviour, not the round trip.
   node tools/test-copy.mjs

   verify-phase1.mjs proves the 62 fields render back to what the markup said.
   That is the wrong test for everything below: the inline vocabulary, what
   happens to a field the data omits, and the property the whole design exists
   to guarantee — that an owner-typed "<script>" is text and never a script.

   Runs the real render.js against a synthetic page, because the point is the
   inputs the site does not currently contain and will the first time someone
   types into the CMS. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let failures = 0;

function check(what, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

/* One <p data-copy="t"> per case, rendered with the given copy table. Returns
   the element so a test can read textContent, innerHTML or the child nodes —
   which of those you assert on is the whole question here. */
function render(copy, markup = '<p data-copy="t">original</p>') {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, { runScripts: "dangerously" });
  const { window } = dom;
  const s = window.document.createElement("script");
  s.textContent = `var SEED_COPY = ${JSON.stringify(copy)};\n` + readFileSync("render.js", "utf8");
  window.document.body.appendChild(s);
  return window.document.querySelector("[data-copy]");
}

console.log("\nplain text");
{
  check("replaces the markup", render({ t: "Hello" }).textContent, "Hello");
  check("no elements left behind", render({ t: "Hello" }).children.length, 0);
}

console.log("\nline breaks");
{
  const n = render({ t: "Come say hello,\nMurray Hill." });
  check("a <br> per newline", n.querySelectorAll("br").length, 1);
  check("text either side", n.textContent, "Come say hello,Murray Hill.");
  check("the break is between them", n.innerHTML, "Come say hello,<br>Murray Hill.");
  check("two newlines, two breaks", render({ t: "a\nb\nc" }).querySelectorAll("br").length, 2);
}

console.log("\nemphasis");
{
  const n = render({ t: "the word for *aroma*, roughly" });
  check("one <em>", n.querySelectorAll("em").length, 1);
  check("the right word", n.querySelector("em").textContent, "aroma");
  check("the asterisks are gone", n.textContent, "the word for aroma, roughly");

  /* An odd number of asterisks has no pairing, so nothing is emphasised and
     every character survives. A price note reading "*subject to change" must
     not silently lose its asterisk or swallow the rest of the sentence. */
  const odd = render({ t: "*subject to change" });
  check("unmatched * is literal", odd.textContent, "*subject to change");
  check("and emphasises nothing", odd.querySelectorAll("em").length, 0);

  check("* survives a line break",
    render({ t: "*a*\n*b*" }).querySelectorAll("em").length, 2);
}

console.log("\na field the data does not mention keeps its markup");
{
  /* The no-JavaScript story and the Phase 4 story are the same story: the page
     as served is already correct, and the renderer only ever overwrites what it
     has something better to say. */
  check("missing key", render({}).textContent, "original");
  check("empty string is not an edit", render({ t: "" }).textContent, "original");
  check("a non-string is ignored", render({ t: 42 }).textContent, "original");
}

console.log("\nthe rule: owner input is text, never markup");
{
  const n = render({ t: '<script>alert(1)</script>' });
  check("no script element", n.querySelectorAll("script").length, 0);
  check("the tag is the text", n.textContent, '<script>alert(1)</script>');
  check("and it is escaped in the source",
    n.innerHTML, "&lt;script&gt;alert(1)&lt;/script&gt;");

  const img = render({ t: '<img src=x onerror=alert(1)>' });
  check("no image element", img.querySelectorAll("img").length, 0);
  check("the tag is the text", img.textContent, "<img src=x onerror=alert(1)>");

  /* Emphasis is built with createElement, so the * vocabulary cannot be used
     to smuggle an attribute into a real element either. */
  const em = render({ t: '*x" onmouseover="alert(1)*' });
  check("emphasis carries no attributes", em.querySelector("em").attributes.length, 0);
  check("the quotes are text", em.querySelector("em").textContent, 'x" onmouseover="alert(1)');
}

console.log("\nevery data-copy on the real pages has a value");
{
  /* The extractor writes both sides, so this can only fail if someone edits one
     by hand — which is exactly the failure worth catching, because a field with
     no value renders as the stale markup and looks fine. */
  const copy = new JSDOM("").window.eval(
    readFileSync("data/seed-copy.js", "utf8") + ";SEED_COPY");

  const orphans = [];
  for (const page of ["index.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"]) {
    const doc = new JSDOM(readFileSync(page, "utf8")).window.document;
    for (const n of doc.querySelectorAll("[data-copy]")) {
      const k = n.getAttribute("data-copy");
      if (typeof copy[k] !== "string" || !copy[k]) orphans.push(`${page} ${k}`);
    }
  }
  check("no element without a value", orphans.join(", "), "");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall copy checks passed");
process.exit(failures ? 1 : 0);
