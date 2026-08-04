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
     against "Sun–Tue 7am–10pm" — so both are generated rather than shared.

     A one-off date reaches all five, but never by being folded into the week.
     1 speaks for today and 5 tells Google. 2, 3 and 4 describe the week the
     café repeats, so a closure is *added* to them on its own line, in its own
     element, in the week before it happens — "Sun — Tue" with "closed December
     25" merged into it would read as a new weekly rule rather than a holiday.

     That week of notice is the whole point. The pill only speaks on the day
     itself, and the listing block is read by Google rather than by a person,
     so without these lines the visitor deciding on the 20th where to go on the
     25th is the one person the closure never reaches. */

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

  /* ── closures, said out loud and in advance ───
     The pill speaks for today and the search listing speaks to Google. Neither
     helps the person deciding on the 20th where to go on the 25th, which is
     the visitor a holiday closure is actually for. These lines are for them.

     A date further out than NOTICE_DAYS is still in the listing and still
     closes the café when it arrives; it just does not sit on the page for a
     season first. Seven days is "the week of", which is about when someone
     starts making a plan. */

  var MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var NOTICE_DAYS = 7;

  /* Today in New York, from the site's one clock. Null when data.js is absent,
     and then no closure is mentioned at all — better to say nothing than to
     work out "tomorrow" against the visitor's own timezone. */
  function todayNY() {
    return (typeof AROMATI_DATA === "object" && AROMATI_DATA && AROMATI_DATA.nowNY)
      ? AROMATI_DATA.nowNY().date
      : null;
  }

  /* Whole days from one date to another, both "YYYY-MM-DD". UTC arithmetic on
     values that carry no time, so a daylight saving change cannot turn the
     answer into 0.958 of a day and round the wrong way. */
  function daysBetween(a, b) {
    var p = a.split("-"), q = b.split("-");
    return Math.round((Date.UTC(+q[0], +q[1] - 1, +q[2]) -
                       Date.UTC(+p[0], +p[1] - 1, +p[2])) / 86400000);
  }

  /* "today", "tomorrow", or "Fri, Dec 25". The first two are what a person
     actually says, and they are the two that matter most. */
  function dateLabel(dateKey, away) {
    if (away === 0) return "today";
    if (away === 1) return "tomorrow";
    var p = dateKey.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return DAY_SHORT[d.getUTCDay()] + ", " + MONTH_SHORT[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  /* The closures worth mentioning, soonest first. data.js has already dropped
     everything in the past, so this only has to decide how far ahead to look. */
  function upcoming(oneOffs) {
    var from = todayNY();
    if (!from) return [];
    return Object.keys(oneOffs || {}).sort().map(function (date) {
      return { date: date, away: daysBetween(from, date), one: oneOffs[date] };
    }).filter(function (e) {
      return e.away >= 0 && e.away <= NOTICE_DAYS;
    });
  }

  /* "Closed today — Christmas Day", or "Fri, Dec 25, 9:00 am – 2:00 pm".
     The compact form drops the note: the mobile menu line is already three
     ranges long and a sentence in the middle of it reads as damage. */
  function closureLine(entry, compact) {
    var when = dateLabel(entry.date, entry.away);
    if (entry.one.closed) {
      var shut = "Closed " + when;
      return !compact && entry.one.note ? shut + " — " + entry.one.note : shut;
    }
    var open = when.charAt(0).toUpperCase() + when.slice(1) + ", " +
      clock(entry.one.opens, compact) + (compact ? "–" : " – ") +
      clock(entry.one.closes, compact);
    return !compact && entry.one.note ? open + " — " + entry.one.note : open;
  }

  function renderHours(hours, note, oneOffs) {
    var runs = groupDays(hours);
    var soon = upcoming(oneOffs);

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

    /* 2b. the closures, between the table and the note. Hidden rather than
       left empty when there are none, so the card does not carry the gap of a
       list that is not there — which is most weeks of most years. */
    var box = document.getElementById("hoursClosures");
    if (box) {
      while (box.firstChild) box.removeChild(box.firstChild);
      soon.forEach(function (entry) {
        box.appendChild(el("li", "hours__closure", closureLine(entry, false)));
      });
      box.hidden = soon.length === 0;
    }

    /* 3. the footer, one run per line, then any closure on a line of its own.
       The runs are the repeating week and a closure is not, so it is not left
       to look like more of the same: it gets its own element and its own class
       rather than another line of the same prose. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-hours="footer"]'), function (p) {
      while (p.firstChild) p.removeChild(p.firstChild);
      runs.forEach(function (run, i) {
        if (i) p.appendChild(document.createElement("br"));
        /* the non-breaking space the hand-written footer used to separate the
           days from the times */
        p.appendChild(document.createTextNode(runLabel(run, " – ") + " " + runTime(run, false)));
      });
      soon.forEach(function (entry) {
        p.appendChild(document.createElement("br"));
        p.appendChild(el("span", "footer__closure", closureLine(entry, false)));
      });
    });

    /* 4. the mobile menu, all runs on one line, tighter. A closure joins that
       same line with the same separator: the line is one line by design, and a
       second one would push the nav links under it down the screen. */
    Array.prototype.forEach.call(document.querySelectorAll(".mmenu__hours"), function (p) {
      while (p.firstChild) p.removeChild(p.firstChild);
      p.appendChild(document.createTextNode(runs.map(function (run) {
        return runLabel(run, "–") + " " + runTime(run, true);
      }).join(" · ")));
      soon.forEach(function (entry) {
        p.appendChild(document.createTextNode(" · "));
        p.appendChild(el("span", "mmenu__closure", closureLine(entry, true)));
      });
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

    /* The one-off dates, in the construct schema.org has for exactly this. A
       closure is `opens` and `closes` both at 00:00 — that is how the
       vocabulary says "shut", not a placeholder — and validFrom and
       validThrough are the same single day.

       What is *not* here is a filter on dates already past. data.js drops
       those where the rows arrive, so that staleness is handled once rather
       than at each place that reads them; this file renders what it is handed,
       the same way it does not second-guess the week. A second filter here
       would be a second thing to keep true.

       Absent rather than empty when there are none. An empty array is a claim
       about special hours, and the café is not making one. */
    var dates = Object.keys(oneOffs || {}).sort();
    if (dates.length) {
      target.specialOpeningHoursSpecification = dates.map(function (date) {
        var one = oneOffs[date];
        return {
          "@type": "OpeningHoursSpecification",
          validFrom: date,
          validThrough: date,
          opens: one.closed ? "00:00" : hhmm(one.opens),
          closes: one.closed ? "00:00" : hhmm(one.closes)
        };
      });
    } else {
      delete target.specialOpeningHoursSpecification;
    }

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
    /* sameAs is every other page that is unmistakably this business: the
       Instagram profile and the delivery listings. Written here rather than
       left in the markup so it cannot outlive a changed handle or a dropped
       service — which the hand-written copy already could. */
    if (target.sameAs) target.sameAs = [igUrl].concat(orderingUrls(settings));
    ld.textContent = JSON.stringify(data, null, 2);
  }

  /* ── ordering ─────────────────────────────────
     The delivery links are in the markup already, so a reader with no
     JavaScript still gets them; this only replaces the href. An empty URL is
     how the owner says the café has left that service, and the link is taken
     out of the page — a dead link is worse than no link, and an "Order" label
     with nothing under it is worse than no label. */

  /* An href is a code sink the way innerHTML is: "javascript:…" in this field
     would run on click, and from Phase 4 the value arrives from a database an
     owner can type into. The database refuses to store anything that is not
     https, and this refuses to render it — neither one is allowed to be the
     only check, for the same reason the site never trusts a string with
     markup. Anything else is treated as absent, so the link is removed rather
     than rendered pointing somewhere unexpected. */
  var SAFE_URL = /^https:\/\/[^\s]+$/i;

  function orderingUrls(settings) {
    var links = settings.orderingLinks || {};
    return Object.keys(links)
      .map(function (k) { return links[k]; })
      .filter(function (u) { return SAFE_URL.test(u || ""); });
  }

  function renderOrdering(settings) {
    var links = settings.orderingLinks || {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-order]"), function (a) {
      var url = links[a.getAttribute("data-order")];
      if (SAFE_URL.test(url || "")) { a.setAttribute("href", url); return; }
      var group = a.closest("[data-order-group]");
      a.parentNode.removeChild(a);
      if (group && !group.querySelector("[data-order]")) group.parentNode.removeChild(group);
    });
  }

  /* ── section copy ─────────────────────────────
     Every headline, lede, label and button word on the site, keyed by the
     data-copy attribute the element already carries. tools/extract-copy.mjs
     writes both sides from one pass, so a key here always has an element and
     an element here always has a key.

     A field the data does not mention keeps its markup untouched. That is the
     no-JavaScript and mid-Phase-4 story: the page is already correct as
     served, and this only ever overwrites what it can improve on. */

  /* The whole inline vocabulary: "\n" is a line break, *word* is emphasis.
     Both are built node by node — the string is never handed to a parser, so
     an owner who types "<b>" gets the four characters "<b>" on the page and
     nothing else. Extending this later means adding a case here, never
     reaching for innerHTML. */
  function writeCopy(node, text) {
    while (node.firstChild) node.removeChild(node.firstChild);

    text.split("\n").forEach(function (line, i) {
      if (i) node.appendChild(document.createElement("br"));
      /* Odd indices are the insides of a * pair. An unmatched * leaves an even
         number of pieces, and then the line goes down whole — split() has
         already eaten the asterisk, so the pieces cannot be appended one by
         one without losing it. A note reading "*subject to change" keeps its
         asterisk, which is the only sane answer for a character that has an
         ordinary meaning in prose. */
      var pieces = line.split("*");
      if (pieces.length % 2 === 0) {
        node.appendChild(document.createTextNode(line));
        return;
      }
      pieces.forEach(function (piece, n) {
        if (!piece) return;
        if (n % 2) node.appendChild(el("em", null, piece));
        else node.appendChild(document.createTextNode(piece));
      });
    });
  }

  function renderCopy(copy) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (node) {
      var text = copy[node.getAttribute("data-copy")];
      if (typeof text === "string" && text) writeCopy(node, text);
    });
  }

  /* ── photographs ──────────────────────────────
     Keyed by slot — the position on the page — never by filename, because the
     same photograph fills two slots in two sections with two descriptions, and
     those are two decisions rather than one duplicate.

     Only ever an *override*. The picture the site shipped with is in the
     markup, so a page with no JavaScript, a visitor with no network and a
     project with no database all show the right photographs; this replaces one
     only where the owner has uploaded something. That is why an untouched site
     needs no photos data at all to be correct.

     A src is a code sink of the same family as an href — not because a script
     runs from one, but because it is a URL the owner typed that a browser goes
     and fetches. The same https-only rule applies, and for the same reason it
     is applied in two places: the storage bucket decides what may be stored,
     and this decides what may be rendered. */

  function renderPhotos(photos) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-photo]"), function (img) {
      var photo = photos[img.getAttribute("data-photo")];
      if (!photo) return;

      if (typeof photo.url === "string" && SAFE_URL.test(photo.url)) {
        img.setAttribute("src", photo.url);
      }

      /* data-photo-decorative is this *drawing* of the slot, not the slot: the
         home page's photo strip repeats its nine images in a second,
         aria-hidden group so it can scroll forever, and describing those would
         have a screen reader read the whole menu twice. An empty description
         is left alone for the same reason it is ignored in data.js — the
         markup's own alt is a better answer than none. */
      if (img.hasAttribute("data-photo-decorative")) return;
      if (typeof photo.alt === "string" && photo.alt) img.setAttribute("alt", photo.alt);
    });
  }

  /* ── go ──────────────────────────────────────
     Each step guarded on its own: a failure in one must not stop the rest, and
     must not stop script.js initialising after it. */

  function step(name, fn) {
    try { fn(); }
    catch (err) { if (window.console) console.error("render: " + name + " failed", err); }
  }

  var host = document.getElementById("carteBody");
  var page = host && host.getAttribute("data-menu");

  /* Everything on the page, from one content object. Called once synchronously
     with cache-or-seed, and again only if the network comes back with
     something different. `boardChanged` is what tells script.js whether the
     choreography has to be replayed — see below. */
  function paint(content) {
    var boardChanged = false;

    if (content.copy) step("copy", function () { renderCopy(content.copy); });

    if (content.photos) step("photos", function () { renderPhotos(content.photos); });

    if (content.settings) {
      step("contact", function () { renderContact(content.settings); });
      step("ordering", function () { renderOrdering(content.settings); });
    }

    if (content.hours) {
      step("hours", function () {
        renderHours(content.hours, content.hoursNote || null, content.exceptions || {});
      });
    }

    if (host && page) {
      /* No data is not a crash. The page keeps whatever markup it was served
         with rather than being emptied. */
      if (!content.menu || !content.menu[page]) {
        if (window.console) console.warn("render: no menu data for \"" + page + "\"");
      } else {
        step("menu board", function () {
          renderBoard(host, content.menu[page]);
          boardChanged = true;
        });
      }
    }
    return boardChanged;
  }

  /* ── first paint: synchronous, from cache or seed ──
     Nothing here waits on anything. script.js runs immediately after and finds
     a complete board to attach its observers to. */

  var source = typeof AROMATI_DATA === "object" && AROMATI_DATA
    ? AROMATI_DATA
    : null;

  paint(source ? source.current() : {
    /* data.js absent — a page that was never re-wired, or a file that failed
       to load. The seeds are still right there; use them directly rather than
       rendering nothing. */
    menu:      typeof SEED_MENU === "object" ? SEED_MENU : null,
    hours:     typeof SEED_HOURS === "object" ? SEED_HOURS : null,
    hoursNote: typeof SEED_HOURS_NOTE === "string" ? SEED_HOURS_NOTE : null,
    exceptions: typeof SEED_HOURS_EXCEPTIONS === "object" ? SEED_HOURS_EXCEPTIONS : {},
    settings:  typeof SEED_SETTINGS === "object" ? SEED_SETTINGS : null,
    copy:      typeof SEED_COPY === "object" ? SEED_COPY : null
    /* No photos here on purpose. This branch runs when data.js is absent, and
       the seed file records the built-in picture rather than an override —
       there is nothing to write that the markup does not already say. */
  });

  if (!source) return;

  /* ── second paint: only if the network disagreed ──
     refresh() calls back with null when there is nothing to do, which is the
     common case: not configured, offline, or the content is unchanged. When it
     does call back with content, the board is rebuilt underneath animations
     that have already run, so script.js is told to tear its menu wiring down
     and set it up again against the new nodes. Firing the event only when the
     board actually changed keeps a copy-only edit from replaying the cascade
     for no visible reason. */

  function announce(name) {
    try {
      document.dispatchEvent(new CustomEvent(name));
    } catch (err) {
      /* CustomEvent is available everywhere this site runs; if it somehow is
         not, the fresh content is on the page and static — worse than
         animated, far better than absent. */
      if (window.console) console.warn("render: could not announce " + name, err);
    }
  }

  source.refresh(function (fresh) {
    if (!fresh) return;
    var boardChanged = paint(fresh);

    /* Two announcements, because they answer two different questions.

       `content-changed` fires on every second paint. It is for the parts of
       the page this file does not own — above all the open/closed pill, which
       script.js writes because it is the only thing here that needs to know
       the time. Without this the pill goes on reading the hours it was born
       with, and a visitor sees last month's hours in the pill and this month's
       in the table directly below it, on the same screen, with nothing logged
       anywhere. That is not hypothetical; it is what tools/test-hours-live.mjs
       caught, and the reason this event exists.

       `board-replaced` fires only when the menu itself was rebuilt, and it
       means something much heavier: tear the menu wiring down and set it up
       again against the new nodes. Firing that for a copy-only or hours-only
       edit would replay the entrance cascade over a board that had settled. */
    announce("aromati:content-changed");
    if (!boardChanged) return;
    announce("aromati:board-replaced");
  });
})();
