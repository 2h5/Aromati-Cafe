/* The delivery links — what happens when a service is dropped, and what
   happens when the URL is not a URL.
   node tools/test-ordering.mjs

   Two behaviours worth pinning down, neither of them visible by reading:

   1. Emptying an ordering link is how the owner leaves a service. The link has
      to disappear, and the row around it has to disappear when nothing is left
      in it — an "Order delivery" label with no services under it is a bug the
      owner would have no way to explain.

   2. An href is a code sink. "javascript:…" in that field would run on click,
      and from Phase 4 the value comes from a database an owner types into.
      The database refuses to store one and render.js refuses to render one;
      this tests the half that runs in the browser, because the other half is
      SQL that has never executed. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let failures = 0;
const check = (what, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
};

/* The real markup from the real page, so a change to the block's shape shows
   up here rather than being quietly missed. */
const PAGE = readFileSync("index.html", "utf8");

function render(orderingLinks) {
  const dom = new JSDOM(PAGE, { runScripts: "dangerously" });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

  const run = (code) => {
    const s = window.document.createElement("script");
    s.textContent = code;
    window.document.body.appendChild(s);
  };

  /* Only the settings are swapped; everything else is the file on disk. */
  const settings = readFileSync("data/seed-settings.js", "utf8");
  run(settings);
  run(`SEED_SETTINGS.orderingLinks = ${JSON.stringify(orderingLinks)};`);
  run(readFileSync("render.js", "utf8"));

  const doc = window.document;
  return {
    links: [...doc.querySelectorAll("[data-order]")].map((a) => ({
      service: a.getAttribute("data-order"),
      href: a.getAttribute("href")
    })),
    groups: doc.querySelectorAll("[data-order-group]").length,
    sameAs: JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent).sameAs
  };
}

const DD = "https://www.doordash.com/store/x-1/2/";
const GH = "https://www.grubhub.com/restaurant/x/3";

console.log("\nboth services listed");
{
  const r = render({ doordash: DD, grubhub: GH });
  check("both links kept", r.links, [
    { service: "doordash", href: DD },
    { service: "grubhub", href: GH }
  ]);
  check("the row stays", r.groups, 1);
  check("both are in the search listing", r.sameAs.slice(1), [DD, GH]);
}

console.log("\none service dropped — its URL cleared");
{
  const r = render({ doordash: DD, grubhub: "" });
  check("only the remaining link is on the page", r.links, [{ service: "doordash", href: DD }]);
  check("the row stays, because something is still in it", r.groups, 1);
  check("the dropped one leaves the search listing too", r.sameAs.slice(1), [DD]);
}

console.log("\nboth dropped");
{
  const r = render({ doordash: "", grubhub: "" });
  check("no links", r.links, []);
  check("the row goes with them", r.groups, 0);
  check("nothing left in the search listing but Instagram", r.sameAs.length, 1);
}

console.log("\na URL that is not a URL");
for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "  javascript:alert(1)",
                   "data:text/html,<script>x</script>", "http://insecure.example.com/x"]) {
  const r = render({ doordash: bad, grubhub: GH });
  check(`refused: ${JSON.stringify(bad)}`, r.links, [{ service: "grubhub", href: GH }]);
  check("  and kept out of the search listing", r.sameAs.includes(bad), false);
}

console.log(failures ? `\n${failures} ordering check(s) failed` : "\nall ordering checks passed");
process.exit(failures ? 1 : 0);
