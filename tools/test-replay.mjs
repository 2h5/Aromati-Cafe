/* When fresh data replaces the board, does the page survive it?
   node tools/test-replay.mjs

   Phase 4 rebuilds the menu underneath animations that have already run. That
   is the one part of it jsdom cannot answer — it has no layout, no
   IntersectionObserver worth the name, and the choreography is the whole
   problem. So this drives real Chrome.

   What it is actually looking for is leakage. `initMenu` attaches a spacer, a
   click handler and an IntersectionObserver; running it twice without tearing
   the first one down leaves a second spacer stacked under the board, two
   handlers on every tab, and an observer still holding nodes that are no
   longer in the document. None of that throws. It shows up later as a menu
   that scrolls oddly and a tab that fires twice, which is close to impossible
   to trace back to here.

   The probe replaces window.fetch before data.js loads and answers with a menu
   that differs from the seed, which is what makes render.js fire
   aromati:board-replaced. Nothing touches the real project.

   Needs Chrome. Skips cleanly without it — which, as everywhere else in this
   repo, means a green run on a machine with no browser proves nothing. */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find(existsSync);

if (!CHROME) {
  console.log("\n  skip  no Chrome or Edge found — the board replay was not exercised\n");
  process.exit(0);
}

const PAGE = "menu-food.html";

/* Injected between config.js and data.js. It has to run before data.js, which
   reads AROMATI_CONFIG at refresh() time and fetch at the same moment. */
function probe() {
  return `
<script>
(function () {
  /* A key long enough to look configured. No request leaves the machine —
     fetch is replaced below. */
  window.AROMATI_CONFIG = { url: "https://example.invalid", anonKey: "x".repeat(40) };

  /* The seed menu, with three deliberate differences: a renamed item, a course
     dropped, and a pour added. Enough that data.js must report it as changed. */
  function rows() {
    var courses = [], items = [], cid = 0, iid = 0;
    var pages = SEED_MENU;
    Object.keys(pages).forEach(function (page) {
      pages[page].forEach(function (c, ci) {
        if (page === "food" && ci === 1) return;          // a course disappears
        cid++;
        courses.push({
          id: "c" + cid, page: page, course_key: c.key, tab_label: c.tabLabel,
          heading: c.heading, sizes: c.sizes || null,
          is_static: !!c.isStatic, static_id: c.staticId || null, sort_order: ci
        });
        (c.items || []).forEach(function (it, ii) {
          iid++;
          var row = {
            id: "i" + iid, course_id: "c" + cid,
            name: (page === "food" && ci === 0 && ii === 0) ? "RENAMED BY THE PROBE" : it.name,
            tag: it.tag || null, description: it.desc || null,
            price: it.price != null ? it.price : null,
            prices: it.prices != null ? it.prices : null,
            price_all_sizes: it.priceAllSizes != null ? it.priceAllSizes : null,
            no_price: !!it.noPrice, options_dom_id: it.optionsId || null,
            sort_order: ii,
            menu_item_pours: (it.pours || []).map(function (p, pi) {
              return { id: "p" + iid + "_" + pi, label: p.label, price: p.price, sort_order: pi };
            }),
            menu_item_options: (it.options || []).map(function (o, oi) {
              return { id: "o" + iid + "_" + oi, name: o.name, price: o.price, sort_order: oi };
            })
          };
          items.push(row);
        });
      });
    });
    return { courses: courses, items: items };
  }

  window.fetch = function (url) {
    var path = String(url).split("/rest/v1/")[1] || "";
    var table = path.split("?")[0];
    var body;
    if (table === "site_settings") {
      body = [{ key: "phone_digits", value: "3322073847" },
              { key: "phone_country", value: "1" },
              { key: "email", value: "info@aromatiNY.com" },
              { key: "instagram_handle", value: "aromatinyc" }];
    } else if (table === "business_hours") {
      body = SEED_HOURS.map(function (h, d) {
        return { day_of_week: d, is_closed: h.closed,
                 opens_at: h.closed ? null : "07:00:00",
                 closes_at: h.closed ? null : (h.closes / 60) + ":00:00" };
      });
    } else if (table === "site_copy") {
      body = Object.keys(SEED_COPY).map(function (k) { return { key: k, value: SEED_COPY[k] }; });
    } else if (table === "menu_courses") {
      body = rows().courses;
    } else if (table === "menu_items") {
      body = rows().items;
    } else {
      body = [];
    }
    /* Answered late, on purpose, and this is the whole reason the harness
       works at all. An immediately-resolved promise settles in the microtask
       checkpoint *between* the render.js and script.js <script> tags, so the
       board is already fresh before script.js has registered its listener —
       initMenu then runs once, against the new board, and every leak check
       below passes while the replay path was never executed. Harmless in
       production (the outcome is the same board, correctly initialised) and
       useless in a test. 300ms puts the response where a real network puts
       it: after the page has finished loading and animating. */
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } });
      }, 300);
    });
  };

  /* localStorage must start empty, or a previous run's cache is what renders. */
  try { window.localStorage.clear(); } catch (e) {}

  window.__replays = 0;
  document.addEventListener("aromati:board-replaced", function () { window.__replays++; });
})();
</script>
`;
}

