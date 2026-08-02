/* When the owner changes the hours, does the whole page change?
   node tools/test-hours-live.mjs

   Phase 7, the Hours rows. The café's opening times appear in five places on
   the site, written by two different files for two different reasons:

     1. the open/closed pill        script.js  — it has to know the time
     2. the Visit table             render.js
     3. the footer prose            render.js
     4. the mobile-menu prose       render.js
     5. the Google listing (JSON-LD) render.js

   tools/test-hours.mjs already covers the *shapes*: run grouping, the boundary
   minutes, a closed day, the rollover to the next open day. It does it by
   injecting one week as `SEED_HOURS` and rendering — which means render.js and
   script.js are handed the same array by construction, and can never be caught
   disagreeing.

   That is the gap this fills. From Phase 4 the hours come from the database,
   and the seed file is only the fallback. So the interesting week is the one
   where the two differ: the rows say one thing, data/seed-hours.js says
   another, and every one of the five consumers has to follow the rows.

   Anything that still reads the seed file after the network has answered is
   showing a visitor last month's hours next to this month's, on the same
   screen, with no error anywhere. That is the failure this harness exists for,
   and it is the one it found. */

import { boot, settle, seedEnv, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, fail, pass, check } = reporter();

const at = (h, m = 0) => h * 60 + m;
const clock = (mins) => {
  const h = Math.floor(mins / 60), mm = mins % 60;
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${suffix}`;
};

/* Every place the hours are printed, read back off a rendered page. */
function consumers(doc) {
  const text = (sel) => {
    const n = doc.querySelector(sel);
    return n ? n.textContent.replace(/\s+/g, " ").trim() : null;
  };
  let ld = null;
  const script = doc.querySelector('script[type="application/ld+json"]');
  if (script) {
    try {
      const data = JSON.parse(script.textContent);
      const target = data.openingHoursSpecification ? data
        : (data.isPartOf && data.isPartOf.openingHoursSpecification) ? data.isPartOf : null;
      ld = target ? target.openingHoursSpecification : null;
    } catch (e) { ld = "unparseable"; }
  }
  return {
    pill: text("#hoursStatus"),
    table: [...doc.querySelectorAll("#hoursList .hours__line")]
      .map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    footer: text('[data-hours="footer"]'),
    mobile: text(".mmenu__hours"),
    ld
  };
}

/* Is a time-of-day printed anywhere in this string? Deliberately loose about
   formatting — the five consumers format differently on purpose (the table
   writes "8:00 am", the mobile prose writes it tighter) and this harness is
   asking which *hours* are shown, not how they are punctuated. */
const shows = (s, mins) => {
  if (!s) return false;
  const h = Math.floor(mins / 60), mm = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h >= 12 ? "pm" : "am";
  const forms = [
    `${h12}:${String(mm).padStart(2, "0")}`,
    ...(mm === 0 ? [`${h12}${suffix}`, `${h12} ${suffix}`] : [])
  ];
  return forms.some((f) => s.includes(f));
};

console.log("\nthe hours, changed in the database and not in the seed file\n");

/* ── the week the owner just saved ────────────────────────────────────────
   Chosen so that no time in it appears in data/seed-hours.js. If the new
   closing time happened to match the old one, a consumer that never updated
   would pass by coincidence — and a coincidence is the one thing a harness
   cannot tell apart from correctness.

   Wednesday is the frozen day (see page-boot.mjs), so Wednesday is the day the
   pill will be talking about. */
const WEEK = [
  { opens: at(9, 15), closes: at(19, 45) },   // Sun
  { closed: true },                            // Mon — closed, which the seed is not
  { opens: at(7, 45), closes: at(21, 15) },   // Tue
  { opens: at(7, 45), closes: at(21, 15) },   // Wed  ← today
  { opens: at(7, 45), closes: at(21, 15) },   // Thu
  { opens: at(7, 45), closes: at(23, 30) },   // Fri
  { opens: at(9, 15), closes: at(23, 30) }    // Sat
];
const TODAY = WEEK[3];

/* The check that the fixture is worth running. If the seed already said any of
   this, "the page shows the new hours" is not evidence of anything. */
{
  const seedTimes = new Set();
  seedEnv.SEED_HOURS.forEach((d) => {
    if (!d.closed) { seedTimes.add(d.opens); seedTimes.add(d.closes); }
  });
  const overlap = [...new Set(WEEK.filter((d) => !d.closed)
    .flatMap((d) => [d.opens, d.closes]))].filter((t) => seedTimes.has(t));
  check("no time in the new week is also in data/seed-hours.js", overlap, []);
}

const page = () => boot("index.html", { fetcher: serve(seedRows({ hours: WEEK })) });

/* ══ 1. all five consumers, together ═════════════════════════════════════ */
{
  console.log("all five places the hours are printed");
  const p = page();
  await settle();
  const c = consumers(p.doc);

  check("nothing threw", p.thrown, []);
  check("no render step reported a failure", p.errors, []);

  /* 2–5 first: these are render.js's, and they are the ones that work. */
  check("the Visit table shows the new closing time",
        c.table.some((l) => shows(l, TODAY.closes)), true);
  check("the Visit table shows Monday closed",
        c.table.some((l) => /Mon/.test(l) && /closed/i.test(l)), true);
  check("the footer prose shows the new closing time", shows(c.footer, TODAY.closes), true);
  check("the mobile menu prose shows the new closing time", shows(c.mobile, TODAY.closes), true);

  check("the Google listing is still valid JSON", c.ld === "unparseable", false);
  if (Array.isArray(c.ld)) {
    const wed = c.ld.find((s) => [].concat(s.dayOfWeek).includes("Wednesday"));
    check("the Google listing has Wednesday", !!wed, true);
    if (wed) check("and Wednesday closes at the new time", wed.closes, "21:15");
    check("the Google listing does not claim Monday is open",
          c.ld.some((s) => [].concat(s.dayOfWeek).includes("Monday")), false);
  } else {
    fail("the Google listing has no opening hours block", JSON.stringify(c.ld));
  }

  /* 1 last, because it is the one that fails, and it is worth seeing it fail
     next to four that do not. */
  check("the open/closed pill shows the new closing time", shows(c.pill, TODAY.closes), true);
  if (!shows(c.pill, TODAY.closes)) {
    const seedToday = seedEnv.SEED_HOURS[3];
    if (seedToday && !seedToday.closed && shows(c.pill, seedToday.closes)) {
      fail("the pill is showing the hours from data/seed-hours.js",
           `pill:  ${JSON.stringify(c.pill)}\n` +
           `table: ${JSON.stringify(c.table.find((l) => /Wed/.test(l)) || c.table[0])}\n` +
           `The pill is written by script.js, which reads SEED_HOURS directly and\n` +
           `is never told the network answered. A visitor sees last month's hours\n` +
           `in the pill and this month's in the table below it, at the same time.`);
    }
  }
}

