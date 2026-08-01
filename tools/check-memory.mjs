/* Is memory.md still true?
   node tools/check-memory.mjs

   memory.md is the project's plan, decision log and status board, and it is the
   first thing read at the start of a session. That makes a wrong line in it
   more expensive than a wrong line in a comment: it is trusted, and it is
   trusted when nobody has the context to notice.

   It rots quietly and in a small number of predictable ways. This checks the
   ones a machine can check, so the ten-minute manual audit is only needed for
   the things that need judgement — whether the *status* is honest, whether a
   decision still holds.

   What it cannot check: whether what the file says is true. A phase marked done
   that isn't, a decision quietly reversed in code — those need a person. This
   only proves the file still points at things that exist.                    */

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DOC = "memory.md";
const text = readFileSync(DOC, "utf8");
const lines = text.split(/\r?\n/);

/* Tools that exist to be pointed at, not run — no reason to name them in the
   plan, and naming them would invite someone to run them. */
const NOT_EXPECTED_IN_DOC = new Set([]);

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(detail.split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

console.log(`\nauditing ${DOC} (${lines.length} lines)\n`);

/* ── 1. every path it names still exists ───────────────────────────────── */
{
  const cited = new Set();
  for (const m of text.matchAll(/`((?:tools|data|supabase|assets)\/[\w./-]+)`/g)) cited.add(m[1]);
  for (const m of text.matchAll(/\]\(((?:tools|data|supabase)\/[\w./-]+)\)/g))     cited.add(m[1]);

  const missing = [...cited].filter((p) => !existsSync(p.replace(/\/$/, "")));
  if (missing.length) fail("a path it names does not exist", missing.join("\n"));
  else pass(`all ${cited.size} paths it names exist`);
}

/* ── 2. every line-number link still points at what it claims ──────────────
   The links are file.js:NN with a #LNN anchor. They cannot be validated for
   meaning, but a link past the end of the file is definitely wrong, and so is
   one pointing at a blank line. */
{
  const bad = [];
  for (const m of text.matchAll(/\[([\w.-]+):(\d+)(?:–\d+)?\]\(([\w.-]+)#L(\d+)\)/g)) {
    const [, shownFile, shownLine, linkFile, linkLine] = m;
    if (shownFile !== linkFile || shownLine !== linkLine) {
      bad.push(`${shownFile}:${shownLine} links to ${linkFile}#L${linkLine} — they disagree`);
      continue;
    }
    if (!existsSync(linkFile)) { bad.push(`${linkFile} does not exist`); continue; }

    const target = readFileSync(linkFile, "utf8").split(/\r?\n/);
    const n = Number(linkLine);
    if (n > target.length) bad.push(`${linkFile}:${n} is past the end of the file (${target.length} lines)`);
    else if (!target[n - 1].trim()) bad.push(`${linkFile}:${n} is a blank line`);
  }
  if (bad.length) fail("a line-number link has drifted", bad.join("\n"));
  else pass("every file:line link lands on a real, non-blank line");
}

/* ── 3. every tool is mentioned ────────────────────────────────────────────
   A tool nobody wrote down is a tool the next person rewrites. */
{
  const tools = readdirSync("tools").filter((f) => f.endsWith(".mjs"));
  const unmentioned = tools.filter((f) => !NOT_EXPECTED_IN_DOC.has(f) && !text.includes(f));
  if (unmentioned.length) fail("a tool exists that memory.md never mentions", unmentioned.join("\n"));
  else pass(`all ${tools.length} tools in tools/ are mentioned`);
}

/* ── 4. every migration is mentioned ───────────────────────────────────── */
{
  const dir = "supabase/migrations";
  if (existsSync(dir)) {
    const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql"));
    const unmentioned = migrations.filter((f) => !text.includes(f));
    if (unmentioned.length) fail("a migration memory.md never mentions", unmentioned.join("\n"));
    else pass(`all ${migrations.length} migrations are mentioned`);
  }
}

/* ── 5. no stale "you are here" ────────────────────────────────────────────
   There is exactly one current position, so there is at most one marker. */
{
  const markers = lines
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /you are here|←\s*\*?next\*?/i.test(l));
  if (markers.length > 1) {
    fail("more than one position marker", markers.map(([n, l]) => `${DOC}:${n}  ${l.trim()}`).join("\n"));
  } else if (markers.length === 0) {
    fail("no position marker at all", "nothing in the phase list says what comes next");
  } else {
    pass(`one position marker, at ${DOC}:${markers[0][0]}`);
  }
}

/* ── 6. the npm scripts it describes still exist ───────────────────────── */
{
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const scripts = Object.keys(pkg.scripts || {});
  const claimed = [...text.matchAll(/`npm run ([\w:]+)`/g)].map((m) => m[1]);
  const gone = [...new Set(claimed)].filter((s) => !scripts.includes(s));
  if (gone.length) fail("it names an npm script that no longer exists", gone.join("\n"));
  else pass("every npm script it names exists");

  /* The reverse: a harness added to package.json but never written down. */
  const tests = scripts.filter((s) => s.startsWith("test:") || s.startsWith("check:"));
  const undocumented = tests.filter((s) => !text.includes(s.split(":")[1]));
  if (undocumented.length) fail("a test script memory.md never mentions", undocumented.join("\n"));
  else pass(`all ${tests.length} test scripts are accounted for`);
}

/* ── 7. the Phase 1 baseline it cites is the one the harness uses ──────────
   memory.md named the wrong commit here for a while — the first commit *of*
   the conversion rather than the last one before it. Both exist, both look
   plausible, and the difference is the entire value of the check. */
{
  const tool = readFileSync("tools/verify-phase1.mjs", "utf8");
  const real = tool.match(/PHASE1_BASE\s*\|\|\s*"([0-9a-f]+)"/);
  if (!real) {
    fail("cannot find the baseline in tools/verify-phase1.mjs",
         "the PHASE1_BASE default has been reworded — update this check");
  } else {
    const cited = [...text.matchAll(/`([0-9a-f]{7,40})`/g)].map((m) => m[1]);
    const wrong = cited.filter((c) => !real[1].startsWith(c) && !c.startsWith(real[1]));
    /* Other commits are cited legitimately; only a claim about the baseline is
       checkable, so this looks at the sentence, not the whole file. */
    const claims = [...text.matchAll(/verify-phase1[\s\S]{0,400}?`([0-9a-f]{7,40})`/g)].map((m) => m[1]);
    const bad = claims.filter((c) => wrong.includes(c));
    if (bad.length) {
      fail("it cites the wrong Phase 1 baseline",
           `memory.md says ${bad.join(", ")}, the harness uses ${real[1]}`);
    } else if (!claims.length) {
      fail("it never says which commit Phase 1 is verified against",
           "that commit is the whole meaning of the check");
    } else {
      pass(`the Phase 1 baseline it cites (${real[1]}) is the one the harness uses`);
    }
  }
}

console.log(failures
  ? `\n${failures} thing(s) in ${DOC} have drifted — fix the file, not this check`
  : `\n${DOC} still points at reality`);
process.exit(failures ? 1 : 0);