const REPORT = `
<script>
(function () {
  /* Counting .mi[data-opts] nodes would prove nothing — the question is how
     many click handlers are on each one, and that is not readable from the
     DOM. So ask it behaviourally: after the rebuild, one click on the toggle
     must leave the row open.

     Zero handlers and one click does nothing; two handlers and it toggles open
     then straight back shut. Both read to a user as "the button is broken",
     and this catches either.

     Today it is the *zero* case that can actually happen — the crêpe row is
     regenerated by renderBoard, so it always gets exactly one fresh binding,
     and forgetting to rebind after a replay is the live risk. The
     data-opts-bound guard in script.js covers the double case, which only
     arises for a node that is moved rather than rebuilt. Nothing on the site
     is in that position yet, so that guard is defensive and this test does not
     currently exercise it. Said plainly rather than left implied, because a
     test that appears to cover something it does not is worse than no test. */
  function optionRowOpensOnOneClick() {
    var mi = document.querySelector(".mi[data-opts]");
    if (!mi) return null;                       // no expandable row on this page
    var btn = mi.querySelector(".mi__toggle");
    if (!btn) return null;
    mi.classList.remove("is-open");
    btn.click();
    return mi.classList.contains("is-open");
  }

  function report() {
    var body = document.getElementById("carteBody");
    var tabs = document.getElementById("carteTabs");
    document.title = JSON.stringify({
      replays:   window.__replays,
      spacers:   document.querySelectorAll(".menu-spacer").length,
      tabs:      tabs ? tabs.querySelectorAll(".ctab").length : 0,
      courses:   body ? body.querySelectorAll(".course").length : 0,
      renamed:   !!(body && /RENAMED BY THE PROBE/.test(body.textContent)),
      build:     !!document.getElementById("build"),
      optionRow: optionRowOpensOnOneClick(),
      errors:    window.__errors || []
    });
  }
  window.__errors = [];
  window.addEventListener("error", function (e) { window.__errors.push(String(e.message)); });
  /* The refresh is a promise chain; give it several turns to land, then report
     whether it did or not. No requestAnimationFrame — it does not fire under
     --virtual-time-budget. */
  setTimeout(report, 2500);
})();
</script>
`;

const tmp = PAGE.replace(/\.html$/, ".__replay.html");
let result = null;
try {
  const html = readFileSync(PAGE, "utf8")
    .replace('<script src="data.js"></script>', probe() + '<script src="data.js"></script>')
    .replace("</body>", REPORT + "</body>");
  writeFileSync(tmp, html);

  const dom = execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    "--window-size=1600,900", "--virtual-time-budget=20000",
    "--dump-dom", "file:///" + resolve(tmp).replace(/\\/g, "/")
  ], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });

  const m = dom.match(/<title>(\{.*\})<\/title>/);
  if (m) result = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
} finally {
  if (existsSync(tmp)) unlinkSync(tmp);
}

let failures = 0;
const fail = (msg, detail) => {
  failures++;
  console.log(`  FAIL ${msg}`);
  if (detail) console.log(String(detail).split("\n").map((l) => `         ${l}`).join("\n"));
};
const pass = (msg) => console.log(`  ok   ${msg}`);

console.log("\nreplacing the board under a page that has already animated\n");

if (!result) {
  fail("the probe never reported", "the page did not reach the report, or it threw first");
  console.log("\n1 problem — the replay could not be measured");
  process.exit(1);
}

if (result.errors.length) fail("the page threw during the replay", result.errors.join("\n"));
else pass("no uncaught error during the replay");

if (result.replays === 1) pass("the board was replaced exactly once");
else if (result.replays === 0) fail("the board was never replaced", "fresh data did not reach render.js");
else fail(`the board was replaced ${result.replays} times`, "once is the contract — each one replays the cascade");

if (result.renamed) pass("the fresh menu is what is on the page");
else fail("the page is still showing the old menu");

/* The leak checks. Each of these is silent when it goes wrong. */
if (result.spacers === 1) pass("one scroll spacer, not one per initMenu run");
else fail(`${result.spacers} scroll spacers`, "the teardown is not removing the previous one");

/* The probe drops one course from the food page, so the tab bar must be
   rebuilt with one fewer — not appended to, and not left stale. */
{
  const seed = readFileSync("data/seed-menu.js", "utf8");
  const food = JSON.parse(seed.slice(seed.indexOf("{"), seed.lastIndexOf("}") + 1)).food || [];

  /* Tabs are one per distinct data-course, not one per course — the food page
     has two sections keyed "breakfast" (the course and Build Your Own), which
     is exactly why the schema keys on (page, course_key) rather than treating
     course_key as unique. Plus "All". */
  const kept = food.filter((_, i) => i !== 1);          // the probe drops index 1
  const wantTabs = new Set(kept.map((c) => c.key)).size + 1;

  if (result.tabs === wantTabs) pass(`the tab bar was rebuilt, not appended to (${result.tabs} tabs)`);
  else fail(`${result.tabs} tabs, expected ${wantTabs}`,
            result.tabs > wantTabs
              ? "more than expected — the bar was not emptied before the second run"
              : "fewer than expected — the rebuild lost a filter");
}

if (result.build) pass("Build Your Own survived the rebuild");
else fail("Build Your Own is gone", "renderBoard must lift static courses out before emptying the host");

if (result.optionRow === null) {
  fail("there is no expandable row to test on " + PAGE,
       "the crêpe row is the one this guards — has it moved page?");
} else if (result.optionRow) {
  pass("one click still opens the expandable row — it is bound once, not twice");
} else {
  fail("one click no longer opens the expandable row",
       "bound twice, so the handler toggles it open and straight back shut — " +
       "a moved node keeps its listeners, see data-opts-bound in script.js");
}

console.log(failures
  ? `\n${failures} problem(s) — the replay leaks`
  : "\nthe board can be replaced without leaving anything behind");
process.exit(failures ? 1 : 0);
