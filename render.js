/* ═══════════════════════════════════════════════
   AROMATI — render
   the menu boards, built from data instead of markup
   ═══════════════════════════════════════════════

   Runs before script.js, synchronously, so every board exists in the DOM
   before the reveal observers, the tab filter and the entrance choreography go
   looking for it. Nothing here waits on anything — from Phase 4 the network
   copy folds in afterwards, and only if it differs.

   Same house style as script.js: plain ES5, one IIFE, no build step.

   ── the one security rule ──
   Everything below builds nodes with createElement and fills them with
   textContent. Never innerHTML, never insertAdjacentHTML, not even for a value
   that "obviously" cannot contain markup. From Phase 5 this content is typed
   by the owner into a CMS, and the rule is what keeps a menu item named
   <script>… a menu item named <script>… rather than a script that runs in
   every visitor's browser. There is no case where the convenience is worth it.

   Prices are stored bare — no "$". styles.css renders the symbol for
   .mi__price, .mi__cell, .mi__pours b and .mi__opts li b, so the character
   appears in exactly one place in the whole project. */

(function () {
  "use strict";

  /* ── tiny DOM helpers ────────────────────────── */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // the rule, in one place
    return n;
  }

  /* ── one menu item ────────────────────────────
     Mirrors the markup the pages carried by hand, because styles.css and the
     tab filter both read these exact class names.

       <li class="mi">
         <div class="mi__row">
           <h3>Name <span class="mi__tag">2022</span></h3>
           <i class="mi__leader"></i>
           <span class="mi__price">17</span>          ← or .mi__cells, or nothing
         </div>
         <p class="mi__desc">…</p>
         <ul class="mi__pours">…</ul>                 ← optional
       </li>                                                                  */

  function renderItem(item, course) {
    var li = el("li", "mi");
    var row = el("div", "mi__row");

    var h3 = el("h3", null, item.name);
    /* The tag is a qualifier inside the heading — a vintage, a volume, a
       count. Appended as its own node so the name stays the name. */
    if (item.tag) {
      h3.appendChild(document.createTextNode(" "));
      h3.appendChild(el("span", "mi__tag", item.tag));
    }
    row.appendChild(h3);
    row.appendChild(el("i", "mi__leader"));

    if (item.price != null) {
      row.appendChild(el("span", "mi__price", item.price));

    } else if (item.priceAllSizes != null) {
      /* One price across a sized course. --solo spans both columns, so the
         number still lands on the same right-hand edge as its neighbours. */
      var solo = el("span", "mi__cells");
      solo.appendChild(el("b", "mi__cell mi__cell--solo", item.priceAllSizes));
      row.appendChild(solo);

    } else if (item.prices) {
      /* Index-aligned with the course's sizes. A blank means the item is not
         offered in that size — an empty cell, never a "$" on its own. */
      var cells = el("span", "mi__cells");
      for (var i = 0; i < course.sizes.length; i++) {
        var p = item.prices[i];
        cells.appendChild(el("b", p ? "mi__cell" : "mi__cell mi__cell--none", p || ""));
      }
      row.appendChild(cells);

    } else if (!item.noPrice) {
      /* Should be unreachable: the extractor rejects an item with no shape.
         If data ever arrives from the network with one, drop the item rather
         than render a broken row. */
      return null;
    }

    /* The crêpe's disclosure button. The row is the click target (styles.css
       gives it cursor:pointer); script.js owns the open/close behaviour. */
    if (item.options) {
      var toggle = el("button", "mi__toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", item.optionsId);
      toggle.appendChild(el("span", "sr-only", "Show toppings for " + item.name));
      row.appendChild(toggle);
    }

    li.appendChild(row);
    if (item.desc) li.appendChild(el("p", "mi__desc", item.desc));

    if (item.pours) {
      var pours = el("ul", "mi__pours");
      item.pours.forEach(function (pour) {
        var line = el("li");
        line.appendChild(el("span", null, pour.label));
        line.appendChild(el("b", null, pour.price));
        pours.appendChild(line);
      });
      li.appendChild(pours);
    }

    if (item.options) {
      li.className = "mi mi--opts";
      li.setAttribute("data-opts", "");
      var wrap = el("div", "mi__opts");
      wrap.id = item.optionsId;
      var list = el("ul");
      item.options.forEach(function (opt) {
        var line = el("li");
        line.appendChild(el("span", null, opt.name));
        line.appendChild(el("b", null, opt.price));
        list.appendChild(line);
      });
      wrap.appendChild(list);
      li.appendChild(wrap);
    }

    if (item.noPrice) li.className += " mi--noprice";

    return li;
  }

  /* ── one course ──────────────────────────────── */

  function renderCourse(course) {
    var section = el("section", "course" + (course.sizes ? " course--sized" : ""));
    section.setAttribute("data-course", course.key);
    section.setAttribute("data-label", course.tabLabel);

    var head = el("header", "course__head");
    head.appendChild(el("h2", null, course.heading));
    /* Filled in by script.js once the board is filtered — left empty here for
       the same reason it is empty in the markup today. */
    head.appendChild(el("span", "course__count"));
    section.appendChild(head);

    /* Sizes are a column header for the whole course, not a label repeated on
       every line. aria-hidden because the prices below are already announced
       in order and the header would only add noise. */
    if (course.sizes) {
      var sizes = el("div", "course__sizes");
      sizes.setAttribute("aria-hidden", "true");
      course.sizes.forEach(function (s) { sizes.appendChild(el("span", null, s)); });
      section.appendChild(sizes);
    }

    var ul = el("ul", "course__items");
    course.items.forEach(function (item) {
      var li = renderItem(item, course);
      if (li) ul.appendChild(li);
    });
    section.appendChild(ul);

    return section;
  }

  /* ── the board ───────────────────────────────── */

  function renderBoard(host, courses) {
    /* Static courses — Build Your Own — keep their hand-written markup. Lift
       them out before the host is emptied, then put them back at the position
       the data records, so course order and the tab filter behave as if they
       were generated like everything else. */
    var statics = {};
    Array.prototype.forEach.call(host.querySelectorAll("[data-static]"), function (node) {
      statics[node.getAttribute("data-static")] = node;
    });

    var frag = document.createDocumentFragment();
    var missing = [];

    courses.forEach(function (course) {
      if (course.isStatic) {
        var kept = statics[course.staticId];
        if (kept) frag.appendChild(kept);
        else missing.push(course.staticId);
        return;
      }
      frag.appendChild(renderCourse(course));
    });

    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(frag);

    /* A missing static block means the markup and the data have drifted. Say
       so in the console — the page still renders everything else. */
    if (missing.length && window.console) {
      console.warn("render: no markup for static course(s): " + missing.join(", "));
    }
  }

  /* ═══════════ HOURS ═══════════
     One source, five destinations. Before this, the hours were written out by
     hand in all five and the open/closed logic kept its own copy of the
     numbers, so changing them meant eleven edits and any missed one left the
     site contradicting itself — or worse, contradicting Google.

       1. the live open/closed pill      script.js, reading SEED_HOURS
       2. the Visit hours table          #hoursList
       3. the footer prose               [data-hours="footer"]
       4. the mobile-menu prose          .mmenu__hours
       5. the Google listing block       script[type="application/ld+json"]

     3 and 4 are deliberately different formats — "Sun – Tue  7:00 am – 10:00 pm"
     against "Sun–Tue 7am–10pm" — so both are generated rather than shared. */

  var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  /* The table reads Sunday first, matching the markup it replaces. */
  var WEEK = [0, 1, 2, 3, 4, 5, 6];

  function clock(mins, compact) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var suffix = h >= 12 ? "pm" : "am";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    if (compact) return h12 + (m ? ":" + (m < 10 ? "0" + m : m) : "") + suffix;
    return h12 + ":" + (m < 10 ? "0" + m : m) + " " + suffix;
  }

  /* Consecutive days that keep the same hours collapse into one line, which is
     what the hand-written markup did and what schema.org prefers. A closed day
     breaks the run rather than joining it. */
  function groupDays(hours) {
    var runs = [];
    WEEK.forEach(function (day) {
      var h = hours[day];
      if (!h) return;
      var last = runs[runs.length - 1];
      var same = last && !last.closed === !h.closed &&
        last.opens === h.opens && last.closes === h.closes;
      if (same) last.days.push(day);
      else runs.push({ days: [day], closed: !!h.closed, opens: h.opens, closes: h.closes });
    });
    return runs;
  }

  function runLabel(run, dash) {
    if (run.days.length === 1) return DAY_SHORT[run.days[0]];
    return DAY_SHORT[run.days[0]] + dash + DAY_SHORT[run.days[run.days.length - 1]];
  }

  function runTime(run, compact) {
    if (run.closed) return "Closed";
    return clock(run.opens, compact) + (compact ? "–" : " – ") + clock(run.closes, compact);
  }

  function renderHours(hours, note) {
    var runs = groupDays(hours);

    /* 2. the Visit table. data-days is what script.js reads to light up today,
       so it carries every day in the run, not just its ends. */
    var list = document.getElementById("hoursList");
    if (list) {
      while (list.firstChild) list.removeChild(list.firstChild);
      runs.forEach(function (run) {
        var li = el("li", "hours__line");
        li.setAttribute("data-days", run.days.join(","));
        li.appendChild(el("span", "hours__days", runLabel(run, " — ")));
        li.appendChild(el("i", "hours__leader"));
        li.appendChild(el("span", "hours__time", runTime(run, false)));
        list.appendChild(li);
      });
      var noteEl = document.querySelector(".hours__note");
      if (noteEl && note) noteEl.textContent = note;
    }

    /* 3. the footer, one run per line. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-hours="footer"]'), function (p) {
      while (p.firstChild) p.removeChild(p.firstChild);
      runs.forEach(function (run, i) {
        if (i) p.appendChild(document.createElement("br"));
        /* the non-breaking space the hand-written footer used to separate the
           days from the times */
        p.appendChild(document.createTextNode(runLabel(run, " – ") + " " + runTime(run, false)));
      });
    });

    /* 4. the mobile menu, all runs on one line, tighter. */
    Array.prototype.forEach.call(document.querySelectorAll(".mmenu__hours"), function (p) {
      p.textContent = runs.map(function (run) {
        return runLabel(run, "–") + " " + runTime(run, true);
      }).join(" · ");
    });

    /* 5. the Google listing. Parsed, mutated, assigned back through
       textContent — which does not re-parse HTML, so nothing typed into an
       address field can break out of the <script>. */
    var ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) return;
    var data;
    try { data = JSON.parse(ld.textContent); }
    catch (err) { return; }                     // hand-edited into invalid JSON

    var target = data.openingHoursSpecification ? data
      : (data.isPartOf && data.isPartOf.openingHoursSpecification) ? data.isPartOf : null;
    if (!target) return;                        // this page does not publish hours

    target.openingHoursSpecification = runs
      .filter(function (run) { return !run.closed; })
      .map(function (run) {
        var days = run.days.map(function (d) { return DAY_LONG[d]; });
        return {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: days.length === 1 ? days[0] : days,
          opens: hhmm(run.opens),
          closes: hhmm(run.closes)
        };
      });
    ld.textContent = JSON.stringify(data, null, 2);
  }

  function hhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
  }

  /* ═══════════ CONTACT ═══════════
     The phone appeared 24 times across the five pages, the Instagram URL 17.
     All of it derives from the digits and the handle in seed-settings.js, so
     the display form, the tel: href and the Google listing cannot drift apart.

     Found by what the elements already are rather than by hooks added for the
     purpose — every tel: link is a phone number by definition. */

  function renderContact(settings) {
    var d = settings.phoneDigits;
    if (!/^\d{10}$/.test(d)) return;                      // never write a broken number

    var display = "+" + settings.phoneCountry + " (" + d.slice(0, 3) + ") " +
      d.slice(3, 6) + "-" + d.slice(6);
    var href = "tel:+" + settings.phoneCountry + d;

    Array.prototype.forEach.call(document.querySelectorAll('a[href^="tel:"]'), function (a) {
      a.setAttribute("href", href);
      /* Some phone links wrap the number in a <span> beside an icon; others
         are the number. Write to whichever actually holds the text. */
      var span = a.querySelector("span:not([class])") || a.querySelector("span");
      var holder = span && !span.querySelector("svg") ? span : a;
      if (holder === a && a.querySelector("svg")) return;   // icon-only, no text to set
      holder.textContent = display;
    });

    Array.prototype.forEach.call(document.querySelectorAll('a[href^="mailto:"]'), function (a) {
      a.setAttribute("href", "mailto:" + settings.email);
      a.textContent = settings.email;
    });

    var igUrl = "https://www.instagram.com/" + settings.instagramHandle;
    Array.prototype.forEach.call(document.querySelectorAll('a[href*="instagram.com"]'), function (a) {
      a.setAttribute("href", igUrl);
      if (a.hasAttribute("aria-label")) {
        a.setAttribute("aria-label", "Aromati on Instagram — @" + settings.instagramHandle);
      }
      var handle = a.querySelector(".ig__handle");
      if (handle) handle.textContent = "@" + settings.instagramHandle;
    });

    var addr = settings.address;
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-contact="address"], .mmenu__addr'),
      function (p) {
        while (p.firstChild) p.removeChild(p.firstChild);
        p.appendChild(document.createTextNode(addr.street));
        p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(
          addr.locality + ", " + addr.region + " " + addr.postal));
      }
    );

    var ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) return;
    var data;
    try { data = JSON.parse(ld.textContent); }
    catch (err) { return; }

    var target = data.telephone ? data : (data.isPartOf && data.isPartOf.telephone) ? data.isPartOf : null;
    if (!target) return;
    target.telephone = "+" + settings.phoneCountry + "-" + settings.phoneDigits.slice(0, 3) +
      "-" + settings.phoneDigits.slice(3, 6) + "-" + settings.phoneDigits.slice(6);
    if (target.address) {
      target.address.streetAddress = addr.street;
      target.address.addressLocality = addr.locality;
      target.address.addressRegion = addr.region;
      target.address.postalCode = addr.postal;
      target.address.addressCountry = addr.country;
    }
    if (target.email) target.email = settings.email;
    ld.textContent = JSON.stringify(data, null, 2);
  }

  /* ── go ──────────────────────────────────────
     Each step guarded on its own: a failure in one must not stop the rest, and
     must not stop script.js initialising after it. */

  function step(name, fn) {
    try { fn(); }
    catch (err) { if (window.console) console.error("render: " + name + " failed", err); }
  }

  if (typeof SEED_SETTINGS === "object" && SEED_SETTINGS) {
    step("contact", function () { renderContact(SEED_SETTINGS); });
  }

  if (typeof SEED_HOURS === "object" && SEED_HOURS) {
    step("hours", function () {
      renderHours(SEED_HOURS, typeof SEED_HOURS_NOTE === "string" ? SEED_HOURS_NOTE : null);
    });
  }

  var host = document.getElementById("carteBody");
  if (!host) return;                                  // not a menu page

  var page = host.getAttribute("data-menu");
  if (!page) return;

  /* No data is not a crash. The page keeps whatever markup it was served with,
     which through Phase 1 is nothing and from Phase 4 is the seed board. */
  if (typeof SEED_MENU !== "object" || !SEED_MENU || !SEED_MENU[page]) {
    if (window.console) console.warn("render: no menu data for \"" + page + "\"");
    return;
  }

  step("menu board", function () { renderBoard(host, SEED_MENU[page]); });
})();
