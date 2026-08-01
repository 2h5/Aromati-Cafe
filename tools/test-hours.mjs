/* Hours behaviour — the cases the old code could not express.
   node tools/test-hours.mjs

   The markup this replaced hardcoded one opening time and a per-day closing
   array, so a closed day was unrepresentable and never had to work. It does
   now, and none of it is covered by verify-phase1.mjs — that proves the output
   is unchanged, which is exactly the wrong test for behaviour that is new. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const page = readFileSync("index.html", "utf8");
let failures = 0;

function check(what, got, want) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

/* Runs the real render.js against a given week, with the clock frozen so the
   open/closed pill is deterministic. nowNY is "YYYY-MM-DDTHH:MM" in New York. */
function run(hours, nowNY) {
  const dom = new JSDOM(page, { runScripts: "dangerously" });
  const { window } = dom;

  if (nowNY) {
    /* New York is UTC-4 in August. Fixing the instant rather than the timezone
       keeps script.js's Intl formatting on the real code path. */
    const fixed = new Date(`${nowNY}:00-04:00`).getTime();
    const RealDate = window.Date;
    class FakeDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    }
    window.Date = FakeDate;
  }

  const inject = (src, code) => {
    const s = window.document.createElement("script");
    s.textContent = code !== undefined ? code : readFileSync(src, "utf8");
    window.document.body.appendChild(s);
  };

  inject("data/seed-settings.js");
  inject(null, `var SEED_HOURS = ${JSON.stringify(hours)}; var SEED_HOURS_NOTE = "";`);
  inject("render.js");

  if (nowNY) {
    /* script.js expects a browser. Reporting reduced motion is the honest stub
       here — it is a real code path the site supports, and it keeps Lenis and
       the choreography out of a test that is only about the hours pill. */
    window.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    inject("script.js");
  }

  return window.document;
}

const open = (o, c) => ({ closed: false, opens: o * 60, closes: c * 60 });
const SHUT = { closed: true, opens: 0, closes: 0 };

/* The hours as they actually are: Sun–Tue to 10, Wed–Sat to 11. */
const LIVE = [open(7, 22), open(7, 22), open(7, 22), open(7, 23), open(7, 23), open(7, 23), open(7, 23)];

console.log("\ngrouping — consecutive days with the same hours collapse");
{
  const doc = run(LIVE);
  const lines = [...doc.querySelectorAll(".hours__line")];
  check("two lines", lines.length, 2);
  check("first days",  lines[0].querySelector(".hours__days").textContent, "Sun — Tue");
  check("first time",  lines[0].querySelector(".hours__time").textContent, "7:00 am – 10:00 pm");
  check("first data-days", lines[0].getAttribute("data-days"), "0,1,2");
  check("second days", lines[1].querySelector(".hours__days").textContent, "Wed — Sat");
  check("footer prose", doc.querySelector('[data-hours="footer"]').textContent,
    "Sun – Tue 7:00 am – 10:00 pmWed – Sat 7:00 am – 11:00 pm");
  check("mobile prose", doc.querySelector(".mmenu__hours").textContent,
    "Sun–Tue 7am–10pm · Wed–Sat 7am–11pm");
}

console.log("\na closed day breaks the run and leaves the listing block");
{
  const week = LIVE.slice();
  week[1] = SHUT;                                   // closed Mondays
  const doc = run(week);
  const lines = [...doc.querySelectorAll(".hours__line")];
  /* Sun and Tue keep their hours but are no longer consecutive, and Tue cannot
     join Wed because Wed closes an hour later: Sun / Mon closed / Tue / Wed-Sat. */
  check("four lines", lines.length, 4);
  check("Sunday alone", lines[0].querySelector(".hours__days").textContent, "Sun");
  check("Monday closed", lines[1].querySelector(".hours__time").textContent, "Closed");
  check("Tue rejoins Wed? no — different closing", lines[2].querySelector(".hours__days").textContent, "Tue");

  const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
  const days = ld.openingHoursSpecification.flatMap((s) =>
    Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]);
  check("Monday absent from the Google listing", days.includes("Monday"), false);
  check("the other six are present", days.length, 6);
  check("opens format", ld.openingHoursSpecification[0].opens, "07:00");
}

console.log("\nthe open/closed pill");
{
  /* 2026-08-05 is a Wednesday: open 7:00–23:00. */
  const at = (t) => run(LIVE, `2026-08-05T${t}`).getElementById("hoursStatus");

  check("mid-afternoon",        at("15:00").textContent, "Open now · until 11:00 pm");
  check("opening minute",       at("07:00").textContent, "Open now · until 11:00 pm");
  check("one minute before",    at("06:59").textContent, "Closed · opens 7:00 am");
  check("closing minute reads closed", at("23:00").textContent, "Closed · opens 7:00 am tomorrow");
  check("last hour",            at("22:30").textContent, "Closing at 11:00 pm");
  check("state attribute",      at("15:00").getAttribute("data-state"), "open");
}

console.log("\nclosed today — the pill names the next day that is actually open");
{
  const week = LIVE.slice();
  week[4] = SHUT;                                   // closed Thursday
  week[5] = SHUT;                                   // and Friday
  /* 2026-08-06 is that Thursday. */
  const doc = run(week, "2026-08-06T12:00");
  check("skips Friday, names Saturday",
    doc.getElementById("hoursStatus").textContent, "Closed · opens 7:00 am Sat");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall hours checks passed");
process.exit(failures ? 1 : 0);