/* ══ 2. the boundary minutes, against hours that came from the database ══
   test-hours.mjs already covers these against SEED_HOURS. They are asked again
   here because the pill reading the *live* hours is a different code path from
   the pill reading the seed, and a boundary is exactly where a fallback to the
   wrong week is least visible: 7:44 and 7:45 look equally plausible.

   The closing minute is the one worth stating: the rule is
   `>= opens && < closes`, so the minute the café closes reads as closed. */
{
  console.log("\nthe boundary minutes, with the hours coming from the database");
  const cases = [
    ["one minute before opening", "2026-08-05T07:44", `Closed · opens ${clock(TODAY.opens)}`],
    ["the opening minute",        "2026-08-05T07:45", `Open now · until ${clock(TODAY.closes)}`],
    ["mid-afternoon",             "2026-08-05T15:30", `Open now · until ${clock(TODAY.closes)}`],
    ["the last hour",             "2026-08-05T20:30", `Closing at ${clock(TODAY.closes)}`],
    ["the closing minute",        "2026-08-05T21:15", `Closed · opens ${clock(WEEK[4].opens)} tomorrow`],
    ["after closing",             "2026-08-05T22:00", `Closed · opens ${clock(WEEK[4].opens)} tomorrow`]
  ];
  for (const [what, now, want] of cases) {
    const p = boot("index.html", { now, fetcher: serve(seedRows({ hours: WEEK })) });
    await settle();
    check(what, consumers(p.doc).pill, want);
  }
}

/* ══ 3. a closed day, and the rollover across it ═════════════════════════
   Monday is shut in this week. Sunday evening the pill must not promise
   Monday — it has to walk forward to Tuesday. This is the case the markup this
   replaced could not express at all, and the reason nextOpening() walks rather
   than assuming tomorrow. */
{
  console.log("\nSunday night, with Monday closed");
  const p = boot("index.html", {
    now: "2026-08-09T20:00",                       // Sunday, after the 7:45pm close
    fetcher: serve(seedRows({ hours: WEEK }))
  });
  await settle();
  const c = consumers(p.doc);

  check("the pill skips Monday and names Tuesday",
        c.pill, `Closed · opens ${clock(WEEK[2].opens)} Tue`);
  check("it does not say tomorrow", /tomorrow/.test(c.pill || ""), false);
  check("the Visit table still lists Monday as closed",
        c.table.some((l) => /Mon/.test(l) && /closed/i.test(l)), true);
}

/* ══ 4. a different opening time on every day ════════════════════════════
   memory.md's checklist calls this out as something "today's model hardcodes"
   — which was true of the markup this replaced, and is worth confirming is no
   longer true of the data. Seven distinct opening times, so no two days can be
   grouped into a run, and the table must show seven lines rather than a
   collapsed range that has quietly averaged them. */
{
  console.log("\na different opening time every day of the week");
  const SEVEN = [
    { opens: at(8, 0),  closes: at(20, 0) },
    { opens: at(8, 15), closes: at(20, 0) },
    { opens: at(8, 30), closes: at(20, 0) },
    { opens: at(8, 45), closes: at(20, 0) },
    { opens: at(9, 0),  closes: at(20, 0) },
    { opens: at(9, 15), closes: at(20, 0) },
    { opens: at(9, 30), closes: at(20, 0) }
  ];
  const p = boot("index.html", { fetcher: serve(seedRows({ hours: SEVEN })) });
  await settle();
  const c = consumers(p.doc);

  check("nothing threw", p.thrown, []);
  check("the Visit table has seven lines, one per day", c.table.length, 7);
  check("every opening time appears in the table",
        SEVEN.map((d) => c.table.some((l) => shows(l, d.opens))), SEVEN.map(() => true));
  check("the footer prose has seven lines too",
        (p.doc.querySelector('[data-hours="footer"]').querySelectorAll("br").length), 6);
  check("the Google listing has seven entries", Array.isArray(c.ld) ? c.ld.length : c.ld, 7);
  check("and Wednesday's opening time is Wednesday's",
        (Array.isArray(c.ld) ? c.ld.find((s) => [].concat(s.dayOfWeek).includes("Wednesday")) : {}).opens,
        "08:45");
}

console.log(state.failures
  ? `\n${state.failures} problem(s) — the five consumers do not all follow the database`
  : "\nevery place the hours are printed follows the database, not the seed file");
process.exit(state.failures ? 1 : 0);
