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

   Prices are stored bare and rendered as bare numbers throughout the public
   menu. Keeping the values unadorned also keeps the CMS and static builders
   consistent. */

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
         offered in that size — an empty cell, never a price on its own. */
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

  /* ── the section ornament ─────────────────────
     The divider under every course title. This is not a drawing of the printed
     one — it is the printed one: the paths below were lifted out of the vector
     art in assets/menus/menu – A5 - COFFEE.pdf, which carries no fonts and no
     images, so every mark on that sheet is geometry that can be read straight
     out of the content stream. Two hand-drawn approximations came before it and
     neither survived comparison with the sheet; this one cannot drift from it,
     because it is the same curve data at the same proportions.

     The divider is three <svg>s over one coordinate system — the left rule,
     the motif, the right rule — each a window onto its own part of the same
     271.97 × 19.73 art, at the same vertical scale. It was a single <svg>
     until the divider had to be as long as the title above it: one box can
     only grow whole, so a long course name got a fatter rule and a bigger
     scroll than a short one, on the same board. Split, the motif keeps one
     size everywhere and only the two rules run long or short.

     That is not the old arrangement coming back. The rules were CSS gradients
     once, with the art as a background image between them, and the two
     renderers never landed the join on the same pixel at every zoom. These are
     the sheet's own paths in all three boxes, and the boxes overlap by exactly
     what the art overlaps by, so the joins fall inside the diamonds where they
     already fell. What the stretch costs is the round cap at each rule's inner
     end, which is not square-on any more — it is under a pixel wide at every
     size this is drawn at, and it is buried in a diamond.

     The art is filled outlines rather than strokes, as Illustrator wrote it:
     the diamonds are a ring with the centre wound the other way, so the paper
     shows through them under the default nonzero fill rule — the same reason
     they are hollow on the sheet.

     fill="currentColor" is what makes it inheritable: styles.css sets the
     colour on .course__orn and every path follows, so the burgundy lives in one
     place rather than being baked into the art. aria-hidden because it says
     nothing — it is the space between two headings, made visible.

     The viewBox is the art's own measurements in points, 271.97 × 19.73, so the
     proportions are the sheet's: the rule is 1.8 units thick and sits on the
     diamonds' waist, and the scroll hangs below it. */

  var ORN_NS = "http://www.w3.org/2000/svg";

  /* Each piece carries the window onto the art that it draws, in the art's own
     units: x, then width, out of the full 271.97. The heights are all 19.73 —
     every box is the full height of the art, so the three sit on one baseline
     however wide they are drawn. */
  var ORN_RULE_L = "0 0 106.47 19.73";      /* flat outer end .. round inner end */
  var ORN_RULE_R = "165.5 0 106.47 19.73";
  var ORN_MOTIF  = "104.67 0 61.61 19.73";  /* both diamonds and the scroll */

  var ORN_PATHS = [
    /* the rule, left of the ornament — flat at the outer end, a round
       cap at the end that meets the diamond */
    "M0 4.1L105.57 4.1C106.07 4.1 106.47 4.51 106.47 5C106.47 5.5 106.07 5.91 105.57 5.91L0 5.91",
    /* and right of it */
    "M165.5 4.1L271.07 4.1C271.57 4.1 271.97 4.51 271.97 5C271.97 5.5 271.57 5.91 271.07 5.91L165.51 5.91",
    /* the scroll: two halves, each running from its own diamond, crossing
       the centre and curling back on itself */
    "M140.59 11.28C140.96 11.52 141.33 11.75 141.7 11.98C142 12.17 142.29 12.36 142.58 12.55C143.95 13.46 145.14 14.25 146.55 13.93C147.24 13.78 147.84 13.34 148.15 12.76C148.34 12.41 148.51 11.86 148.26 11.17C147.8 9.95 145.58 9.72 144.22 9.95C143 10.15 141.7 10.61 140.59 11.28M150.19 11.86C150.19 12.47 150.04 13.07 149.74 13.62C149.17 14.66 148.16 15.42 146.95 15.69C144.79 16.18 143.08 15.05 141.58 14.05C141.31 13.87 141.03 13.69 140.75 13.51C140.19 13.16 139.63 12.8 139.07 12.44C138.46 13.05 138.01 13.76 137.81 14.53C137.38 16.22 138.13 17.17 138.99 17.48C139.54 17.68 140.22 17.64 140.46 17.15C140.68 16.7 141.22 16.52 141.66 16.74C142.11 16.96 142.29 17.51 142.07 17.95C141.44 19.22 139.88 19.73 138.36 19.17C136.73 18.57 135.38 16.76 136.06 14.08C136.32 13.09 136.85 12.2 137.54 11.44L137.43 11.36C136.79 10.94 136.25 10.52 135.73 10.11C132.97 7.95 130.36 5.91 113.6 5.91C113.1 5.91 112.7 5.5 112.7 5C112.7 4.51 113.1 4.1 113.6 4.1C130.99 4.1 133.83 6.33 136.84 8.69C137.35 9.1 137.84 9.48 138.42 9.86L138.95 10.21C140.44 9.14 142.26 8.45 143.92 8.17C145.87 7.84 149.08 8.2 149.95 10.54C150.11 10.98 150.19 11.42 150.19 11.86",
    "M122.56 11.86C122.56 12.23 122.68 12.54 122.8 12.76C123.11 13.34 123.71 13.78 124.4 13.93C125.81 14.25 127 13.47 128.37 12.55C128.66 12.36 128.95 12.17 129.25 11.98C129.62 11.75 129.99 11.52 130.36 11.28C129.25 10.61 127.95 10.15 126.73 9.95C125.37 9.72 123.15 9.95 122.69 11.17C122.6 11.42 122.56 11.65 122.56 11.86M158.25 5C158.25 5.5 157.85 5.91 157.35 5.91C140.59 5.91 137.98 7.95 135.23 10.11C134.7 10.52 134.16 10.95 133.52 11.37L133.41 11.44C134.11 12.2 134.63 13.09 134.89 14.09C135.57 16.76 134.23 18.57 132.59 19.17C131.07 19.73 129.51 19.22 128.88 17.95C128.66 17.51 128.84 16.96 129.29 16.74C129.73 16.52 130.28 16.7 130.5 17.15C130.74 17.64 131.42 17.68 131.96 17.48C132.82 17.17 133.57 16.22 133.14 14.53C132.94 13.76 132.49 13.05 131.88 12.44C131.32 12.8 130.76 13.16 130.2 13.51C129.92 13.69 129.64 13.87 129.37 14.05C127.87 15.05 126.17 16.18 124 15.69C122.8 15.42 121.78 14.66 121.21 13.62C120.7 12.67 120.62 11.57 121 10.55C121.87 8.2 125.08 7.84 127.03 8.17C128.69 8.45 130.51 9.14 132 10.21L132.53 9.86C133.11 9.48 133.6 9.1 134.12 8.69C137.12 6.33 139.97 4.1 157.35 4.1C157.85 4.1 158.25 4.51 158.25 5",
    /* the diamonds, hollow — an outer ring with the centre wound the other
       way, which is what makes the paper show through */
    "M109.59 7.75L112.33 5L109.59 2.26L106.84 5ZM114.5 5C114.5 5.24 114.41 5.47 114.24 5.64L110.22 9.66C110.05 9.83 109.83 9.92 109.59 9.92C109.35 9.92 109.12 9.83 108.95 9.66L104.93 5.64C104.76 5.47 104.67 5.24 104.67 5C104.67 4.76 104.76 4.54 104.93 4.37L108.95 .35C109.3 0 109.87 0 110.22 .35L114.24 4.37C114.41 4.54 114.5 4.77 114.5 5",
    "M161.37 7.75L164.11 5L161.37 2.26L158.63 5ZM166.28 5C166.28 5.24 166.19 5.47 166.02 5.64L162 9.66C161.83 9.83 161.6 9.92 161.37 9.92C161.13 9.92 160.9 9.83 160.73 9.66L156.71 5.64C156.36 5.29 156.36 4.72 156.71 4.37L160.73 .35C161.08 0 161.65 0 162 .35L166.02 4.37C166.19 4.54 166.28 4.76 166.28 5"
  ];

  function svgEl(tag, attrs) {
    var n = document.createElementNS(ORN_NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* One piece of the divider. `stretch` is the two rules: preserveAspectRatio
     "none" lets the box be any width and the path fills it, which is what
     makes a rule long or short. The motif is left on the default, so it is
     scaled by its height alone and comes out the same size on every course.

     className is read-only on an SVG element, so every attribute here goes
     through setAttribute — el() above cannot build these. */
  function ornPiece(cls, viewBox, paths, stretch) {
    var svg = svgEl("svg", {
      "class": cls,
      viewBox: viewBox,
      focusable: "false"
    });
    if (stretch) svg.setAttribute("preserveAspectRatio", "none");
    var ink = svgEl("g", { fill: "currentColor" });
    paths.forEach(function (d) { ink.appendChild(svgEl("path", { d: d })); });
    svg.appendChild(ink);
    return svg;
  }

  function ornament() {
    /* aria-hidden on the wrapper rather than on each piece: it says nothing —
       it is the space between two headings, made visible. */
    var orn = el("span", "course__orn");
    orn.setAttribute("aria-hidden", "true");
    orn.appendChild(ornPiece("orn__rule", ORN_RULE_L, [ORN_PATHS[0]], true));
    orn.appendChild(ornPiece("orn__motif", ORN_MOTIF, ORN_PATHS.slice(2), false));
    orn.appendChild(ornPiece("orn__rule", ORN_RULE_R, [ORN_PATHS[1]], true));
    return orn;
  }

  /* ── one course ──────────────────────────────── */

  function renderCourse(course) {
    var section = el("section", "course" + (course.sizes ? " course--sized" : ""));
    section.setAttribute("data-course", course.key);
    section.setAttribute("data-label", course.tabLabel);
    /* How many size columns this course draws. styles.css lays out both the
       header row and every price row from --cols, so setting it once here is
       what keeps the two grids in step — the coffee list is Small/Medium/Large
       and everything else is still Small/Large. data-cols is the same number as
       an attribute, because a selector cannot match on a custom property and
       the narrower cell for three columns has to be chosen in CSS. */
    if (course.sizes) {
      section.style.setProperty("--cols", String(course.sizes.length));
      section.setAttribute("data-cols", String(course.sizes.length));
    }

    var head = el("header", "course__head");
    head.appendChild(el("h2", null, course.heading));
    head.appendChild(ornament());
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
        if (kept) {
          /* A hand-written course gets the same divider as a generated one,
             from the same function — the art is not worth a second copy in the
             markup, and a copy is the thing that goes stale. */
          var staticHead = kept.querySelector(".course__head");
          if (staticHead && !staticHead.querySelector(".course__orn")) {
            var count = staticHead.querySelector(".course__count");
            staticHead.insertBefore(ornament(), count);
          }
          frag.appendChild(kept);
        } else missing.push(course.staticId);
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
     There is no photograph code here any more, and that is the design rather
     than an omission.

     This section used to replace an <img> src at runtime from whatever the
     database said, and everything the site grew around photographs existed to
     make that replacement invisible: a script in <head> that hid the slots
     about to change, an edge worker that rewrote the markup on the way out, a
     stamp in the seed file so the two would not both act. It worked, and it
     could always fail to work, because a swap that has to be *made* invisible
     can be caught. PHOTOGRAPHS.md §2 lists the eight ways it silently was.

     tools/bake-photos.mjs writes the owner's current photographs and their
     descriptions into the pages at build time, and the owner presses Publish
     to ask for a build. So the markup that leaves the server is already right
     and nothing needs to correct it afterwards. Nothing may set an img src
     after paint — that one line is the whole design, and putting a swap back
     here puts the blink back with it. See PHOTOGRAPHS.md §5.

     data.js still reads the photos table: the editor wants it, and the stamp
     that told the old runtime to stand down still tells the *bake* what it
     already baked. Nothing on a public page reads the result. */

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
