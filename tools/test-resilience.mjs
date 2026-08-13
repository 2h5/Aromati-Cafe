/* What the site does when the data is wrong, late, or absent.
   node tools/test-resilience.mjs

   Phase 7, the Resilience rows. Every other harness in this repo asks whether
   the site is right when everything works. This one asks what is left when it
   does not, which is the question the whole `network → localStorage → seed`
   design exists to answer — and which, until now, was answered only by reading
   data.js and believing it.

   The distinction that matters here: data.js has its own tests already
   (tools/test-live.mjs covers the no-key, failed-request, empty-table and
   corrupt-cache paths against a real Postgres). This is a level up from that.
   It boots a *whole page* — the real markup, the real render.js, the real
   script.js — and asks what a person would see. A data layer that degrades
   perfectly into a renderer that throws is still a blank page.

   So the assertions are deliberately about the page and not about the return
   value: is there a board, does the pill say something, did the footer get its
   hours, and did anything throw where a visitor would notice.

   Six rows, one section each. Every one of them is a state the site will
   really be in at some point — a café's wifi, an expired project, an owner who
   emptied a course to retype it and went to lunch. */

import { boot, settle, seedEnv, seedRows, serve, reporter } from "./page-boot.mjs";

const { state, fail, pass, check } = reporter();

const PAGES = ["index.html", "faq.html", "menu-food.html", "menu-drinks.html", "menu-wine.html"];

/* ── what a visitor can see ───────────────────────────────────────────────
   Named the way the checklist rows are worded, so a failure reads as the thing
   that is missing rather than as a selector. */
function survey(doc) {
  const text = (sel) => {
    const n = doc.querySelector(sel);
    return n ? n.textContent.replace(/\s+/g, " ").trim() : null;
  };
  return {
    items:      doc.querySelectorAll("#carteBody .mi").length,
    courses:    doc.querySelectorAll("#carteBody .course").length,
    tabs:       doc.querySelectorAll("#carteTabs .ctab").length,
    hoursLines: doc.querySelectorAll("#hoursList .hours__line").length,
    pill:       text("#hoursStatus"),
    footer:     text('[data-hours="footer"]'),
    mobile:     text(".mmenu__hours"),
    phone:      (doc.querySelector('a[href^="tel:"]') || {}).textContent || null,
    nav:        doc.querySelectorAll("nav a").length
  };
}

/* Every string on the board, in order — the same idea as verify-phase1.mjs's
   comparison, reused here to ask whether two loads produced the same page. */
function boardText(doc) {
  const host = doc.getElementById("carteBody");
  return host ? host.textContent.replace(/\s+/g, " ").trim() : "";
}

console.log("\nthe site with the data taken away\n");

/* ══ 1. the network dies after a good visit ══════════════════════════════
   The visitor has been here before, so localStorage holds a full copy. Today
   the café's wifi is down. The cache is what should be on the screen — not the
   seeds, and certainly not nothing. */
{
  console.log("the network dies, and the last visit is still in localStorage");

  /* A cache that is deliberately not the seed, so "the cache rendered" and
     "the seeds rendered" cannot be confused for one another.

     Every key data.js's `looksComplete` asks for has to be here, including the
     ones an empty object is a perfectly good answer for. A cache missing one
     is not a cache — it is rejected, the seeds render, and this block goes on
     passing its first check while testing the opposite of what it says. That
     is not hypothetical: `exceptions` was added to the shape and this object
     was not, and the only thing that noticed was the second check. */
  const cache = JSON.parse(JSON.stringify({
    menu: seedEnv.SEED_MENU, hours: seedEnv.SEED_HOURS,
    hoursNote: seedEnv.SEED_HOURS_NOTE || "", exceptions: {},
    settings: seedEnv.SEED_SETTINGS, copy: seedEnv.SEED_COPY, photos: {},
    builder: seedEnv.SEED_BREAKFAST_BUILDER
  }));
  cache.menu.food[0].items[0].name = "CACHED, NOT SEEDED";

  const dead = () => Promise.reject(new TypeError("Failed to fetch"));

  const board = boot("menu-food.html", { cache, fetcher: dead });
  await settle();
  check("the board is on the page", survey(board.doc).items > 0, true);
  check("and it is the cached board, not the seed",
        boardText(board.doc).includes("CACHED, NOT SEEDED"), true);
  check("the menu page logged no error", board.errors, []);
  check("nothing escaped a script tag on the menu page", board.thrown, []);

  /* The pill and the Visit table live on the home page and nowhere else, so
     "hours still tick" has to be asked there rather than of whichever page
     happened to be convenient. */
  const home = boot("index.html", { cache, fetcher: dead });
  await settle();
  const s = survey(home.doc);
  check("the hours pill still says something", !!s.pill && s.pill.length > 0, true);
  check("and it is a real claim about today",
        /^(Open now|Closing at|Closed)/.test(s.pill || ""), true);
  check("the Visit table still has its lines", s.hoursLines > 0, true);
  check("the footer still has the hours", !!s.footer, true);
  check("the home page logged no error", home.errors, []);
  check("nothing escaped a script tag on the home page", home.thrown, []);
}

