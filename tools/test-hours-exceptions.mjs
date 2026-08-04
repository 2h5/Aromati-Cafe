/* One-off dates — the holiday closures, from the row to the page.
   node tools/test-hours-exceptions.mjs

   `hours_exceptions` existed, had its constraints, had a full panel in the
   editor and a line of help text promising "the site uses one on its date and
   goes back to normal by itself". Nothing ever read it. data.js did not ask
   for the table, script.js knew only about the seven-day week, and the search
   listing had no special hours in it. The owner could enter Christmas Day, be
   told it saved, and the pill would say "Open now · until 10:00 pm" on
   Christmas morning.

   Twenty-six harnesses were green throughout, because not one of them
   mentioned the table. So the first check in this file is the one that would
   have caught it: does the site ask for the rows at all. Everything after that
   is what it does with them.

   The whole file runs against the real page through tools/page-boot.mjs — real
   markup, real data.js, real render.js, real script.js, a stub network and a
   stopped clock. Asserting on the shaping functions in isolation would have
   passed for the entire time the bug existed. */

import { boot, settle, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, check, pass, fail } = reporter();

/* Wednesday 2026-08-05, 15:30 in New York — the same instant the rest of the
   harnesses freeze at. The week around it: Sun–Tue to 10pm, Wed–Sat to 11pm,
   open 7am every day, which is what data/seed-hours.js actually says. */
const WED = "2026-08-05T15:30";

const shut = (note) => ({ closed: true, opens: null, closes: null, note: note || "" });
const hours = (o, c, note) => ({ closed: false, opens: o * 60, closes: c * 60, note: note || "" });

/* A whole page, its network answering with the seed content plus whatever
   one-off dates the case is about. */
async function page(exceptions, now = WED) {
  const rows = seedRows({ exceptions });
  const rig = boot("index.html", { fetcher: serve(rows), now });
  await settle();
  return rig;
}

const pill = (rig) => rig.doc.getElementById("hoursStatus").textContent;
const listing = (rig) =>
  JSON.parse(rig.doc.querySelector('script[type="application/ld+json"]').textContent);

/* ── 1. the request that was never made ──────────────────────────────────── */

console.log("\nthe site asks the database for its one-off dates");
{
  const rig = await page({});
  const asked = rig.requests.some((u) => u.includes("hours_exceptions"));
  check("hours_exceptions is fetched", asked, true);
  check("nothing on the page errored", rig.errors, []);
  check("nothing escaped a script", rig.thrown, []);
}

/* ── 2. today ────────────────────────────────────────────────────────────── */

console.log("\na closure on today's date closes the café");
{
  const rig = await page({ "2026-08-05": shut("Christmas Day") });
  check("the pill says closed, and why",
    pill(rig), "Closed for Christmas Day · opens 7:00 am tomorrow");
  check("and marks itself closed",
    rig.doc.getElementById("hoursStatus").getAttribute("data-state"), "closed");
}

console.log("\na closure with no note still closes the café");
{
  const rig = await page({ "2026-08-05": shut() });
  check("the pill falls back to the plain sentence",
    pill(rig), "Closed · opens 7:00 am tomorrow");
}

console.log("\na one-off with different times is used instead of the week's");
{
  /* Wednesday normally runs 7am–11pm. This one closes at 6, and it is 15:30. */
  const rig = await page({ "2026-08-05": hours(7, 18, "Private event") });
  check("open, against the one-off's closing time", pill(rig), "Open now · until 6:00 pm");
}

console.log("\na one-off that opens late is closed until it opens");
{
  const rig = await page({ "2026-08-05": hours(17, 23) }, "2026-08-05T09:00");
  check("closed at 9am, opening at 5", pill(rig), "Closed · opens 5:00 pm");
}

console.log("\na one-off can open a day the week has shut");
{
  /* Wednesday closed every week, open 9–2 on this one date. Read at 10am,
     inside that window — at 15:30 the honest answer would be "closed", which
     is the same words the bug produced and would prove nothing. */
  const week = [
    { closed: true }, { closed: false, opens: 420, closes: 1320 },
    { closed: false, opens: 420, closes: 1320 }, { closed: true },
    { closed: false, opens: 420, closes: 1380 }, { closed: false, opens: 420, closes: 1380 },
    { closed: false, opens: 420, closes: 1380 }
  ];
  const rows = seedRows({
    hours: week,
    exceptions: { "2026-08-05": hours(9, 14, "Open for the holiday") }
  });
  const rig = boot("index.html", { fetcher: serve(rows), now: "2026-08-05T10:00" });
  await settle();
  check("Wednesday is shut in the week, open on the day",
    pill(rig), "Open now · until 2:00 pm");

  /* And the same page an hour after it shuts, so the window has two ends. */
  const later = boot("index.html", { fetcher: serve(rows), now: "2026-08-05T15:00" });
  await settle();
  check("and closed again once the one-off's own closing time has passed",
    pill(later), "Closed · opens 7:00 am tomorrow");
}

/* ── 3. walking forward over the closures ────────────────────────────────── */

