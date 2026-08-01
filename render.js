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

  /* ── go ──────────────────────────────────────── */

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

  try {
    renderBoard(host, SEED_MENU[page]);
  } catch (err) {
    /* Error-guarded like every other init step: a failure here must not take
       out the nav, the hours or the reveals that run after it. */
    if (window.console) console.error("render: menu board failed", err);
  }
})();
