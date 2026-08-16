/* Can check-fonts.mjs actually fail?
   node tools/test-fonts.mjs

   check-fonts.mjs passed all six rules the first time it ran, against a setup
   written the same hour. So does a checker whose rules match nothing. Each of
   the four ways this has really broken is put back here on a copy, and the
   checker has to catch it *and say which rule fired*.

   Nothing is written to the real files: the copies go to a temp directory and
   the checker is pointed at it. */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FILES = ["styles.css", "index.html", "menu-food.html",
               "menu-drinks.html", "menu-wine.html"];

let failures = 0;

function run(mutate, what, expect) {
  const dir = mkdtempSync(join(tmpdir(), "aromati-fonts-"));
  try {
    for (const f of FILES) cpSync(f, join(dir, f));
    cpSync("tools/check-fonts.mjs", join(dir, "check-fonts.mjs"));

    const before = readFileSync(join(dir, "styles.css"), "utf8");
    mutate(dir);
    const after = readFileSync(join(dir, "styles.css"), "utf8");

    /* A mutation that changed nothing would pass for the wrong reason. This
       guard has already earned its place once, on a different harness. */
    const pageChanged = FILES.slice(1).some(
      (f) => readFileSync(join(dir, f), "utf8") !== readFileSync(f, "utf8")
    );
    if (before === after && !pageChanged) {
      failures++;
      console.log(`  FAIL ${what}`);
      console.log("         the mutation changed nothing — has the setup been reworded?");
      return;
    }

    let out = "";
    try {
      out = execFileSync(process.execPath, ["check-fonts.mjs"], { cwd: dir, encoding: "utf8" });
      failures++;
      console.log(`  FAIL ${what}`);
      console.log("         the checker passed a setup that is broken");
      return;
    } catch (err) {
      out = (err.stdout || "") + (err.stderr || "");
    }

    const named = out.split("\n").some((l) => l.startsWith("  FAIL") && l.includes(expect));
    if (!named) {
      failures++;
      console.log(`  FAIL ${what}`);
      console.log(`         it failed, but not for "${expect}":`);
      console.log(out.split("\n").filter((l) => l.includes("FAIL")).map((l) => "         " + l).join("\n"));
      return;
    }
    console.log(`  ok   ${what}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\nputting each real break back\n");

/* 1 — the original: fonts fetched from Google. */
run((dir) => {
  const p = join(dir, "menu-food.html");
  writeFileSync(p, readFileSync(p, "utf8").replace(
    "</head>",
    '<link href="https://fonts.googleapis.com/css2?family=Fraunces&display=swap" rel="stylesheet" /></head>'
  ));
}, "a page put back on Google Fonts", "loads fonts from Google");

/* 2 — the ch measure that moved the masthead seam 31.5px. */
run((dir) => {
  const p = join(dir, "styles.css");
  writeFileSync(p, readFileSync(p, "utf8").replace("max-width:34.45em;", "max-width:58ch;"));
}, "the masthead lede measured in ch again", "ch measure is used above the fold");

/* 3 — an inlined face un-inlined, so it is fetched after the first paint. */
run((dir) => {
  const p = join(dir, "styles.css");
  const css = readFileSync(p, "utf8");
  const i = css.indexOf("url(data:font/woff2;base64,");
  const end = css.indexOf(")", i);
  writeFileSync(p, css.slice(0, i) + "url(assets/fonts/fraunces-roman-latin.woff2)" + css.slice(end + 1));
}, "a critical face un-inlined", "has to be inlined is not");

/* 4 — font-display put back on an inlined face, which commits to the fallback. */
run((dir) => {
  const p = join(dir, "styles.css");
  const css = readFileSync(p, "utf8");
  const i = css.indexOf("url(data:font/woff2;base64,");
  const lineStart = css.lastIndexOf("\n", i);
  writeFileSync(p, css.slice(0, lineStart) + "\n  font-display: optional;" + css.slice(lineStart));
}, "font-display put back on an inlined face", "inlined face carries font-display");

/* 5 — a linked face allowed to swap. */
run((dir) => {
  const p = join(dir, "styles.css");
  writeFileSync(p, readFileSync(p, "utf8").replace("font-display: optional;", "font-display: swap;"));
}, "a linked face allowed to swap", "can still swap");

console.log(failures
  ? `\n${failures} case(s) the checker would have let through`
  : "\nevery break this has really had is caught, and named");
process.exit(failures ? 1 : 0);
