import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

function boot(src) {
  const dom = new JSDOM(readFileSync("index.html", "utf8"), { runScripts: "dangerously" });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const errs = [];
  window.console.error = (...a) => errs.push(a.join(" "));
  for (const f of ["data/seed-copy.js", "data/seed-settings.js", "data/seed-hours.js", "render.js"]) {
    const s = window.document.createElement("script");
    s.textContent = readFileSync(f, "utf8");
    window.document.body.appendChild(s);
  }
  const s = window.document.createElement("script");
  s.textContent = src;
  window.document.body.appendChild(s);
  return { doc: window.document, errs };
}

const clean = readFileSync("script.js", "utf8");
const broken = clean.replace('boot("hours", function () {',
                             'boot("hours", function () { throw new Error("boom");');
if (broken === clean) throw new Error("could not break the hours block");

for (const [label, src] of [["healthy", clean], ["hours throws", broken]]) {
  const { doc, errs } = boot(src);
  console.log(label.padEnd(14),
    "| toTop wired:", !!doc.getElementById("toTop"),
    "| year:", JSON.stringify(doc.getElementById("year")?.textContent),
    "| errors:", JSON.stringify(errs));
}
