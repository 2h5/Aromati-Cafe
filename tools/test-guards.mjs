/* Block isolation — does a failure stay inside the block that caused it?
   node tools/test-guards.mjs

   script.js is one closure. Before boot(), an exception anywhere killed every
   block declared after it, and the symptom was never the block that broke: a
   bad hours value took out the back-to-top button and the footer year, and the
   page just quietly did less than it should.

   The test is the only honest one available — break a block on purpose and
   check the last statement in the file still ran. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let failures = 0;

function check(what, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

/* index.html with the real seed data and the real renderer, then whatever
   version of script.js the caller hands over. */
function boot(scriptSrc) {
  const dom = new JSDOM(readFileSync("index.html", "utf8"), { runScripts: "dangerously" });
  const { window } = dom;

  /* Reduced motion is the honest stub: a real code path the site supports,
     and it keeps Lenis and the choreography out of a test about error
     handling. jsdom has none of these three. */
  window.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

  const errors = [];
  window.console.error = (...a) => errors.push(a.join(" "));

  const inject = (code) => {
    const s = window.document.createElement("script");
    s.textContent = code;
    window.document.body.appendChild(s);
  };
  for (const f of ["data/seed-copy.js", "data/seed-settings.js", "data/seed-hours.js", "render.js"]) {
    inject(readFileSync(f, "utf8"));
  }
  inject(scriptSrc);

  return { doc: window.document, errors, window };
}

const clean = readFileSync("script.js", "utf8");

/* The footer year is the last statement in the whole IIFE, which makes it the
   single best witness: if it ran, everything between the break and the end of
   the file got its turn. */
const yearOf = (r) => r.doc.getElementById("year")?.textContent;

console.log("\nnothing broken");
{
  const r = boot(clean);
  check("no errors logged", r.errors.join(" | "), "");
  check("the file ran to the end", yearOf(r), String(new Date().getFullYear()));
}

console.log("\none block throws");
{
  /* The hours block sits near the end and has real blocks after it, so it is
     the case that used to hurt. */
  const broken = clean.replace('boot("hours", function () {',
                               'boot("hours", function () { throw new Error("boom");');
  if (broken === clean) throw new Error("could not break the hours block — has boot() been renamed?");

  const r = boot(broken);
  check("the failure is reported", r.errors.join(" | "), "script: hours failed Error: boom");
  check("and names the block", r.errors[0].includes("hours"), true);
  check("the file still ran to the end", yearOf(r), String(new Date().getFullYear()));
}

console.log("\nevery guarded block is isolated, not just the hours");
{
  const names = [...clean.matchAll(/boot\("([^"]+)"/g)].map((m) => m[1]);
  /* A count, not a floor, and deliberately so: a new boot() block should make
     this fail once and be looked at, rather than quietly joining the set. The
     eighth is "menu replay" (Phase 4) — it runs from an event, so unlike the
     other seven it is never reached during a normal load. */
  check("all eight are wrapped", names.length, 8);

  const survived = [];
  for (const name of names) {
    const broken = clean.replace(`boot("${name}", function () {`,
                                 `boot("${name}", function () { throw new Error("boom");`);
    const r = boot(broken);
    if (yearOf(r) === String(new Date().getFullYear())) survived.push(name);
  }
  check("breaking any one still reaches the end", survived.join(","), names.join(","));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall guard checks passed");

/* jsdom leaves timers and observers running, so the process would otherwise
   hang here with every check already reported. */
process.exit(failures ? 1 : 0);