console.log("\nthe next opening steps over a closed date rather than promising it");
{
  /* 23:30 Wednesday: the café is shut for the night and tomorrow is a closure,
     so the honest answer is Friday. Before this, "opens 7:00 am tomorrow". */
  const rig = await page({ "2026-08-06": shut("Thanksgiving") }, "2026-08-05T23:30");
  check("skips Thursday, names Friday", pill(rig), "Closed · opens 7:00 am Fri");
}

console.log("\ntwo closures in a row are both stepped over");
{
  const rig = await page(
    { "2026-08-06": shut(), "2026-08-07": shut() }, "2026-08-05T23:30");
  check("names Saturday", pill(rig), "Closed · opens 7:00 am Sat");
}

console.log("\nthe walk crosses a month and a year");
{
  /* New Year's Eve, 23:30, closed the next day. New York is UTC-5 in winter,
     so the instant carries its own offset. */
  const rig = await page({ "2027-01-01": shut("New Year's Day") },
    "2026-12-31T23:30:00-05:00");
  check("31 December steps to 2 January", pill(rig), "Closed · opens 7:00 am Sat");
}

console.log("\nthe walk crosses the spring daylight saving change");
{
  /* 2026-03-08 is the Sunday the clocks go forward. Saturday night, closed
     Sunday: the answer has to be Monday, and the day arithmetic must not lose
     or gain a day over the missing hour. */
  const rig = await page({ "2026-03-08": shut("Stocktake") },
    "2026-03-07T23:30:00-05:00");
  check("Saturday night steps over Sunday to Monday",
    pill(rig), "Closed · opens 7:00 am Mon");
}

/* ── 4. dates that have been and gone ────────────────────────────────────── */

console.log("\na date already past is not a closure any more");
{
  const rig = await page({ "2026-08-04": shut("Yesterday's closure") });
  check("the pill is unaffected", pill(rig), "Open now · until 11:00 pm");
  check("and it is not published to search",
    "specialOpeningHoursSpecification" in listing(rig), false);
}

console.log("\na closure today is still current all day");
{
  const rig = await page({ "2026-08-05": shut("All day") }, "2026-08-05T23:50");
  check("11:50pm on the closed day still reads closed",
    pill(rig).startsWith("Closed for All day"), true);
}

/* ── 5. what Google is told ──────────────────────────────────────────────── */

console.log("\nthe search listing carries the one-off dates");
{
  const rig = await page({
    "2026-08-05": shut("Christmas Day"),
    "2026-12-31": hours(7, 15, "Closing early")
  });
  const special = listing(rig).specialOpeningHoursSpecification;
  check("two entries, in date order", special.map((s) => s.validFrom),
    ["2026-08-05", "2026-12-31"]);
  check("a closure is 00:00 to 00:00, which is how the vocabulary says shut",
    [special[0].opens, special[0].closes], ["00:00", "00:00"]);
  check("validThrough is the same single day", special[0].validThrough, "2026-08-05");
  check("an early close carries its real times",
    [special[1].opens, special[1].closes], ["07:00", "15:00"]);
  check("the type is right", special[0]["@type"], "OpeningHoursSpecification");
  check("the weekly hours are still there",
    listing(rig).openingHoursSpecification.length > 0, true);
}

console.log("\nno one-off dates means no claim about special hours");
{
  const rig = await page({});
  check("the key is absent, not empty",
    "specialOpeningHoursSpecification" in listing(rig), false);
}

/* ── 6. said in advance, where a visitor will actually see it ─────────────
   The pill speaks for today and the listing speaks to Google. Neither reaches
   the person deciding on the 20th where to go on the 25th, which is who a
   holiday closure is for. These are the lines that do. */

const closures = (rig) =>
  [...rig.doc.querySelectorAll(".hours__closure")].map((li) => li.textContent);
const closuresHidden = (rig) => rig.doc.getElementById("hoursClosures").hidden;

console.log("\nthe Visit card names a closure before the day arrives");
{
  /* Wednesday the 5th. A closure on Saturday the 8th is three days out. */
  const rig = await page({ "2026-08-08": shut("Staff party") });
  check("one line, with the date and the reason",
    closures(rig), ["Closed Sat, Aug 8 — Staff party"]);
  check("and the list is showing", closuresHidden(rig), false);
  check("the pill is still about today", pill(rig), "Open now · until 11:00 pm");
}

console.log("\ntoday and tomorrow are said the way a person says them");
{
  const now = await page({ "2026-08-05": shut("Christmas Day") });
  check("today", closures(now), ["Closed today — Christmas Day"]);

  const next = await page({ "2026-08-06": shut("Christmas Day") });
  check("tomorrow", closures(next), ["Closed tomorrow — Christmas Day"]);

  const later = await page({ "2026-08-07": shut("Christmas Day") });
  check("anything further out gets its date",
    closures(later), ["Closed Fri, Aug 7 — Christmas Day"]);
}