/* ══ 2. the project URL is wrong ═════════════════════════════════════════
   A typo in config.js, a deleted project, an unpaid invoice. Every request
   fails, there is no cache, and the seeds are all there is. The row is worded
   "no console errors visible to a user" — so a warn is allowed (data.js says
   plainly that it kept what it had) and an error is not, because render.js
   only logs one when a render step actually threw. */
{
  console.log("\nthe project URL is wrong, and this is a first visit");
  const p = boot("index.html", {
    fetcher: () => Promise.reject(new TypeError("Failed to fetch"))
  });
  await settle();
  const s = survey(p.doc);

  check("a request was attempted", p.requests.length > 0, true);
  check("the home page still has its nav", s.nav > 0, true);
  check("the hours pill still says something", !!s.pill, true);
  check("the phone number is still on the page", !!s.phone, true);
  check("the footer hours are still there", !!s.footer, true);
  check("the mobile menu hours are still there", !!s.mobile, true);
  check("nothing escaped a script tag", p.thrown, []);
  check("no render step reported a failure", p.errors, []);
}

/* ══ 3. a course with every item deleted ═════════════════════════════════
   The owner selected a course's items to retype them and got interrupted. The
   course still exists; it has nothing in it. The heading has to stay — a
   course that vanishes takes its tab with it and the page silently loses a
   section — and nothing may throw. */
{
  console.log("\nevery item in one course is deleted");
  const emptied = seedEnv.SEED_MENU.food[0].heading;
  const tabsOf = (doc) => [...doc.querySelectorAll("#carteTabs .ctab")].map((t) => t.textContent);

  /* The tab bar is compared against the same page with nothing removed, rather
     than against a number worked out here. A count is arithmetic that has to be
     kept in step with the seed data — and the question is not "are there seven"
     but "did emptying a course cost it its tab", which only the comparison
     actually asks. */
  const whole = boot("menu-food.html", { fetcher: serve(seedRows()) });
  await settle();

  const p = boot("menu-food.html", { fetcher: serve(seedRows({ menu: (pages) => { pages.food[0].items = []; } })) });
  await settle();
  const s = survey(p.doc);

  check("the page did not crash", p.thrown, []);
  check("no render step reported a failure", p.errors, []);
  check("the emptied course still has its heading",
        boardText(p.doc).includes(emptied), true);
  check("the other courses still have their items", s.items > 0, true);
  check("the tab bar is exactly what it was before the course was emptied",
        tabsOf(p.doc), tabsOf(whole.doc));

  /* And the tab still works. A filter that leaves nothing on screen is the
     right answer for an empty course; a filter that throws is not. */
  const tab = [...p.doc.querySelectorAll("#carteTabs .ctab")]
    .find((t) => t.textContent === seedEnv.SEED_MENU.food[0].tabLabel);
  if (tab) {
    tab.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    check("filtering to the empty course does not throw", p.thrown, []);
  } else {
    fail("the emptied course lost its tab", `tabs: ${tabsOf(p.doc).join(", ")}`);
  }
}

/* ══ 4. every course on the page deleted ═════════════════════════════════
   The nuclear version, and the one that tells you whether the board is a
   component or an assumption. script.js's initMenu measures the tab bar and
   locks the board height; both are arithmetic over a list that is now empty. */
{
  console.log("\nevery course on the page is deleted");
  const rows = seedRows({ menu: (pages) => { pages.food = []; } });

  const p = boot("menu-food.html", { fetcher: serve(rows) });
  await settle();
  const s = survey(p.doc);

  check("the page did not crash", p.thrown, []);
  check("the nav is still there", s.nav > 0, true);
  check("the footer hours are still there", !!s.footer, true);
  check("the mobile menu hours are still there", !!s.mobile, true);

  /* Clicking a tab on an empty board is the second-order failure: the tab bar
     is rebuilt from a list of nothing, so if a handler assumes a first tab it
     throws on the click rather than on the render. */
  const tab = p.doc.querySelector("#carteTabs .tab");
  if (tab) {
    tab.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true }));
    check("clicking the remaining tab does not throw", p.thrown, []);
  } else {
    pass("there is no tab left to click, which is the honest outcome");
  }
}