console.log("\na closure with no note still says when");
{
  const rig = await page({ "2026-08-08": shut() });
  check("the reason is simply left off", closures(rig), ["Closed Sat, Aug 8"]);
}

console.log("\na day with unusual times says the times");
{
  const rig = await page({ "2026-08-08": hours(9, 14, "Private event") });
  check("not the word closed",
    closures(rig), ["Sat, Aug 8, 9:00 am – 2:00 pm — Private event"]);
}

console.log("\nthe notice window has two ends");
{
  /* Seven days out is the last day it is mentioned; eight is one too many. */
  const inside = await page({ "2026-08-12": shut("A week out") });
  check("seven days ahead is mentioned", closures(inside).length, 1);

  const outside = await page({ "2026-08-13": shut("Eight days out") });
  check("eight days ahead is not", closures(outside), []);
  check("and the list hides itself rather than sitting empty",
    closuresHidden(outside), true);
  check("but Google is still told about it",
    listing(outside).specialOpeningHoursSpecification.map((s) => s.validFrom),
    ["2026-08-13"]);
}

console.log("\nseveral closures in one week are all named, soonest first");
{
  const rig = await page({
    "2026-08-10": shut("Monday off"),
    "2026-08-07": shut("Friday off")
  });
  check("in date order",
    closures(rig), ["Closed Fri, Aug 7 — Friday off", "Closed Mon, Aug 10 — Monday off"]);
}

console.log("\nno closures means no list at all");
{
  const rig = await page({});
  check("nothing rendered", closures(rig), []);
  check("and the element is hidden", closuresHidden(rig), true);
}

console.log("\nthe footer and the mobile menu carry it on every page");
{
  const rows = seedRows({ exceptions: { "2026-08-08": shut("Staff party") } });
  for (const p of ["index.html", "menu-food.html", "menu-wine.html", "faq.html"]) {
    const rig = boot(p, { fetcher: serve(rows), now: WED });
    await settle();
    check(`${p} — the footer names it`,
      rig.doc.querySelector('[data-hours="footer"] .footer__closure').textContent,
      "Closed Sat, Aug 8 — Staff party");
    check(`${p} — the mobile line names it, tighter and without the reason`,
      rig.doc.querySelector(".mmenu__hours .mmenu__closure").textContent,
      "Closed Sat, Aug 8");
    check(`${p} — nothing errored`, rig.errors, []);
  }
}

/* ── 7. the repeating week underneath is still the repeating week ────────── */

console.log("\na single date does not rewrite the week it is an exception to");
{
  const plain = await page({});
  const holiday = await page({ "2026-08-08": shut("Staff party") });

  const table = (rig) => [...rig.doc.querySelectorAll(".hours__line")]
    .map((li) => li.querySelector(".hours__days").textContent + " " +
                 li.querySelector(".hours__time").textContent);

  check("the Visit table still shows the seven days", table(holiday), table(plain));
  check("the weekly listing is unchanged",
    listing(holiday).openingHoursSpecification,
    listing(plain).openingHoursSpecification);

  /* The closure is added to the footer and the mobile line, not folded into
     the prose that was already there. Strip the closure back out and what is
     left has to be byte-identical to a page with no closure at all. */
  const strip = (rig, sel, cls) => {
    const p = rig.doc.querySelector(sel).cloneNode(true);
    p.querySelectorAll(cls).forEach((n) => n.remove());
    return p.textContent;
  };
  check("the footer's weekly prose is untouched underneath",
    strip(holiday, '[data-hours="footer"]', ".footer__closure"),
    plain.doc.querySelector('[data-hours="footer"]').textContent);
  check("and the mobile line's is too",
    strip(holiday, ".mmenu__hours", ".mmenu__closure").replace(/ · $/, ""),
    plain.doc.querySelector(".mmenu__hours").textContent);
}

/* ── 7. the floor holds when the database does not ───────────────────────── */

console.log("\nthe site still opens with no database at all");
{
  const rig = boot("index.html", { seedOnly: true, now: WED });
  await settle();
  check("no request left the page", rig.requests, []);
  check("the pill is the usual week", pill(rig), "Open now · until 11:00 pm");
  check("no special hours claimed",
    "specialOpeningHoursSpecification" in listing(rig), false);
  check("nothing errored", rig.errors, []);
}

console.log("\na cache written before one-off dates existed is discarded, not half-read");
{
  /* The v2 shape: everything the renderer wants except `exceptions`. Reading
     it would put the site silently back to where it was before any of this. */
  const stale = {
    menu: { food: [] }, hours: new Array(7).fill({ closed: false, opens: 420, closes: 1320 }),
    hoursNote: "", settings: {}, copy: {}, photos: {}
  };
  const rig = boot("index.html", {
    fetcher: serve(seedRows({})), cache: stale, now: WED
  });
  await settle();
  check("the seeds render rather than the truncated cache",
    pill(rig), "Open now · until 11:00 pm");
}

console.log(state.failures
  ? `\n${state.failures} check(s) failed`
  : "\nevery one-off date reaches the pill and the listing");
process.exit(state.failures ? 1 : 0);