/* ══ 5. five loads, one order ════════════════════════════════════════════
   PostgREST returns rows in whatever order the plan produced unless something
   asks otherwise, and the embedded pours and options have no ordering at all.
   So the rows are handed back shuffled differently on every one of the five
   loads, and the rendered board has to come out identical each time.

   Loading the same page five times with the same input would prove nothing —
   it would be five runs of a deterministic function. The shuffle is the test. */
{
  console.log("\nfive loads, with the rows arriving in a different order each time");
  const rows = seedRows();
  const seen = [];

  for (let n = 0; n < 5; n++) {
    let seed = n * 7919 + 13;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const p = boot("menu-wine.html", {
      fetcher: serve(rows, { shuffle: (out, table) => {
        const s = shuffle(out);
        /* the nested rows too — this is where an unsorted pour list would show */
        if (table === "menu_items") s.forEach((it) => {
          shuffle(it.menu_item_pours); shuffle(it.menu_item_options);
        });
        return s;
      } })
    });
    await settle();
    seen.push({ board: boardText(p.doc), thrown: p.thrown.length, errors: p.errors.length });
  }

  check("no load threw", seen.every((s) => !s.thrown), true);
  check("no load reported a render failure", seen.every((s) => !s.errors), true);
  check("all five boards have content", seen.every((s) => s.board.length > 200), true);

  const first = seen[0].board;
  const differing = seen.findIndex((s) => s.board !== first);
  if (differing === -1) pass("all five loads produced the same board, character for character");
  else {
    let i = 0;
    while (i < first.length && first[i] === seen[differing].board[i]) i++;
    fail(`load ${differing + 1} produced a different board`,
         `at character ${i}\n  load 1: …${first.slice(Math.max(0, i - 50), i + 50)}…` +
         `\n  load ${differing + 1}: …${seen[differing].board.slice(Math.max(0, i - 50), i + 50)}…`);
  }
}

/* ══ 6. every page, opened from a folder ═════════════════════════════════
   No key, so data.js never asks. This is the site as a stranger would get it
   from a zip file, and it is also the fallback the whole project is insured
   by — if it is not complete here, the "restore from git" story is a story.

   Each page is checked for what that page is supposed to have, rather than for
   a lowest common denominator: only the three menu pages have a board. */
{
  console.log("\nevery page opened straight from the folder, with no project configured");
  for (const page of PAGES) {
    const p = boot(page, { seedOnly: true });
    await settle();
    const s = survey(p.doc);
    const wants = [
      ["nav", s.nav > 0],
      ["footer hours", !!s.footer],
      ["mobile hours", !!s.mobile],
      ["phone", !!s.phone]
    ];
    /* Asked of the page that has it. The pill and the Visit table are on the
       home page only; the board is on the three menu pages only. A shared list
       would have to drop both to pass, which is how a completeness check ends
       up checking the nav and nothing else. */
    if (page === "index.html") {
      wants.push(["hours pill", !!s.pill], ["the Visit table", s.hoursLines > 0]);
    }
    if (/^menu-/.test(page)) {
      wants.push(["a board", s.items > 0], ["tabs", s.tabs > 0]);
    }
    const missing = wants.filter(([, ok]) => !ok).map(([w]) => w);

    if (p.requests.length) {
      fail(`${page} tried to reach the network with no key configured`,
           p.requests.slice(0, 3).join("\n"));
    } else if (missing.length) {
      fail(`${page} is incomplete from seed`, `missing: ${missing.join(", ")}`);
    } else if (p.thrown.length) {
      fail(`${page} threw`, p.thrown.join("\n"));
    } else if (p.errors.length) {
      fail(`${page} logged a render failure`, p.errors.join("\n"));
    } else {
      pass(`${page.padEnd(17)} complete from seed, and asked the network for nothing`);
    }
  }
}

console.log(state.failures
  ? `\n${state.failures} resilience problem(s)`
  : "\nthe site survives a dead network, a wrong URL, an emptied course and an empty page");
process.exit(state.failures ? 1 : 0);
