/* ═══════════════════════════════════════════════
   AROMATI — the editor
   ═══════════════════════════════════════════════

   Phase 5. One page, one owner, no framework, no build step. Plain ES5 in a
   single IIFE, the same house style as script.js and render.js, because a CMS
   that looks bolted on is a CMS nobody trusts to be part of the site.

   ── the shape ──
   gate → tabs → panels → savebar. Signing in loads everything the owner can
   edit into memory once. Every panel edits that copy. Nothing reaches the
   database until *Save changes*, and *Discard changes* puts it all back.

   ── the one security rule ──
   Every node below is built with createElement and filled with textContent.
   Never innerHTML, never insertAdjacentHTML, not once, not for a value that
   obviously cannot contain markup. The owner's own text is the input here, so
   the rule protects the owner from a bad paste as much as from an attacker —
   and the moment there is one exception, the rule stops being checkable.

   An href is the same kind of sink. The ordering links are web addresses the
   owner pastes in, and `javascript:…` in one of them would run on click. The
   database refuses anything that is not https:// and so does the check below;
   deliberately both, because either one alone is a single point of failure.

   ── what the database is for ──
   The validation here exists to give the owner a sentence they can act on
   *before* a save is attempted. It is not the security boundary and it is not
   the last word: row level security decides what may be written, and the CHECK
   constraints and triggers decide what is well-formed. Where a rule appears in
   both places the wording is identical, copied from the migration — and
   tools/test-admin.mjs fails if the two ever drift apart.

   ── failure is partial and honest ──
   A save is a sequence of REST calls, not a transaction. If the ninth of
   fourteen is refused, the first eight really did happen. So each one that
   succeeds is folded into the baseline as it lands: what saved is saved and
   stops being marked as changed, what failed stays marked, and the message the
   database gave is shown as it was written. The editor never claims a state it
   has not confirmed. */

var AROMATI_ADMIN = (function () {
  "use strict";

  /* ═══════════════════════════════════════════════
     0. building blocks
     ═══════════════════════════════════════════════ */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function byId(id) { return document.getElementById(id); }

  function on(node, type, fn) { node.addEventListener(type, fn); }

  var DISCLOSURE_MS = 240;
  var STATUS_EXIT_MS = 220;

  function prefersReducedMotion() {
    return window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function nextFrame(fn) {
    if (window.requestAnimationFrame) window.requestAnimationFrame(fn);
    else window.setTimeout(fn, 0);
  }

  /* Keep the hidden attribute for real absence from the accessibility tree,
     but let the CSS grid row animate while a body is entering or leaving. */
  function setDisclosure(node, shouldOpen) {
    node._disclosureToken = (node._disclosureToken || 0) + 1;
    var token = node._disclosureToken;

    if (shouldOpen) {
      if (!node.hidden && node.classList.contains("is-open")) return;
      node.hidden = false;
      node.classList.remove("is-open");
      if (prefersReducedMotion()) {
        node.classList.add("is-open");
        return;
      }
      nextFrame(function () {
        if (node._disclosureToken === token && !node.hidden) {
          node.classList.add("is-open");
        }
      });
      return;
    }

    if (node.hidden) return;
    node.classList.remove("is-open");
    if (prefersReducedMotion()) {
      node.hidden = true;
      return;
    }

    var finished = false;
    var timer = 0;
    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      node.removeEventListener("transitionend", onEnd);
      if (node._disclosureToken === token) node.hidden = true;
    }
    function onEnd(event) {
      if (event.target === node && event.propertyName === "grid-template-rows") {
        finish();
      }
    }
    node.addEventListener("transitionend", onEnd);
    timer = window.setTimeout(finish, DISCLOSURE_MS + 80);
  }

  /* Trim for comparison, never for storage. An owner who typed a trailing
     space meant to; an owner who left one by accident cannot tell either way,
     and silently rewriting what someone typed is its own small betrayal. */
  function t(v) { return typeof v === "string" ? v.trim() : ""; }

  function isBlank(v) { return t(v).length === 0; }

  /* "07:00:00" from the database, "07:00" from <input type="time">. Postgres
     accepts either; the input element accepts only the second. */
  function toInputTime(v) {
    if (typeof v !== "string") return "";
    var m = /^(\d{1,2}):(\d{2})/.exec(v);
    return m ? (m[1].length === 1 ? "0" : "") + m[1] + ":" + m[2] : "";
  }

  function sameValue(a, b) {
    if (a === b) return true;
    /* null, undefined and "" all mean "nothing here" coming back from a form,
       and treating them as different would mark untouched fields as edited. */
    if ((a === null || a === undefined || a === "") &&
        (b === null || b === undefined || b === "")) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      return JSON.stringify(a || null) === JSON.stringify(b || null);
    }
    return false;
  }

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var PAGE_FILES = {
    index: "index.html",
    food: "menu-food.html",
    drinks: "menu-drinks.html",
    wine: "menu-wine.html",
    faq: "faq.html"
  };

  var PAGE_NAMES = {
    index: "Home page",
    food: "Food menu",
    drinks: "Drinks menu",
    wine: "Wine list",
    faq: "FAQ page"
  };


  /* ═══════════════════════════════════════════════
     1. what is loaded, and what has been changed
     ═══════════════════════════════════════════════

     Two copies of every row. `baseline` is what the database last confirmed;
     `draft` is what the owner is looking at. A field is changed when the two
     disagree, which means "changed" is derived rather than tracked — an edit
     typed and then typed back is not a change, and does not need to be
     un-flagged by anybody remembering to. */

  var TABLES = [
    "site_settings", "site_copy", "business_hours", "hours_exceptions",
    "menu_courses", "menu_items", "menu_item_pours", "faq_entries", "photos"
  ];

  /* The columns the editor may write. Everything else on those tables is the
     site's business, not the owner's: site_copy.label is the wording of the
     editor itself, menu_courses.is_static marks the Build Your Own block, and
     both are protected by triggers as well as by this list. */
  var WRITABLE = {
    site_settings:   ["value"],
    site_copy:       ["value"],
    business_hours:  ["is_closed", "opens_at", "closes_at", "note"],
    hours_exceptions: ["on_date", "is_closed", "opens_at", "closes_at", "note"],
    menu_courses:    ["page", "course_key", "tab_label", "heading", "sizes", "sort_order"],
    menu_items:      ["course_id", "name", "tag", "description", "price", "prices",
                      "price_all_sizes", "no_price", "sort_order"],
    menu_item_pours: ["item_id", "label", "price", "sort_order"],
    faq_entries:     ["question", "answer", "is_published", "sort_order"],
    /* A photo slot is a position in the markup. Which picture is in it and how
       it is described are the owner's; the slot name, the label and whether it
       is decoration are the page's, and only_photo_may_change() puts them back
       if anything here ever tries. */
    photos:          ["storage_path", "source_path", "alt", "width", "height"]
  };

  /* Where the owner may add and remove rows at all. site_settings, site_copy,
     business_hours and photos are absent on purpose: their row sets are decided
     by what the site renders, by there being seven days in a week, and by how
     many places the markup has a photograph in. The database has no insert or
     delete policy for them either. */
  var CAN_ADD = ["hours_exceptions", "menu_courses", "menu_items", "menu_item_pours", "faq_entries"];

  var sb = null;              // the Supabase client
  var account = null;         // the signed-in user
  var baseline = {};          // table → { id: row }
  var draft = {};             // table → [row], in display order
  var removed = {};           // table → [id] of rows the owner deleted
  var newRows = 0;            // counter behind the temporary ids

  var ui = {
    tab: "copy",
    section: {},              // tabId → which section of it the editor is showing
    open: {},                 // itemId → true when an item inside a section is expanded
    menuPage: "food",
    search: "",
    editing: false,           // narrow screens: the editor is covering the index
    fields: []                // every rendered field, for validation to reach
  };

  /* Whether anything has been written since the page opened. It is the
     difference between "No changes yet" and "All changes saved", and it is
     deliberately about this session only — the editor does not claim to know
     when the site last changed, because nothing on this page reports that. */
  var savedSomething = false;

  function tempId() { newRows += 1; return "new:" + newRows; }
  function isNew(row) { return typeof row.id === "string" && row.id.indexOf("new:") === 0; }

  function rowsOf(table) { return draft[table] || []; }

  function findRow(table, id) {
    var rows = rowsOf(table), i;
    for (i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  /* ── what has actually changed ─────────────── */

  function changedFields(table, row) {
    var was = baseline[table] && baseline[table][row.id];
    if (!was) return WRITABLE[table].slice();       // a new row is entirely new
    var out = [];
    WRITABLE[table].forEach(function (col) {
      if (!sameValue(row[col], was[col])) out.push(col);
    });
    return out;
  }

  function rowChanged(table, row) { return changedFields(table, row).length > 0; }

  function fieldChanged(table, row, col) {
    var was = baseline[table] && baseline[table][row.id];
    return !was || !sameValue(row[col], was[col]);
  }

  function changeCount() {
    var n = 0;
    TABLES.forEach(function (table) {
      rowsOf(table).forEach(function (row) { if (rowChanged(table, row)) n += 1; });
      n += (removed[table] || []).length;
    });
    return n;
  }


  /* ═══════════════════════════════════════════════
     2. rules — the wording is the database's own
     ═══════════════════════════════════════════════

     Every message below is copied verbatim from a `raise exception` in
     20260801000000_init_cms.sql. That is not tidiness: the owner should get
     the same sentence whether the editor caught it or the database did, and a
     rule that exists in only one of the two places is a rule that will be
     enforced inconsistently. tools/test-admin.mjs reads both files and fails
     if a message here is not in the migration. */

  var SETTING_RULES = [
    { key: /^phone_digits$/, ok: /^[0-9]{10}$/,
      message: "The phone number needs exactly 10 digits and nothing else — no spaces, brackets or dashes. For (332) 207-3847 enter 3322073847." },

    { key: /^phone_country$/, ok: /^[0-9]{1,3}$/,
      message: "The country code should be 1 to 3 digits. For the United States enter 1." },

    { key: /^email$/, ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
      message: "That does not look like an email address. It needs an @ and a dot after it, for example info@aromatinyc.com." },

    { key: /^instagram_handle$/, bad: /^@/,
      message: "Leave the @ off the Instagram handle — enter aromatinyc, not @aromatinyc. The site adds the @ where it shows one." },

    { key: /^instagram_handle$/, ok: /^[A-Za-z0-9._]{1,30}$/,
      message: "An Instagram handle can only use letters, numbers, dots and underscores." },

    /* Empty is allowed here and only here — it is how a delivery service is
       taken off the site. Which is why this rule reads "length > 0 and not
       https", exactly as the trigger does. */
    { key: /^order_[a-z0-9]+_url$/, ok: /^https:\/\//, allowEmpty: true,
      message: "An ordering link has to be the whole web address, starting with https:// — paste it from the address bar. To remove the service from the site, clear this field instead." },

    { key: /^address_region$/, ok: /^[A-Z]{2}$/,
      message: "The state should be its two-letter abbreviation in capitals, for example NY." },

    { key: /^address_postal$/, ok: /^[0-9]{5}(-[0-9]{4})?$/,
      message: "The ZIP code should be 5 digits, for example 10016." }
  ];

  /* The migration writes this with a %s for the label. Same sentence, same
     substitution. */
  function mustNotBeEmpty(label) {
    return 'The field "' + label + '" cannot be left empty — it appears on every page.';
  }

  function settingProblem(row) {
    var value = t(row.value);
    var i, rule;

    for (i = 0; i < SETTING_RULES.length; i++) {
      rule = SETTING_RULES[i];
      if (!rule.key.test(row.key)) continue;
      if (value.length === 0 && rule.allowEmpty) continue;
      if (value.length === 0) continue;                     // the empty check below owns this
      if (rule.bad && rule.bad.test(value)) return rule.message;
      if (rule.ok && !rule.ok.test(value)) return rule.message;
    }

    if (row.is_editable && value.length === 0 && !/^order_[a-z0-9]+_url$/.test(row.key)) {
      return mustNotBeEmpty(row.label);
    }
    return null;
  }

  /* site_copy carries its own two rules, both about how the value renders
     rather than what it means. An odd number of asterisks leaves one on the
     page as a literal character, because render.js only pairs them up. */
  function copyProblem(row) {
    var value = typeof row.value === "string" ? row.value : "";
    var stars = value.length - value.replace(/\*/g, "").length;

    if (stars % 2 !== 0) {
      return "There is an odd number of * characters here. They work in pairs — " +
             "*like this* makes italics — so one on its own would show up on the page " +
             "as a star.";
    }
    if (row.max_length && value.length > row.max_length) {
      return "This is " + value.length + " characters and the limit is " + row.max_length +
             ". It is a headline the page animates word by word, and past this length " +
             "it pushes the section below it down.";
    }
    return null;
  }


  /* ═══════════════════════════════════════════════
     3. fields
     ═══════════════════════════════════════════════

     A field knows three things the panels should not have to: how to show that
     it has been edited, how to show a problem, and how to be found again when
     the savebar needs to open the card it is hiding in. */

  function makeField(spec) {
    var f = {
      table: spec.table, row: spec.row, col: spec.col,
      cardId: spec.cardId, openId: spec.openId, tab: spec.tab, label: spec.label
    };

    /* Kept rather than baked into className, because the mark-as-edited pass
       below rewrites className wholesale and would otherwise quietly drop a
       layout class a panel had added. */
    var extra = spec.extra ? " " + spec.extra : "";

    var wrap = el("label", "field" + extra);
    var labelNode = el("span", "field__label", spec.label);
    wrap.appendChild(labelNode);

    var input;
    if (spec.type === "textarea") {
      input = el("textarea", "field__area");
      input.rows = spec.rows || 3;
      input.value = spec.value === null || spec.value === undefined ? "" : String(spec.value);
    } else if (spec.type === "select") {
      input = el("select", "field__select");
      (spec.options || []).forEach(function (opt) {
        var o = el("option", null, opt.label);
        o.value = opt.value;
        input.appendChild(o);
      });
      input.value = spec.value;
    } else {
      input = el("input", "field__input");
      input.type = spec.type || "text";
      input.value = spec.value === null || spec.value === undefined ? "" : String(spec.value);
      if (spec.placeholder) input.placeholder = spec.placeholder;
    }
    if (spec.disabled) input.disabled = true;

    var picker = null;
    if (spec.type === "time" && !spec.disabled) {
      wirePickerViewport();
    }
    if (spec.type === "time" && !spec.disabled && desktopTimePicker()) {
      picker = makeTimePicker(input, function (value) {
        input.value = value;
        if (spec.onInput) spec.onInput(value, f);
        refreshMark();
        updateSavebar();
      });
      wrap.appendChild(picker.shell);
      /* The shell owns both the input and its panel, which keeps Opens and
         Closes anchored to their respective controls. */
    } else {
      wrap.appendChild(input);
    }

    var counter = null;
    if (spec.max) {
      counter = el("span", "field__count");
      labelNode.appendChild(counter);
    }

    if (spec.help) wrap.appendChild(el("span", "field__help", spec.help));

    var note = el("span", "field__note");
    note.hidden = true;
    wrap.appendChild(note);

    var error = el("span", "field__error");
    error.hidden = true;
    wrap.appendChild(error);

    var editedExitToken = 0;

    f.wrap = wrap;
    f.input = input;
    f.picker = picker;

    f.setError = function (message) {
      error.textContent = message || "";
      error.hidden = !message;
      if (message) wrap.className = "field field--bad" + extra;
      else refreshMark();
    };

    f.setNote = function (message, warn) {
      note.textContent = message || "";
      note.hidden = !message;
      note.className = warn ? "field__note field__note--warn" : "field__note";
    };

    function refreshMark() {
      var edited = f.row && f.col && fieldChanged(f.table, f.row, f.col);
      var wasEdited = wrap.classList.contains("field--edited") ||
        wrap.classList.contains("field--edited-leaving");
      if (edited) {
        editedExitToken += 1;
        wrap.className = "field field--edited" + extra;
      } else if (wasEdited) {
        var token = ++editedExitToken;
        wrap.className = "field field--edited-leaving" + extra;
        if (prefersReducedMotion()) {
          wrap.className = "field" + extra;
        } else {
          window.setTimeout(function () {
            if (editedExitToken === token &&
                !(f.row && f.col && fieldChanged(f.table, f.row, f.col))) {
              wrap.className = "field" + extra;
            }
          }, STATUS_EXIT_MS);
        }
      } else {
        wrap.className = "field" + extra;
      }
      if (counter) {
        var len = String(input.value).length;
        counter.textContent = len + " / " + spec.max;
        counter.className = "field__count" + (len > spec.max ? " field__count--over" : "");
      }
    }
    f.refresh = refreshMark;

    /* cardId is the section the field lives in. Reaching a field from the
       problems list means selecting that section in the index — and, if the
       field is inside a menu item, expanding the one item too. A problem the
       owner is sent to and cannot see is not a problem they were told about. */
    f.focus = function () {
      openTab(f.tab);
      if (f.cardId) selectSection(f.tab, f.cardId);
      if (f.openId) ui.open[f.openId] = true;
      renderAll();
      /* Re-rendering built a new node, so the field to focus is the one now on
         the page with the same identity — not the one this closure captured. */
      var live = findField(f.table, f.row && f.row.id, f.col);
      if (live) {
        live.input.focus();
        live.input.scrollIntoView({ block: "center" });
      }
    };

    on(input, "input", function () {
      if (spec.onInput) spec.onInput(input.value, f);
      refreshMark();
      updateSavebar();
    });
    if (spec.type === "select" || spec.type === "date" || spec.type === "time") {
      on(input, "change", function () {
        if (spec.onInput) spec.onInput(input.value, f);
        refreshMark();
        updateSavebar();
      });
    }

    refreshMark();
    ui.fields.push(f);
    return f;
  }

  function findField(table, id, col) {
    var i;
    for (i = 0; i < ui.fields.length; i++) {
      var f = ui.fields[i];
      if (f.table === table && f.col === col && f.row && f.row.id === id) return f;
    }
    return null;
  }

  /* ── the desktop time picker ─────────────────
     The field stays a real <input type="time"> and holds the value in the one
     format the row wants. Desktop gets the branded rolling dial below; mobile
     never creates this control, so the operating system owns the time picker.

     The panel used to open in the flow rather than over it, because the old
     accordion body clipped its own overflow to animate. There is no accordion
     around a field any more, so it hangs below the input like a dropdown
     should. The control itself is unchanged — same markup, same dials, same
     keys — only where it lands moved. */

  var MINUTE_STEP = 5;
  var DIAL_CYCLES = 9;
  var DIAL_MIDDLE_CYCLE = 4;
  var pickerCount = 0;
  var openPicker = null;        // the one panel showing, if any
  var pickerDocWired = false;
  var pickerViewportWired = false;
  var pickerViewportDesktop = null;

  function desktopTimePicker() {
    return !!(window.matchMedia &&
      window.matchMedia("(min-width: 641px) and (hover: hover) and (pointer: fine)").matches);
  }

  function wirePickerViewport() {
    if (pickerViewportWired) return;
    pickerViewportWired = true;
    pickerViewportDesktop = desktopTimePicker();
    on(window, "resize", function () {
      var next = desktopTimePicker();
      if (next === pickerViewportDesktop) return;
      pickerViewportDesktop = next;
      if (openPicker) openPicker.close(false);
      if (account) renderAll(false, true);
    });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function parseTime(v) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(v === null || v === undefined ? "" : v));
    if (!m) return null;
    var h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return { h: h, m: min };
  }

  function clockGlyph() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "timefield__glyph");
    svg.setAttribute("aria-hidden", "true");
    var face = document.createElementNS(NS, "circle");
    face.setAttribute("cx", "12");
    face.setAttribute("cy", "12");
    face.setAttribute("r", "8.5");
    var hands = document.createElementNS(NS, "path");
    hands.setAttribute("d", "M12 7.3V12l3.3 2");
    svg.appendChild(face);
    svg.appendChild(hands);
    return svg;
  }

  function wirePickerDismissal() {
    if (pickerDocWired) return;
    pickerDocWired = true;
    /* mousedown rather than click: a click that lands outside should close the
       panel before whatever it landed on does its own work. */
    document.addEventListener("mousedown", function (e) {
      if (openPicker && !openPicker.holds(e.target)) openPicker.close(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && openPicker) openPicker.close(true);
    });
  }

  function makeTimePicker(input, onPick) {
    var panelId = "tpick" + (pickerCount += 1);
    var opts = [];              // every option button now on the page
    var selected = { h: null, m: null, ap: null };
    var api;

    input.classList.add("field__input--time");

    var shell = el("div", "timefield");
    var control = el("div", "timefield__control");
    control.appendChild(input);

    var toggle = el("button", "timefield__toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Choose a time");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", panelId);
    toggle.appendChild(clockGlyph());
    control.appendChild(toggle);
    shell.appendChild(control);

    var panel = el("div", "tpick");
    panel.id = panelId;
    panel.hidden = true;
    var clip = el("div", "tpick__clip");
    var cols = el("div", "tpick__cols");
    clip.appendChild(cols);
    panel.appendChild(clip);
    shell.appendChild(panel);

    /* An empty field still has to offer somewhere to start, but nothing is
       written until something is picked — `empty` is what keeps the columns
       from showing 7:00 AM as though it were already the answer. */
    function parts() {
      var p = parseTime(input.value);
      var v = p || { h: 7, m: 0 };
      var h12 = v.h % 12;
      return {
        h12: h12 === 0 ? 12 : h12,
        m: v.m,
        ap: v.h < 12 ? "AM" : "PM",
        empty: !p
      };
    }

    function recordFor(kind, value, cycle) {
      var found = opts.filter(function (rec) {
        return rec.kind === kind && rec.value === value &&
          (cycle === undefined || rec.cycle === cycle);
      });
      if (found.length) return found[0];
      return opts.filter(function (rec) {
        return rec.kind === kind && rec.value === value;
      })[0] || null;
    }

    function syncSelection() {
      var now = parts();
      if (now.empty) {
        selected.h = null;
        selected.m = null;
        selected.ap = null;
        return;
      }
      selected.h = recordFor("h", now.h12, DIAL_MIDDLE_CYCLE);
      selected.m = recordFor("m", now.m, DIAL_MIDDLE_CYCLE);
      selected.ap = recordFor("ap", now.ap, DIAL_MIDDLE_CYCLE);
    }

    function commit(next, rec, centreChoice) {
      var h = next.h12 % 12;
      if (next.ap === "PM") h += 12;
      onPick(pad2(h) + ":" + pad2(next.m));
      ["h", "m", "ap"].forEach(function (kind) {
        if (kind === rec.kind) selected[kind] = rec;
      });
      var now = parts();
      selected.h = selected.h || recordFor("h", now.h12, DIAL_MIDDLE_CYCLE);
      selected.m = selected.m || recordFor("m", now.m, DIAL_MIDDLE_CYCLE);
      selected.ap = selected.ap || recordFor("ap", now.ap, DIAL_MIDDLE_CYCLE);
      if (centreChoice) {
        selected[rec.kind] = recordFor(rec.kind, rec.value, DIAL_MIDDLE_CYCLE) || rec;
      }
      mark();
      if (centreChoice) centre(selected[rec.kind]);
    }

    function choose(rec, centreChoice) {
      var now = parts();
      commit({
        h12: rec.kind === "h" ? rec.value : now.h12,
        m:   rec.kind === "m" ? rec.value : now.m,
        ap:  rec.kind === "ap" ? rec.value : now.ap
      }, rec, centreChoice);
    }

    function mark() {
      var reachable = {};
      opts.forEach(function (rec) {
        var on_ = selected[rec.kind] === rec;
        rec.node.className = "tpick__opt" + (on_ ? " tpick__opt--on" : "");
        rec.node.setAttribute("aria-selected", on_ ? "true" : "false");
        rec.node.tabIndex = on_ ? 0 : -1;
        if (on_) reachable[rec.kind] = true;
      });
      /* Every column keeps one tab stop, so a column with nothing chosen in it
         is still reachable from the keyboard. */
      ["h", "m", "ap"].forEach(function (kind) {
        if (reachable[kind]) return;
        var first = opts.filter(function (rec) { return rec.kind === kind; })[0];
        if (first) first.node.tabIndex = 0;
      });
    }

    function centre(rec) {
      var list = rec.list;
      var height = list.clientHeight || 160;
      var rowHeight = rec.node.offsetHeight || 32;
      list.scrollTop = Math.max(0, rec.node.offsetTop - (height - rowHeight) / 2);
    }

    function keys(e, rec) {
      var order = ["h", "m", "ap"];
      var sibs = opts.filter(function (o) { return o.kind === rec.kind; });
      var i = sibs.indexOf(rec);

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var direction = e.key === "ArrowDown" ? 1 : -1;
        var nextIndex = (i + direction + sibs.length) % sibs.length;
        var step = sibs[nextIndex];
        e.preventDefault();
        choose(step, true);
        step.node.focus();
        centre(step);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        var edge = e.key === "Home" ? sibs[0] : sibs[sibs.length - 1];
        choose(edge, true);
        edge.node.focus();
        centre(edge);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        var k = order.indexOf(rec.kind) + (e.key === "ArrowRight" ? 1 : -1);
        if (k < 0 || k >= order.length) return;
        e.preventDefault();
        var over = opts.filter(function (o) {
          return o.kind === order[k] && o.node.tabIndex === 0;
        })[0];
        if (over) over.node.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(rec, true);
        api.close(true);
      }
    }

    function keepDialInRange(list) {
      var cycle = list._cycleHeight;
      var max = list.scrollHeight - list.clientHeight;
      if (!cycle || max <= 0) return;
      if (list.scrollTop < cycle) list.scrollTop += cycle * 3;
      else if (list.scrollTop > max - cycle) list.scrollTop -= cycle * 3;
    }

    function nearestDialOption(list) {
      var centrePoint = list.scrollTop + (list.clientHeight || 160) / 2;
      var best = null;
      var distance = Infinity;
      (list._records || []).forEach(function (rec) {
        var rowCentre = rec.node.offsetTop + (rec.node.offsetHeight || 32) / 2;
        var nextDistance = Math.abs(rowCentre - centrePoint);
        if (nextDistance < distance) {
          best = rec;
          distance = nextDistance;
        }
      });
      return best;
    }

    function wireDialScroll(list) {
      on(list, "scroll", function () {
        keepDialInRange(list);
        if (list._scrollTimer) window.clearTimeout(list._scrollTimer);
        list._scrollTimer = window.setTimeout(function () {
          var nearest = nearestDialOption(list);
          if (nearest) choose(nearest, false);
        }, 80);
      });
    }

    function wireStackScroll(list) {
      on(list, "scroll", function () {
        if (list._scrollTimer) window.clearTimeout(list._scrollTimer);
        list._scrollTimer = window.setTimeout(function () {
          var nearest = nearestDialOption(list);
          if (nearest) choose(nearest, true);
        }, 80);
      });
    }

    /* Rebuilt on every open rather than once, because a minute typed straight
       into the field — 07:12, which no five-minute step lands on — should be in
       the column the owner is about to look at. Nine repeated cycles make the
       wheel feel continuous; the scroll handler quietly moves it back toward
       the middle before the user can reach an edge. */
    function build() {
      clear(cols);
      opts.length = 0;

      var now = parts();
      var hours = [12];
      var h;
      for (h = 1; h <= 11; h++) hours.push(h);

      var minutes = [];
      var m;
      for (m = 0; m < 60; m += MINUTE_STEP) minutes.push(m);
      if (!now.empty && minutes.indexOf(now.m) < 0) {
        minutes.push(now.m);
        minutes.sort(function (a, b) { return a - b; });
      }

      [
        { cap: "Hour", kind: "h", values: hours },
        { cap: "Min", kind: "m", values: minutes },
        { cap: "", kind: "ap", values: ["AM", "PM"] }
      ].forEach(function (col) {
        var group = el("div", "tpick__group");
        /* Keep the blank AM/PM heading the same height as Hour and Min so its
           centered two-choice stack shares their selection line. */
        group.appendChild(el("span", "tpick__cap", col.cap || "\u00a0"));

        var list = el("div", "tpick__col" + (col.kind === "ap" ? " tpick__col--ap" : ""));
        list._records = [];
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-label", col.cap === "Hour" ? "Hour"
          : col.cap === "Min" ? "Minute" : "Morning or afternoon");

        var cycles = col.kind === "ap" ? 1 : DIAL_CYCLES;
        var cycle;
        for (cycle = 0; cycle < cycles; cycle++) {
          col.values.forEach(function (value) {
            var b = el("button", "tpick__opt", col.kind === "m" ? pad2(value) : String(value));
            b.type = "button";
            b.setAttribute("role", "option");
            b.tabIndex = -1;
            var rec = {
              node: b, kind: col.kind, value: value, list: list, cycle: cycle
            };
            opts.push(rec);
            list._records.push(rec);
            on(b, "click", function () { choose(rec, true); });
            on(b, "keydown", function (e) { keys(e, rec); });
            list.appendChild(b);
          });
        }

        group.appendChild(list);
        cols.appendChild(group);
        var first = list._records[0];
        var nextCycle = list._records[col.values.length];
        var measuredCycle = nextCycle && first
          ? nextCycle.node.offsetTop - first.node.offsetTop : 0;
        if (col.kind === "ap") {
          /* AM/PM is a short, two-choice stack. It follows the same centered
             selection as the dials, but never repeats or wraps around. */
          list._cycleHeight = 0;
          wireStackScroll(list);
        } else {
          list._cycleHeight = measuredCycle || col.values.length * 32;
          wireDialScroll(list);
        }
      });

      syncSelection();
      mark();
    }

    /* Showing is not the same question as `panel.hidden`: a panel on its way
       out is still in the document for the length of the animation, and a
       second click in that moment means open it again, not leave it closing. */
    var showing = false;

    api = {
      shell: shell,
      panel: panel,
      holds: function (node) { return shell.contains(node) || panel.contains(node); },
      open: function () {
        if (showing) return;
        showing = true;
        if (openPicker && openPicker !== api) openPicker.close(false);
        build();
        setDisclosure(panel, true);
        toggle.setAttribute("aria-expanded", "true");
        openPicker = api;
        /* After a frame, so the column has the height the scroll is measured
           against rather than the zero it opens from. */
        nextFrame(function () {
          ["h", "m", "ap"].forEach(function (kind) {
            if (selected[kind]) centre(selected[kind]);
          });
        });
      },
      close: function (focusBack) {
        if (!showing) return;
        showing = false;
        setDisclosure(panel, false);
        toggle.setAttribute("aria-expanded", "false");
        if (openPicker === api) openPicker = null;
        if (focusBack) input.focus();
      }
    };

    on(toggle, "click", function (e) {
      /* The clock lives inside makeField's <label>. Cancel the label's default
         activation so iOS cannot pass this click through to the time input.
         When the owner is closing our picker, do not focus that input either:
         focusing a time input is itself enough to open iOS's native picker. */
      e.preventDefault();
      if (showing) api.close(false);
      else api.open();
    });

    /* Typed and picked are the same value seen two ways, so the columns follow
       the field rather than only the other way round. */
    on(input, "input", function () {
      if (showing) {
        syncSelection();
        mark();
      }
    });

    wirePickerDismissal();
    return api;
  }

  function makeCheck(labelText, checked, onChange) {
    var wrap = el("label", "check");
    var input = el("input");
    input.type = "checkbox";
    input.checked = !!checked;
    on(input, "change", function () { onChange(input.checked); });
    wrap.appendChild(input);
    wrap.appendChild(el("span", null, labelText));
    return { wrap: wrap, input: input };
  }

  /* ── cards ─────────────────────────────────────
     A card is now a plain container. Nothing folds: the index decides what is
     on screen, and what is on screen is open. */

  function makeCard(title) {
    var wrap = el("section", "card");
    if (title) wrap.appendChild(el("h3", "card__title", title));
    var body = el("div", "card__body");
    wrap.appendChild(body);
    return { wrap: wrap, body: body };
  }

  /* The one gold-tinted aside a panel is allowed. Text, or a build-it-yourself
     function for the two places that need a bold lead-in. */
  function makeNote(fill) {
    var note = el("p", "note");
    if (typeof fill === "function") fill(note);
    else note.textContent = fill;
    return note;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }


  /* ═══════════════════════════════════════════════
     4. the panels
     ═══════════════════════════════════════════════ */

  /* A panel no longer renders itself. It lists its sections — label, counts,
     what has changed inside, and a render for the one the owner picked — and
     the three panes are built from that list. The index is the list; the
     editor is one entry of it. */

  var PANELS = [
    { id: "copy",    name: "Words",   sections: copySections, note: copyNote },
    { id: "hours",   name: "Hours",   sections: hoursSections },
    { id: "contact", name: "Contact", sections: contactSections },
    { id: "menu",    name: "Menus",   sections: menuSections,
      indexHead: menuIndexHead, refreshHead: menuRefreshHead,
      indexFoot: menuIndexFoot,
      emptyIndex: "This page has no sections yet." },
    { id: "photos",  name: "Photos",  sections: photoSections,
      emptyIndex: "No photograph slots yet.",
      emptyEditor: "No photograph slots in the database yet. The site is showing " +
        "the pictures in its own markup, which is correct — but nothing here can " +
        "be changed until the photographs migration has been run." },
    { id: "faq",     name: "FAQ",     sections: faqSections,
      note: faqNote, indexFoot: faqIndexFoot,
      emptyIndex: "No questions yet." }
  ];

  function panelChangeCount(id) {
    var tables = {
      copy: ["site_copy"],
      hours: ["business_hours", "hours_exceptions"],
      contact: ["site_settings"],
      menu: ["menu_courses", "menu_items", "menu_item_pours"],
      photos: ["photos"],
      faq: ["faq_entries"]
    }[id] || [];
    var n = 0;
    tables.forEach(function (table) {
      rowsOf(table).forEach(function (row) { if (rowChanged(table, row)) n += 1; });
      n += (removed[table] || []).length;
    });
    return n;
  }

  /* Which tab is open is a place in the editor, not content, so it lives in the
     browser rather than the database. A reload — after a save, after the laptop
     woke up, after a wrong click — should put the owner back where they were
     and not at Words. localStorage throws outright in a locked-down Safari, so
     both halves are wrapped and both fail to the old behaviour. */
  var TAB_KEY = "aromati.admin.tab";
  var SECTION_KEY = "aromati.admin.section";

  function openTab(id) {
    ui.tab = id;
    /* On a narrow screen the index and the editor take turns. Arriving in an
       area means arriving at its list, not at whatever was last open in it. */
    ui.editing = false;
    try { window.localStorage.setItem(TAB_KEY, id); } catch (e) { /* not fatal */ }
  }

  function restoreTab() {
    var saved;
    try { saved = window.localStorage.getItem(TAB_KEY); } catch (e) { return; }
    var known = PANELS.filter(function (p) { return p.id === saved; }).length > 0;
    if (known) ui.tab = saved;
  }

  /* Which section is showing is a place too, and there is one per area, so a
     trip to Hours and back lands on the same words as before. A section id
     that no longer exists — a deleted menu section, a renamed group — falls
     back to the first one rather than to an empty pane. */
  function selectSection(tab, id) {
    ui.section[tab] = id;
    ui.editing = true;
    try {
      window.localStorage.setItem(SECTION_KEY, JSON.stringify(ui.section));
    } catch (e) { /* not fatal */ }
  }

  function restoreSections() {
    var raw;
    try { raw = window.localStorage.getItem(SECTION_KEY); } catch (e) { return; }
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }
    if (!parsed || typeof parsed !== "object") return;
    PANELS.forEach(function (panel) {
      if (typeof parsed[panel.id] === "string") ui.section[panel.id] = parsed[panel.id];
    });
  }

  /* The dot is inside the button, so it changes the button's width — and the
     gold wash behind the chosen area is sized from that width. Every path that
     puts a dot in or takes one out has to say so, including the one that runs
     a fifth of a second later when the exit animation has finished. Otherwise
     the wash grows with the first edit and never shrinks back. */
  function setTabDot(tab, hasChange) {
    var dot = tab.querySelector(".tab__dot");
    if (hasChange) {
      if (dot) {
        dot._exitToken = (dot._exitToken || 0) + 1;
        dot.classList.remove("tab__dot--leaving");
      } else {
        tab.appendChild(el("span", "tab__dot"));
        positionRailMark(tab.parentNode);
      }
      return;
    }
    if (!dot || dot.classList.contains("tab__dot--leaving")) return;

    var token = (dot._exitToken || 0) + 1;
    dot._exitToken = token;
    dot.classList.add("tab__dot--leaving");
    function remove() {
      if (dot._exitToken !== token || dot.parentNode !== tab) return;
      tab.removeChild(dot);
      positionRailMark(tab.parentNode);
    }
    if (prefersReducedMotion()) remove();
    else window.setTimeout(remove, STATUS_EXIT_MS);
  }

  /* ── the rail ──────────────────────────────── */

  function makeTab(panel) {
    var b = el("button", "tab");
    b.type = "button";
    b.appendChild(el("span", "tab__name", panel.name));
    b.appendChild(el("span", "tab__count"));
    on(b, "click", function () { openTab(panel.id); renderAll("tab"); });
    return b;
  }

  /* The gold wash behind the chosen area is one element that moves, not a
     background that turns on and off. It is set through the CSSOM rather than
     a style attribute — style-src 'self' drops the attribute, and would drop
     it silently in production and nowhere else. */
  function positionRailMark(host) {
    if (!host || host.offsetParent === null) return;   // hidden pane, see above
    var active = host.querySelector('.tab[aria-selected="true"]');
    if (!active) return;
    var first = !host._markReady;
    host.style.setProperty("--rail-mark-x", active.offsetLeft + "px");
    host.style.setProperty("--rail-mark-y", active.offsetTop + "px");
    host.style.setProperty("--rail-mark-w", active.offsetWidth + "px");
    host.style.setProperty("--rail-mark-h", active.offsetHeight + "px");
    if (first) {
      /* Paint the first position before transitions are allowed, or a reload
         animates the wash in from the corner of the rail. */
      host.offsetWidth;
      host.classList.add("rail__list--ready");
      host._markReady = true;
    }
  }

  function wireRailMark(host) {
    if (host._markWired) return;
    host._markWired = true;
    on(window, "resize", function () { positionRailMark(host); });
  }

  function wireIndexMark(host) {
    if (host._markWired) return;
    host._markWired = true;
    on(window, "resize", function () {
      positionIndexMark(host, host.querySelector(".index__row--on"));
    });
  }

  function renderRail() {
    var host = byId("tabs");
    wireRailMark(host);

    if (host.children.length !== PANELS.length) {
      clear(host);
      PANELS.forEach(function (panel) { host.appendChild(makeTab(panel)); });
    }

    PANELS.forEach(function (panel, i) {
      var b = host.children[i];
      b.querySelector(".tab__name").textContent = panel.name;
      b.querySelector(".tab__count").textContent = panel.sections().length;
      b.setAttribute("aria-selected", ui.tab === panel.id ? "true" : "false");
      setTabDot(b, panelChangeCount(panel.id) > 0);
    });

    positionRailMark(host);
  }

  /* ── the index ─────────────────────────────── */

  function indexRow(section, current) {
    var selected = !!(current && current.id === section.id);
    var row = el("div", "index__row" + (selected ? " index__row--on" : ""));
    row.setAttribute("data-section", section.id);

    var pick = el("button", "index__pick");
    pick.type = "button";
    pick.setAttribute("aria-current", selected ? "true" : "false");

    /* Gold when something inside it is unsaved, maroon when it is the one
       being edited, pale otherwise. Unsaved wins over selected: the dot is
       there to find work that is not finished, and the selected row is
       already obvious from its fill. */
    pick.appendChild(el("span", "index__dot index__dot--" +
      (section.changed > 0 ? "dirty" : selected ? "here" : "clean")));
    pick.appendChild(el("span", "index__label", section.label));
    if (section.count) pick.appendChild(el("span", "index__count", section.count));

    on(pick, "click", function () {
      selectSection(ui.tab, section.id);
      renderAll(true);
    });
    row.appendChild(pick);

    if (section.extra) section.extra(row);
    return row;
  }

  /* The tan fill under the chosen section slides between rows, the same way
     the rail's gold wash does — one element positioned from the row's own
     geometry, through the CSSOM rather than a style attribute. With nothing
     chosen it has no size, which is how it stays out of an empty list. */
  function positionIndexMark(host, row) {
    /* Measuring a pane that is not on screen returns zero for everything, and
       writing that down would mean the fill grew back from nothing the next
       time the pane appeared. Leave what it had. */
    if (!host || host.offsetParent === null) return;
    if (!row) {
      host.style.setProperty("--index-mark-h", "0px");
      host.style.setProperty("--index-mark-o", "0");
      return;
    }
    host.style.setProperty("--index-mark-x", row.offsetLeft + "px");
    host.style.setProperty("--index-mark-y", row.offsetTop + "px");
    host.style.setProperty("--index-mark-w", row.offsetWidth + "px");
    host.style.setProperty("--index-mark-h", row.offsetHeight + "px");
    host.style.setProperty("--index-mark-o", "1");
  }

  /* Which area the marker was last placed in. Moving between areas replaces
     every row in the list, so the fill lands on the new one rather than
     travelling across a list that is not there any more. */
  var indexMarkTab = null;

  /* And which area's controls are sitting above the list right now. */
  var indexHeadPanel = null;

  /* Setting a class that is already on an element restarts nothing. The editor
     pane gets a brand new node every pass so it never notices, but the index
     list is one long-lived element — Food → Drinks → Wine would animate once
     and then quietly stop. The class comes off, the layout is read so the
     removal actually lands, and it goes back on. */
  function replayEnter(node, cls) {
    node.classList.remove(cls);
    node.offsetWidth;
    node.classList.add(cls);
  }

  function renderIndex(panel, sections, current, animateList) {
    byId("indexTitle").textContent = panel.name;


    /* The head is rebuilt only when the area changes. Two reasons: the pill
       cannot slide between two positions if the element doing the sliding is
       a different element each time, and the search box keeps what is in it
       and where the cursor is instead of being replaced underneath the
       person typing. */
    var tools = byId("indexTools");
    if (indexHeadPanel !== panel.id) {
      clear(tools);
      indexHeadPanel = panel.id;
      if (panel.indexHead) panel.indexHead(tools);
    } else if (panel.refreshHead) {
      panel.refreshHead(tools);
    }

    var list = byId("indexList");
    wireIndexMark(list);
    clear(list);

    /* It slides only when the rows it is sliding between are the same rows —
       so within one area, and not on the pass that animates the whole list in
       from underneath it. */
    var slide = indexMarkTab === panel.id && !animateList;
    list.className = "index__list" + (slide ? " index__list--ready" : "");

    var chosen = null;
    var lastGroup = null;
    sections.forEach(function (section) {
      if (section.group && section.group !== lastGroup) {
        lastGroup = section.group;
        list.appendChild(el("p", "index__group", section.group));
      }
      var row = indexRow(section, current);
      if (current && current.id === section.id) chosen = row;
      list.appendChild(row);
    });

    if (!sections.length) {
      list.appendChild(el("p", "empty", panel.emptyIndex || "Nothing here yet."));
    }

    positionIndexMark(list, chosen);
    indexMarkTab = panel.id;
    if (animateList) replayEnter(list, "index__list--enter");

    /* A render that had to snap still allows the fill to slide afterwards.
       Filtering the list with the search box moves rows without re-rendering,
       and that move should be watchable even if arriving here was not. The
       class is set fresh by the next render, so this cannot leak into it. */
    if (!slide) {
      nextFrame(function () { list.classList.add("index__list--ready"); });
    }

    var foot = byId("indexFoot");
    clear(foot);
    if (panel.indexFoot) panel.indexFoot(foot);
  }

  /* ── the editor pane ───────────────────────── */

  function renderEditor(panel, section, animate) {
    var host = byId("panels");
    clear(host);

    var page = el("div", "editor__page" + (animate ? " editor__page--enter" : ""));

    var head = el("header", "editor__head");
    var back = el("button", "editor__back");
    back.type = "button";
    back.appendChild(el("span", "editor__back-go", "←"));
    back.appendChild(el("span", null, "All " + panel.name.toLowerCase()));
    /* Going back is a move, not a redraw. On a narrow screen the index has
       been off-screen entirely, so it arrives rather than appears. */
    on(back, "click", function () { ui.editing = false; renderAll("back"); });
    head.appendChild(back);

    if (section) {
      if (section.group) head.appendChild(el("p", "editor__eyebrow", section.group));
      head.appendChild(el("h1", "editor__title", section.label));
      if (section.describe) head.appendChild(el("p", "editor__lede", section.describe));
    } else {
      head.appendChild(el("h1", "editor__title", panel.name));
    }
    page.appendChild(head);

    var body = el("div", "editor__body");
    if (panel.note) body.appendChild(panel.note());
    if (section) section.render(body);
    else body.appendChild(el("p", "empty", panel.emptyEditor || "Nothing to edit here yet."));
    page.appendChild(body);

    host.appendChild(page);
  }

  function currentPanel() {
    return PANELS.filter(function (p) { return p.id === ui.tab; })[0] || PANELS[0];
  }

  function currentSection(sections) {
    var want = ui.section[ui.tab];
    var found = sections.filter(function (s) { return s.id === want; })[0];
    return found || sections[0] || null;
  }

  function renderAll(animate, preserveScroll) {
    /* Whatever picker was open belonged to nodes this pass is about to throw
       away. Forgetting it here is the difference between "no panel is open" and
       "a panel is open, in a document that no longer contains it". */
    openPicker = null;

    var scroller = byId("panels");
    var scrollTop = preserveScroll ? scroller.scrollTop : null;
    ui.fields = [];

    var panel = currentPanel();
    var sections = panel.sections();
    var section = currentSection(sections);

    /* Which pane is showing is decided before anything is drawn, and not
       after. Under 900px the one that is not showing is display:none, and an
       element with no box measures zero — so a pass that drew first and
       switched panes second would size the sliding pill and the index fill
       against a pane that was still hidden, and leave both collapsed. */
    byId("shell").className = "shell" + (ui.editing ? " shell--editing" : "");

    /* Four kinds of move, and each one animates only what actually moved:

         true          a different section — the editor pane changes
         "tab"         a different area — the index and the editor both change
         "menu-list"   a different menu page — the index list changes
         "back"        narrow screens: the index comes back from off-screen  */
    renderRail();
    renderIndex(panel, sections, section,
      animate === "menu-list" || animate === "tab" || animate === "back");
    renderEditor(panel, section,
      animate === true || animate === "tab" || animate === "menu-list");

    byId("index").className = "index" + (animate === "back" ? " index--back" : "");

    if (preserveScroll && scrollTop > 0) scroller.scrollTop = scrollTop;
    if (ui.tab === "menu") applyMenuSearch();
    updateSavebar();
  }


  /* ── the words ─────────────────────────────── */

  /* The one rule about how the text is read, said once at the top of the pane
     rather than repeated under every box. */
  function copyNote() {
    return makeNote(function (node) {
      node.appendChild(el("strong", null, "How your typing is read. "));
      node.appendChild(document.createTextNode(
        "A line break in a box below becomes a line break on the page, and " +
        "*asterisks around a phrase* make it italic. Anything else you type " +
        "appears exactly as you typed it. The site never treats it as code."));
    });
  }

  function copySections() {
    var byPage = {};
    rowsOf("site_copy").forEach(function (row) {
      var page = byPage[row.page] || (byPage[row.page] = {});
      (page[row.section] || (page[row.section] = [])).push(row);
    });

    var out = [];
    Object.keys(PAGE_NAMES).forEach(function (page) {
      if (!byPage[page]) return;

      Object.keys(byPage[page]).forEach(function (section) {
        var rows = byPage[page][section];
        var id = "copy:" + page + ":" + section;

        out.push({
          id: id,
          group: PAGE_NAMES[page],
          label: section,
          count: plural(rows.length, "field", "fields"),
          changed: rows.filter(function (r) { return rowChanged("site_copy", r); }).length,
          describe: "The wording in the " + section + " block of the " +
            PAGE_NAMES[page].toLowerCase() + ". Each box below is a piece of " +
            "text a visitor reads there.",
          render: function (host) {
            rows.forEach(function (row) {
              var value = String(row.value === null || row.value === undefined ? "" : row.value);
              var multiline = value.indexOf("\n") >= 0 || value.length > 90;
              host.appendChild(makeField({
                table: "site_copy", row: row, col: "value",
                cardId: id, tab: "copy",
                label: row.label, help: row.help,
                type: multiline ? "textarea" : "text",
                rows: Math.min(8, 2 + Math.floor(value.length / 90)),
                max: row.max_length || null,
                value: row.value,
                onInput: function (value2, field) {
                  row.value = value2;
                  field.setError(copyProblem(row));
                  if (row.max_length) measureHeadline(row, field);
                }
              }).wrap);
            });
          }
        });
      });
    });

    return out;
  }


  /* ── the hours ─────────────────────────────── */

  /* Time fields stay in their own row columns. The picker is inside the field
     that owns it, so it can never drift under the neighboring Closes box. */
  function addTimes(block, fields) {
    fields.forEach(function (f) { block.appendChild(f.wrap); });
    return fields;
  }

  function hoursDays() {
    return rowsOf("business_hours").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }

  function hoursExceptions() {
    return rowsOf("hours_exceptions").slice().sort(function (a, b) {
      return String(a.on_date) < String(b.on_date) ? -1 : 1;
    });
  }

  /* Closing a day has to clear its times. The database will not accept a
     closed day that still has them, and neither will the constraint that says
     so — this is not a convenience, it is the only state that saves. */
  function setClosed(row, isClosed) {
    row.is_closed = isClosed;
    if (isClosed) { row.opens_at = null; row.closes_at = null; }
    else {
      if (!row.opens_at) row.opens_at = "07:00:00";
      if (!row.closes_at) row.closes_at = "22:00:00";
    }
    renderAll();
  }

  function hoursSections() {
    var days = hoursDays();
    var exceptions = hoursExceptions();

    return [
      {
        id: "hours:week",
        group: "Opening hours",
        label: "The usual week",
        count: plural(days.length, "day", "days"),
        changed: days.filter(function (r) { return rowChanged("business_hours", r); }).length,
        describe: "The hours you keep every week. They drive the open/closed " +
          "pill on the home page, the table under Visit, the footer, the mobile " +
          "menu and what Google is told — change them here and all five update " +
          "together.",
        render: renderWeek
      },
      {
        id: "hours:exceptions",
        group: "Opening hours",
        label: "Holidays and one-off days",
        count: exceptions.length === 0 ? "none" : plural(exceptions.length, "date", "dates"),
        changed: exceptions.filter(function (r) { return rowChanged("hours_exceptions", r); }).length +
          (removed.hours_exceptions || []).length,
        describe: "Single dates that do not follow the usual week. The site uses " +
          "one on its date and goes back to normal by itself.",
        render: renderExceptions
      }
    ];
  }

  /* One card, one grid. Opens and Closes are said once along the top instead
     of seven times down the page; the per-field labels stay in the markup for
     anyone listening rather than looking. */
  function renderWeek(host) {
    var card = makeCard(null);
    var grid = el("div", "hours");

    var head = el("div", "hours__head");
    head.appendChild(el("span", "hours__cap", "Day"));
    head.appendChild(el("span", "hours__cap", "Closed all day"));
    head.appendChild(el("span", "hours__cap", "Opens"));
    head.appendChild(el("span", "hours__cap", "Closes"));
    grid.appendChild(head);

    hoursDays().forEach(function (row) {
      var name = DAY_NAMES[row.day_of_week] || ("Day " + row.day_of_week);
      var line = el("div", "hours__row" + (row.is_closed ? " hours__row--shut" : ""));
      line.appendChild(el("span", "hours__day", name));

      var closed = makeCheck("Closed all day", row.is_closed, function (isClosed) {
        setClosed(row, isClosed);
      });
      closed.wrap.className = "check check--bare";
      line.appendChild(closed.wrap);

      if (row.is_closed) {
        line.appendChild(el("span", "hours__shut", "Closed all day"));
      } else {
        addTimes(line, [
          makeField({
            table: "business_hours", row: row, col: "opens_at",
            cardId: "hours:week", tab: "hours", extra: "field--bare",
            label: "Opens on " + name, type: "time", value: toInputTime(row.opens_at),
            onInput: function (v) { row.opens_at = v ? v + ":00" : null; }
          }),
          makeField({
            table: "business_hours", row: row, col: "closes_at",
            cardId: "hours:week", tab: "hours", extra: "field--bare",
            label: "Closes on " + name, type: "time", value: toInputTime(row.closes_at),
            onInput: function (v) { row.closes_at = v ? v + ":00" : null; }
          })
        ]);
      }

      grid.appendChild(line);
    });

    card.body.appendChild(grid);
    host.appendChild(card.wrap);
  }

  function renderExceptions(host) {
    var exceptions = hoursExceptions();
    var card = makeCard(null);

    card.body.appendChild(el("p", "card__help",
      "A single date that does not follow the usual week — closed for a holiday, " +
      "or closing early for a private event. The site uses it on that date and " +
      "then goes back to normal by itself. Old dates do no harm; delete them when " +
      "you feel like tidying."));

    exceptions.forEach(function (row) {
      var block = el("div", "row row--hours");

      block.appendChild(makeField({
        table: "hours_exceptions", row: row, col: "on_date",
        cardId: "hours:exceptions", tab: "hours",
        label: "Date", type: "date", value: row.on_date || "",
        onInput: function (v) { row.on_date = v || null; }
      }).wrap);

      var closedWrap = el("div", "field");
      closedWrap.appendChild(el("span", "field__label", "Closed"));
      closedWrap.appendChild(makeCheck("Closed all day", row.is_closed, function (isClosed) {
        setClosed(row, isClosed);
      }).wrap);
      block.appendChild(closedWrap);

      if (!row.is_closed) {
        addTimes(block, [
          makeField({
            table: "hours_exceptions", row: row, col: "opens_at",
            cardId: "hours:exceptions", tab: "hours",
            label: "Opens", type: "time", value: toInputTime(row.opens_at),
            onInput: function (v) { row.opens_at = v ? v + ":00" : null; }
          }),
          makeField({
            table: "hours_exceptions", row: row, col: "closes_at",
            cardId: "hours:exceptions", tab: "hours",
            label: "Closes", type: "time", value: toInputTime(row.closes_at),
            onInput: function (v) { row.closes_at = v ? v + ":00" : null; }
          })
        ]);
      }

      block.appendChild(makeField({
        table: "hours_exceptions", row: row, col: "note",
        cardId: "hours:exceptions", tab: "hours",
        label: "Why", value: row.note || "",
        placeholder: "Christmas Day",
        onInput: function (v) { row.note = v || null; }
      }).wrap);

      var del = el("button", "btn btn--small btn--danger", "Remove");
      del.type = "button";
      on(del, "click", function () { deleteRow("hours_exceptions", row); });
      block.appendChild(del);
      card.body.appendChild(block);
    });

    if (!exceptions.length) {
      card.body.appendChild(el("p", "empty", "No one-off days set."));
    }

    var add = el("button", "btn btn--small btn--add", "Add a date");
    add.type = "button";
    on(add, "click", function () {
      draft.hours_exceptions.push({
        id: tempId(), on_date: "", is_closed: true,
        opens_at: null, closes_at: null, note: null
      });
      selectSection("hours", "hours:exceptions");
      renderAll();
    });
    card.body.appendChild(add);

    host.appendChild(card.wrap);
  }


  /* ── contact ───────────────────────────────── */

  /* Grouped by the sort_order the database already gives them rather than by a
     list kept here, so a setting added in a later migration lands in the right
     card without this file being touched. */
  var SETTING_GROUPS = {
    1: "How people reach you",
    2: "Where you are",
    3: "How Google files the business"
  };

  /* What each group is for, in the tone the help lines under the fields are
     already written in. The help lines themselves are the best copy in the
     product and are not touched. */
  var SETTING_DESCRIPTIONS = {
    1: "The phone number, email and Instagram, each stored once and written " +
       "into every place on the site that shows them. The phone alone appears " +
       "in twenty-four places.",
    2: "The address as it is printed on the site and as the map link uses it.",
    3: "What Google is told about the business when it reads the site."
  };

  function contactSections() {
    var groups = {};
    var order = [];
    rowsOf("site_settings").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).forEach(function (row) {
      var bucket = Math.floor((row.sort_order || 0) / 10);
      if (!groups[bucket]) { groups[bucket] = []; order.push(bucket); }
      groups[bucket].push(row);
    });

    return order.map(function (bucket) {
      var rows = groups[bucket];
      var id = "contact:" + bucket;
      return {
        id: id,
        group: "Contact details",
        label: SETTING_GROUPS[bucket] || "Other settings",
        count: plural(rows.length, "field", "fields"),
        changed: rows.filter(function (r) { return rowChanged("site_settings", r); }).length,
        describe: SETTING_DESCRIPTIONS[bucket] ||
          "Settings the site reads but does not group anywhere else.",
        render: function (host) {
          rows.forEach(function (row) {
            host.appendChild(makeField({
              table: "site_settings", row: row, col: "value",
              cardId: id, tab: "contact",
              label: row.label,
              help: row.is_editable ? row.help
                : (row.help ? row.help + " This one is not editable here." : "Not editable here."),
              disabled: !row.is_editable,
              value: row.value,
              onInput: function (value, field) {
                row.value = value;
                field.setError(settingProblem(row));
              }
            }).wrap);
          });
        }
      };
    });
  }


  /* ── the menus ─────────────────────────────── */

  var MENU_PAGES = [
    { id: "food",   name: "Food" },
    { id: "drinks", name: "Drinks" },
    { id: "wine",   name: "Wine" }
  ];

  function coursesOn(page) {
    return rowsOf("menu_courses").filter(function (c) { return c.page === page; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }

  function itemsIn(courseId) {
    return rowsOf("menu_items").filter(function (i) { return i.course_id === courseId; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }

  function poursOf(itemId) {
    return rowsOf("menu_item_pours").filter(function (p) { return p.item_id === itemId; })
      .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
  }

  function matchesSearch(item) {
    if (!ui.search) return true;
    var needle = ui.search.toLowerCase();
    return String(item.name || "").toLowerCase().indexOf(needle) >= 0 ||
           String(item.description || "").toLowerCase().indexOf(needle) >= 0 ||
           String(item.tag || "").toLowerCase().indexOf(needle) >= 0;
  }

  function renumber(rows) {
    rows.forEach(function (row, i) { row.sort_order = i + 1; });
  }

  /* ── reordering, as a swap rather than a jump ──
     Moving a row up rewrites sort_order and re-renders, which without this
     would simply produce a different page with no account of how it got
     there. So: where every row was, then the re-render, then every row that
     ended up somewhere else starts back where it was and travels.

     Measured rather than calculated. A section that swaps across a group
     heading, or an item beside one of a different height, moves a distance
     nothing here would have guessed correctly. */

  var REORDER_MS = 300;
  var REORDABLE = "[data-section],[data-item]";

  function reorderKey(node) {
    return node.getAttribute("data-section") ||
      ("item:" + node.getAttribute("data-item"));
  }

  /* A row the search has hidden has no box to measure, and measuring it
     anyway would give every visible row a journey of several hundred pixels
     from the top of the document. Only what is on screen is recorded, and
     only what was recorded is animated. */
  function onScreen(node) { return node.offsetParent !== null; }

  function whereRowsAre() {
    var seen = {};
    var nodes = document.querySelectorAll(REORDABLE), i;
    for (i = 0; i < nodes.length; i++) {
      if (!onScreen(nodes[i])) continue;
      seen[reorderKey(nodes[i])] = nodes[i].getBoundingClientRect().top;
    }
    return seen;
  }

  function playReorder(before) {
    var nodes = document.querySelectorAll(REORDABLE);
    var moved = [], i;

    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = reorderKey(node);
      if (!(key in before) || !onScreen(node)) continue;
      var shift = before[key] - node.getBoundingClientRect().top;
      if (Math.abs(shift) < 1) continue;
      node.classList.add("is-shifted");
      node.style.transform = "translateY(" + shift + "px)";
      moved.push(node);
    }
    if (!moved.length) return;

    nextFrame(function () {
      moved.forEach(function (node) {
        node.classList.remove("is-shifted");
        node.classList.add("is-settling");
        node.style.transform = "";
      });
      window.setTimeout(function () {
        moved.forEach(function (node) { node.classList.remove("is-settling"); });
      }, REORDER_MS + 60);
    });
  }

  function move(rows, row, by) {
    var from = rows.indexOf(row), to = from + by;
    if (from < 0 || to < 0 || to >= rows.length) return;

    var before = prefersReducedMotion() ? null : whereRowsAre();
    rows.splice(from, 1);
    rows.splice(to, 0, row);
    renumber(rows);
    renderAll();
    if (before) playReorder(before);
  }

  /* The Food / Drinks / Wine switch and the search sit above the index,
     because between them they decide what the index lists. */
  function menuIndexHead(host) {
    var pick = el("div", "pagepick");
    MENU_PAGES.forEach(function (page) {
      var b = el("button", "pagepick__btn", page.name);
      b.type = "button";
      b.setAttribute("aria-pressed", ui.menuPage === page.id ? "true" : "false");
      on(b, "click", function () {
        if (ui.menuPage === page.id) return;
        ui.menuPage = page.id;
        /* A different page means a different section in the editor, so the
           pane starts at the top rather than wherever the last one was
           scrolled to. */
        renderAll("menu-list");
      });
      pick.appendChild(b);
    });
    host.appendChild(pick);

    var search = el("div", "search");
    var input = el("input", "search__input");
    input.type = "search";
    input.placeholder = "Find an item on this page…";
    input.value = ui.search;
    on(input, "input", function () {
      ui.search = input.value;
      applyMenuSearch();
    });
    search.appendChild(input);
    search.appendChild(el("span", "search__note"));
    host.appendChild(search);

    positionPagePick(pick);
  }

  /* The head survives a re-render, so what it says has to be brought up to
     date rather than rebuilt. The search box is left exactly alone — it may
     have a cursor in it. */
  function menuRefreshHead(host) {
    var pick = host.querySelector(".pagepick");
    if (!pick) return;
    MENU_PAGES.forEach(function (page, i) {
      var b = pick.children[i];
      if (b) b.setAttribute("aria-pressed", ui.menuPage === page.id ? "true" : "false");
    });
    positionPagePick(pick);
  }

  /* The maroon pill under the chosen page, as one element that travels. Same
     arrangement as the rail and the index: geometry from the button itself,
     set through the CSSOM, transitions off until the first position has been
     painted so a reload does not slide it in from the left edge. */
  function positionPagePick(pick) {
    if (!pick || pick.offsetParent === null) return;   // hidden pane, see above
    var active = pick.querySelector('[aria-pressed="true"]');
    if (!active) return;
    pick.style.setProperty("--pick-x", active.offsetLeft + "px");
    pick.style.setProperty("--pick-w", active.offsetWidth + "px");
    if (!pick._markReady) {
      pick.offsetWidth;
      pick.classList.add("pagepick--ready");
      pick._markReady = true;
    }
  }

  function menuIndexFoot(host) {
    var add = el("button", "btn btn--small btn--add", "Add a section");
    add.type = "button";
    on(add, "click", function () {
      var row = {
        id: tempId(), page: ui.menuPage, course_key: "", tab_label: "", heading: "",
        sizes: null, is_static: false, static_id: null,
        sort_order: coursesOn(ui.menuPage).length + 1
      };
      draft.menu_courses.push(row);
      selectSection("menu", "course:" + row.id);
      renderAll();
    });
    host.appendChild(add);
  }

  /* Only the section on screen has its items in the document, so a search that
     matched inside another one would find nothing a person could see. Two
     passes: hide the item rows that do not match in the section on screen, and
     dim the index rows whose sections hold no match at all. The count is over
     the whole page either way, because that is the question being asked. */
  function applyMenuSearch() {
    rowsOf("menu_items").forEach(function (item) {
      var node = document.querySelector('[data-item="' + item.id + '"]');
      if (node) node.hidden = !!ui.search && !matchesSearch(item);
    });

    var total = 0, matched = 0;
    coursesOn(ui.menuPage).forEach(function (course) {
      var items = itemsIn(course.id);
      var hits = items.filter(matchesSearch).length;
      total += items.length;
      matched += hits;
      var row = document.querySelector('[data-section="course:' + course.id + '"]');
      if (row) row.hidden = !!ui.search && hits === 0;
    });

    var note = document.querySelector(".search__note");
    if (note) {
      note.textContent = ui.search
        ? matched + " of " + total + " items on this page match “" + ui.search + "”"
        : "";
    }

    /* Hiding rows moves every row below them, so the fill has to be told
       where its row went. This runs on every keystroke and at the end of
       every menu render — the render positions the fill against the whole
       list, and this is what puts it right once the list has been filtered.
       A chosen section the search has hidden leaves nothing to fill. */
    var list = byId("indexList");
    var chosen = list.querySelector(".index__row--on");
    positionIndexMark(list, chosen && !chosen.hidden ? chosen : null);
  }

  function menuSections() {
    var courses = coursesOn(ui.menuPage);
    var pageName = PAGE_NAMES[ui.menuPage] || "Menu";

    return courses.map(function (course) {
      var items = itemsIn(course.id);
      return {
        id: "course:" + course.id,
        group: pageName,
        label: course.heading || "(untitled section)",
        count: course.is_static ? "built in" : plural(items.length, "item", "items"),
        changed: (rowChanged("menu_courses", course) ? 1 : 0) +
          items.filter(function (i) { return rowChanged("menu_items", i); }).length,
        describe: course.is_static
          ? "A block the page builds for itself. Where it sits on the menu can be " +
            "changed with the arrows beside it in the list; what is in it cannot " +
            "be edited here."
          : "One block on the " + pageName.toLowerCase() + ", with its own heading " +
            "and its own filter tab. Type prices without the dollar sign — the " +
            "site adds it, and 7.50 stays 7.50 instead of becoming 7.5.",
        extra: function (row) { row.appendChild(courseMoves(course, courses)); },
        render: function (host) { renderCourse(host, course); }
      };
    });
  }

  function courseMoves(course, siblings) {
    var moves = el("span", "index__moves");
    [["▲", -1], ["▼", 1]].forEach(function (pair) {
      var b = el("button", "mini", pair[0]);
      b.type = "button";
      b.title = pair[1] < 0 ? "Move this section up" : "Move this section down";
      var at = siblings.indexOf(course);
      b.disabled = pair[1] < 0 ? at === 0 : at === siblings.length - 1;
      on(b, "click", function (e) { e.stopPropagation(); move(siblings, course, pair[1]); });
      moves.appendChild(b);
    });
    return moves;
  }

  function renderCourse(host, course) {
    var items = itemsIn(course.id);
    var cardId = "course:" + course.id;

    var card = makeCard(null);
    host.appendChild(card.wrap);

    if (course.is_static) {
      card.body.appendChild(el("p", "static",
        "Build Your Own Breakfast is built into the page rather than stored here. " +
        "Its position on the menu can be moved with the arrows beside it in the " +
        "list; its contents are not editable — ask a developer."));
      return;
    }

    card.body.appendChild(makeField({
      table: "menu_courses", row: course, col: "heading",
      cardId: cardId, tab: "menu",
      label: "Heading on the page", value: course.heading,
      help: "What appears above the items, e.g. “Main Georgian Dishes”.",
      onInput: function (v) { course.heading = v; }
    }).wrap);

    card.body.appendChild(makeField({
      table: "menu_courses", row: course, col: "tab_label",
      cardId: cardId, tab: "menu",
      label: "Tab label", value: course.tab_label,
      help: "The short version in the row of filter buttons at the top of the page.",
      onInput: function (v) { course.tab_label = v; }
    }).wrap);

    card.body.appendChild(makeField({
      table: "menu_courses", row: course, col: "course_key",
      cardId: cardId, tab: "menu",
      label: "Filter name", value: course.course_key,
      help: "Lowercase letters, numbers and dashes. It is not shown to anyone — " +
            "it is how the tab knows which items to show.",
      onInput: function (v) { course.course_key = v; }
    }).wrap);

    /* Sizes are a property of the section, because they are column headers over
       the whole block, not something an item carries. */
    var hasSizes = !!(course.sizes && course.sizes.length);
    var sizeWrap = el("div", "field");
    sizeWrap.appendChild(el("span", "field__label", "Size columns"));
    sizeWrap.appendChild(makeCheck(
      "This section prices items by size (Small / Large)", hasSizes,
      function (checked) {
        course.sizes = checked ? ["Small", "Large"] : null;
        if (!checked) {
          /* Items priced per size cannot stay that way without columns to
             price against, and the database says so with its own message. Move
             them to a single price rather than leaving a save that cannot
             succeed. */
          itemsIn(course.id).forEach(function (item) {
            if (item.prices || item.price_all_sizes !== null) {
              item.price = firstPrice(item);
              item.prices = null;
              item.price_all_sizes = null;
            }
          });
        }
        renderAll();
      }).wrap);
    card.body.appendChild(sizeWrap);

    if (hasSizes) {
      var sizeRow = el("div", "row");
      [0, 1].forEach(function (n) {
        var f = makeField({
          table: "menu_courses", row: course, col: "sizes",
          cardId: cardId, tab: "menu",
          label: "Column " + (n + 1), value: course.sizes[n] || "", extra: "field--narrow",
          onInput: function (v) {
            var next = (course.sizes || []).slice();
            next[n] = v;
            course.sizes = next.filter(function (s) { return t(s).length > 0; });
          }
        });
        sizeRow.appendChild(f.wrap);
      });
      card.body.appendChild(sizeRow);
    }

    /* The lines on the menu are their own card. A section's own settings are
       four fields; its items are however many there are, and reading one while
       looking for the other is the whole reason the two are separated. */
    var list = makeCard("Items");
    host.appendChild(list.wrap);

    items.forEach(function (item) {
      list.body.appendChild(renderItem(item, course, items));
    });

    if (!items.length) list.body.appendChild(el("p", "empty", "No items in this section yet."));

    var tools = el("div", "tools");

    var addItem = el("button", "btn btn--small", "Add an item");
    addItem.type = "button";
    on(addItem, "click", function () {
      var row = {
        id: tempId(), course_id: course.id, name: "", tag: null, description: null,
        price: "", prices: null, price_all_sizes: null, no_price: false,
        options_dom_id: null, sort_order: itemsIn(course.id).length + 1
      };
      draft.menu_items.push(row);
      ui.open["item:" + row.id] = true;
      renderAll();
    });
    tools.appendChild(addItem);

    var delCourse = el("button", "btn btn--small btn--danger", "Delete this section");
    delCourse.type = "button";
    on(delCourse, "click", function () {
      if (!window.confirm("Delete “" + (course.heading || "this section") + "” and its " +
          items.length + " item(s)? This cannot be undone once you save.")) return;
      deleteCourse(course);
    });
    tools.appendChild(delCourse);

    list.body.appendChild(tools);
  }

  function firstPrice(item) {
    if (item.price_all_sizes) return item.price_all_sizes;
    if (item.prices && item.prices.length) {
      var found = item.prices.filter(function (p) { return p; })[0];
      if (found) return found;
    }
    return item.price || "";
  }

  function priceShape(item) {
    if (item.no_price) return "none";
    if (item.price_all_sizes !== null && item.price_all_sizes !== undefined) return "all";
    if (item.prices) return "sizes";
    return "one";
  }

  function summarisePrice(item, course) {
    if (item.no_price) return "no price";
    if (item.price_all_sizes) return "$" + item.price_all_sizes;
    if (item.prices) {
      return item.prices.map(function (p, n) {
        return ((course.sizes && course.sizes[n]) || "") + " $" + (p || "—");
      }).join("  ");
    }
    return item.price ? "$" + item.price : "";
  }

  function renderItem(item, course, siblings) {
    var wrap = el("div", "item");
    wrap.setAttribute("data-item", item.id);

    var head = el("button", "item__head");
    head.type = "button";
    var openId = "item:" + item.id;
    head.appendChild(el("span", null, item.name || "(new item)"));
    if (rowChanged("menu_items", item)) head.appendChild(el("span", "item__dot"));
    head.appendChild(el("span", "item__price", summarisePrice(item, course)));

    var moves = el("span", "item__moves");
    [["▲", -1], ["▼", 1]].forEach(function (pair) {
      var b = el("button", "mini", pair[0]);
      b.type = "button";
      var at = siblings.indexOf(item);
      b.disabled = pair[1] < 0 ? at === 0 : at === siblings.length - 1;
      on(b, "click", function (e) { e.stopPropagation(); move(siblings, item, pair[1]); });
      moves.appendChild(b);
    });
    head.appendChild(moves);

    var shell = el("div", "item__body");
    var body = el("div", "item__body-inner");
    shell.appendChild(body);
    var open = !!ui.open[openId];
    shell.hidden = !open;
    if (open) shell.classList.add("is-open");
    on(head, "click", function () {
      var nowOpen = shell.hidden;
      setDisclosure(shell, nowOpen);
      ui.open[openId] = nowOpen;
    });

    wrap.appendChild(head);
    wrap.appendChild(shell);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "name",
      cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
      label: "Name", value: item.name,
      onInput: function (v) { item.name = v; }
    }).wrap);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "tag",
      cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
      label: "Qualifier", value: item.tag || "",
      placeholder: "2022 · 750 ml · 7 toppings",
      help: "The small note beside the name, if there is one. Leave empty for none.",
      onInput: function (v) { item.tag = v ? v : null; }
    }).wrap);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "description",
      cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
      label: "Description", type: "textarea", rows: 3,
      value: item.description || "",
      help: "Leave empty and the item shows as a name and a price alone.",
      onInput: function (v) { item.description = v ? v : null; }
    }).wrap);

    /* ── the six price shapes, as one question ── */
    var options = [{ value: "one", label: "One price" }];
    if (course.sizes && course.sizes.length) {
      options.push({ value: "sizes", label: "A price for each size column" });
      options.push({ value: "all", label: "One price across the size columns" });
    }
    options.push({ value: "none", label: "No price shown" });

    var shapeField = makeField({
      table: "menu_items", row: item, col: "no_price",
      cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
      label: "How it is priced", type: "select",
      value: priceShape(item), options: options,
      onInput: function (shape) {
        var keep = firstPrice(item);
        item.price = null; item.prices = null; item.price_all_sizes = null; item.no_price = false;
        if (shape === "one") item.price = keep || "";
        else if (shape === "sizes") {
          item.prices = (course.sizes || []).map(function (_, n) {
            return n === 0 ? (keep || "") : "";
          });
        } else if (shape === "all") item.price_all_sizes = keep || "";
        else item.no_price = true;
        renderAll();
      }
    });
    body.appendChild(shapeField.wrap);

    var shape = priceShape(item);
    if (shape === "one") {
      body.appendChild(makeField({
        table: "menu_items", row: item, col: "price",
        cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
        label: "Price", value: item.price || "", placeholder: "21",
        help: "Without the dollar sign. 7.50 and 21 both stay exactly as typed.",
        onInput: function (v) { item.price = v; }
      }).wrap);
    } else if (shape === "all") {
      body.appendChild(makeField({
        table: "menu_items", row: item, col: "price_all_sizes",
        cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
        label: "Price, across both columns", value: item.price_all_sizes || "",
        onInput: function (v) { item.price_all_sizes = v; }
      }).wrap);
    } else if (shape === "sizes") {
      var priceRow = el("div", "row");
      (course.sizes || []).forEach(function (size, n) {
        var f = makeField({
          table: "menu_items", row: item, col: "prices",
          cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
          label: size, value: (item.prices && item.prices[n]) || "", extra: "field--narrow",
          onInput: function (v) {
            var next = (item.prices || []).slice();
            while (next.length < (course.sizes || []).length) next.push("");
            next[n] = v;
            item.prices = next;
          }
        });
        priceRow.appendChild(f.wrap);
      });
      body.appendChild(priceRow);
    }

    /* ── pours ── */
    var pours = poursOf(item.id);
    var poursWrap = el("div", "pours");
    poursWrap.appendChild(el("p", "pours__title", "Other pours or sizes"));
    poursWrap.appendChild(el("span", "field__help",
      "Extra priced lines under the item, like “Bottle 60”. Leave empty for none."));

    pours.forEach(function (pour) {
      var row = el("div", "pour");
      row.appendChild(makeField({
        table: "menu_item_pours", row: pour, col: "label",
        cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
        label: "Label", value: pour.label, placeholder: "Bottle",
        onInput: function (v) { pour.label = v; }
      }).wrap);
      row.appendChild(makeField({
        table: "menu_item_pours", row: pour, col: "price",
        cardId: "course:" + course.id, openId: "item:" + item.id, tab: "menu",
        label: "Price", value: pour.price, placeholder: "60",
        onInput: function (v) { pour.price = v; }
      }).wrap);
      var del = el("button", "mini", "×");
      del.type = "button";
      del.title = "Remove this line";
      on(del, "click", function () { deleteRow("menu_item_pours", pour); });
      row.appendChild(del);
      poursWrap.appendChild(row);
    });

    var addPour = el("button", "btn btn--small btn--add", "Add a pour");
    addPour.type = "button";
    on(addPour, "click", function () {
      draft.menu_item_pours.push({
        id: tempId(), item_id: item.id, label: "", price: "",
        sort_order: poursOf(item.id).length + 1
      });
      renderAll();
    });
    poursWrap.appendChild(addPour);
    body.appendChild(poursWrap);

    if (item.options_dom_id) {
      body.appendChild(el("p", "static",
        "This item has an expandable list of options on the site. That list is not " +
        "editable here yet — ask a developer to change it."));
    }

    var delItem = el("button", "btn btn--small btn--danger btn--add", "Delete this item");
    delItem.type = "button";
    on(delItem, "click", function () {
      if (!window.confirm("Delete “" + (item.name || "this item") + "”?")) return;
      poursOf(item.id).forEach(function (p) { dropRow("menu_item_pours", p); });
      deleteRow("menu_items", item);
    });
    body.appendChild(delItem);

    return wrap;
  }


  /* ═══════════════════════════════════════════════
     4a. the photographs
     ═══════════════════════════════════════════════

     A slot is a *position* on the site — "the photograph behind the opening
     headline" — never a filename. The set of positions is the markup's; which
     picture is in one is the owner's. So there is no "add a photo" here and no
     "delete a photo": there is a fixed list of places, each of which is either
     showing the picture the site shipped with or showing one that was
     uploaded, and either state is a complete, correct site.

     That is why an untouched slot has no storage path at all. The built-in
     photograph is in the markup, not in the database, and a project whose
     photos table has never been written to renders exactly the site in git. */

  var BUCKET = "site-photos";

  /* Both of these have to agree with the bucket, which is where the real
     limits are — see the migration. These exist so the owner finds out before
     waiting for an upload, not because they are a control. */
  var MAX_BYTES = 3 * 1024 * 1024;
  var ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];

  /* The long edge everything is resized down to. The widest a photograph is
     ever drawn on this site is the full-bleed hero, and 2000 covers that on a
     2× display with room to spare. Nothing is ever scaled *up*: a small
     picture stays small rather than being blown up into a soft one. */
  var MAX_EDGE = 2000;
  var WEBP_QUALITY = 0.86;

  /* Section names, keyed by the part of the slot before the dot. A prefix with
     no entry falls back to the prefix itself, so a slot added later lands
     somewhere sensible without this having to be edited first. */
  var PHOTO_GROUPS = {
    hero:        "Opening",
    story:       "Idea",
    kitchen:     "Kitchen",
    cafe:        "Café",
    wine:        "Wine Bar",
    gallery:     "Room",
    visit:       "Visit",
    faq:         "FAQ",
    menuFood:    "Food",
    menuDrinks:  "Drinks",
    menuWine:    "Wine"
  };

  var HOME_PHOTO_GROUPS = {
    hero: true, story: true, kitchen: true, cafe: true,
    wine: true, gallery: true, visit: true
  };

  /* The migration raises this sentence; the editor says it first. Same rule,
     same words — tools/test-admin.mjs fails if they drift. */
  function needsDescription(label) {
    return 'The photograph "' + label + '" needs a short description of what is in ' +
           'it. It is what someone using a screen reader hears in place of the ' +
           'picture, and what shows if the image ever fails to load.';
  }

  var HEIC_MESSAGE =
    "That is a HEIC file, which is what an iPhone saves by default and which no " +
    "browser can open. The photograph itself is fine — it just needs to come out " +
    "as a JPEG. On the phone: Settings → Camera → Formats → Most Compatible for " +
    "new photos, or open this one, tap Share, choose Options and turn on Most " +
    "Compatible.";

  function builtIn(slot) {
    return (typeof SEED_PHOTOS === "object" && SEED_PHOTOS && SEED_PHOTOS[slot]) || null;
  }

  function storageUrl(path) {
    return AROMATI_CONFIG.url + "/storage/v1/object/public/" + BUCKET + "/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }

  /* What to show in the panel, in the order the site itself would decide: the
     file just picked, then the uploaded one, then the one the site shipped
     with. */
  function previewSrc(row) {
    if (row._upload) return row._upload.preview;
    if (row.storage_path) return storageUrl(row.storage_path);
    var seed = builtIn(row.slot);
    return seed ? seed.src : "";
  }

  /* The prefix of a slot is the block of the site it belongs to, and the order
     the rows arrive in is the order a visitor meets them walking down the
     page. Both are the markup's, not this file's — a slot added in a later
     migration lands in the right group without anything here being edited. */
  function photoSections() {
    var rows = rowsOf("photos").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    var order = [];
    var groups = {};
    rows.forEach(function (row) {
      var prefix = String(row.slot).split(".")[0];
      if (!groups[prefix]) { groups[prefix] = []; order.push(prefix); }
      groups[prefix].push(row);
    });

    return order.map(function (prefix) {
      var group = groups[prefix];
      var id = "photos:" + prefix;
      var where = HOME_PHOTO_GROUPS[prefix] ? "Home page" : "Other pages";
      return {
        id: id,
        group: where,
        label: PHOTO_GROUPS[prefix] || prefix,
        count: plural(group.length, "photo", "photos"),
        changed: group.filter(function (r) { return rowChanged("photos", r); }).length,
        describe: "The photographs in the " + (PHOTO_GROUPS[prefix] || prefix) +
          " block. Choosing a new one does not change the site until you press " +
          "Save, and “Put the original back” is always available.",
        render: function (host) {
          var card = makeCard(null);
          group.forEach(function (row) { card.body.appendChild(renderPhoto(row, id)); });
          host.appendChild(card.wrap);
        }
      };
    });
  }

  function renderPhoto(row, cardId) {
    var wrap = el("div", "photo");
    if (rowChanged("photos", row)) wrap.className = "photo photo--edited";

    var figure = el("div", "photo__shot");
    var img = el("img", "photo__img");
    img.src = previewSrc(row);
    /* The description is in a box directly beside this, being read and edited.
       Announcing it here as well would say it twice. */
    img.alt = "";
    figure.appendChild(img);
    wrap.appendChild(figure);

    var side = el("div", "photo__side");
    side.appendChild(el("h3", "photo__label", row.label));

    var state = el("p", "photo__state");
    side.appendChild(state);

    var problem = el("p", "photo__problem");
    problem.hidden = true;
    side.appendChild(problem);

    var view = {
      say: function (text, kind) {
        state.textContent = text;
        state.className = "photo__state" + (kind ? " photo__state--" + kind : "");
      },
      problem: function (text) {
        problem.textContent = text || "";
        problem.hidden = !text;
      },
      redraw: function () {
        img.src = previewSrc(row);
        wrap.className = "photo" + (rowChanged("photos", row) ? " photo--edited" : "");
        describeState();
        updateSavebar();
      }
    };

    function describeState() {
      if (row._upload) {
        view.say("Ready to upload — " + row._upload.width + " × " + row._upload.height +
                 ", " + kb(row._upload.bytes) + ". Nothing has been sent yet.", "new");
        shapeWarning(row, view);
        return;
      }
      if (row.storage_path) {
        view.say("Uploaded" + (row.width ? " — " + row.width + " × " + row.height : "") + ".");
        return;
      }
      var seed = builtIn(row.slot);
      view.say("The photograph the site was built with" +
               (seed && seed.width ? " — " + seed.width + " × " + seed.height : "") + ".");
    }

    /* ── choose a file ── */
    var pick = el("label", "photo__pick");
    pick.appendChild(el("span", null, row.storage_path || row._upload
      ? "Choose a different photograph" : "Choose a photograph"));
    var file = el("input", "photo__file");
    file.type = "file";
    file.accept = ALLOWED_TYPES.join(",");
    on(file, "change", function () {
      var picked = file.files && file.files[0];
      file.value = "";                     // so picking the same file twice re-runs
      if (picked) prepare(picked, row, view);
    });
    pick.appendChild(file);
    side.appendChild(pick);

    /* ── put it back ──
       Always offered, because the built-in photograph is in the markup and
       cannot be lost. Reverting is a change like any other: it is not live
       until the save. */
    if (row.storage_path || row._upload) {
      var revert = el("button", "btn btn--small", "Put the original back");
      revert.type = "button";
      on(revert, "click", function () {
        forgetUpload(row);
        row.storage_path = null;
        row.source_path = null;
        var seed = builtIn(row.slot);
        row.width = seed ? (seed.width || null) : null;
        row.height = seed ? (seed.height || null) : null;
        renderAll();
      });
      side.appendChild(revert);
    }

    /* ── the description ── */
    if (row.is_decorative) {
      side.appendChild(el("p", "field__help",
        "This one is background — it sits behind a scrim and a screen reader is " +
        "told to ignore it, so it needs no description. Whatever goes here should " +
        "be texture rather than something a reader would want described."));
    } else {
      side.appendChild(makeField({
        table: "photos", row: row, col: "alt",
        cardId: cardId, tab: "photos",
        label: "What is in the photograph", type: "textarea", rows: 2,
        value: row.alt || "",
        help: "A short sentence. It is read aloud in place of the picture, and it " +
              "is what appears if the image ever fails to load.",
        onInput: function (v) { row.alt = v; view.redraw(); }
      }).wrap);
    }

    wrap.appendChild(side);
    describeState();
    return wrap;
  }

  function kb(bytes) {
    return bytes > 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + " MB"
      : Math.round(bytes / 1024) + " KB";
  }

  /* The one thing that actually goes wrong with an owner-uploaded photograph:
     the containers on this site are a fixed shape and the picture is cropped to
     fill them. A portrait phone photo into a landscape slot loses its top and
     bottom, and nothing errors — it just looks wrong on the page and right in
     the editor. So the shapes are compared and the difference is said out loud.

     A warning, not a refusal. Whether the crop matters is a judgement about
     that photograph, the same reasoning as the headline check. */
  function shapeWarning(row, view) {
    if (!row._upload) return;

    /* The shape being replaced is the one the database last confirmed, not the
       one on the draft row — picking a file has already written the new
       dimensions there, and comparing a photograph to itself finds no
       difference at all. */
    var saved = (baseline.photos && baseline.photos[row.id]) || {};
    var was = saved.width && saved.height ? saved.width / saved.height : null;
    var seed = builtIn(row.slot);
    if (!was && seed && seed.width) was = seed.width / seed.height;
    if (!was) return;

    var now = row._upload.width / row._upload.height;
    var ratio = now > was ? now / was : was / now;
    if (ratio < 1.25) return;

    view.problem(
      "This photograph is a very different shape from the one it replaces (" +
      shapeName(now) + " against " + shapeName(was) + "). The space on the page " +
      "does not change shape to fit, so the picture will be cropped to fill it — " +
      "worth looking at the page before you save."
    );
  }

  function shapeName(ratio) {
    if (ratio > 1.15) return "landscape";
    if (ratio < 0.87) return "portrait";
    return "square";
  }


  /* ═══════════════════════════════════════════════
     4b. turning a camera file into a web photograph
     ═══════════════════════════════════════════════

     Four things happen to a picked file, and all four happen in the browser
     before anything is sent anywhere:

       1. HEIC is refused, in words that say how to fix it on the phone
       2. the EXIF rotation is applied to the pixels
       3. it is scaled down to fit MAX_EDGE
       4. it is re-encoded as webp

     Step 2 is the one that surprises people. A phone does not rotate the pixels
     when you turn it sideways — it writes the pixels the way the sensor saw
     them and records "this is rotated" in a tag. Every browser honours that tag
     when it *shows* an image, so the photograph looks right in the file picker
     and right in the editor, and then arrives on the site sideways because the
     copy that was drawn to a canvas was the raw pixels.

     So the raw pixels are asked for deliberately, the tag is read here, and the
     rotation is applied for real. Whether the browser honoured the request is
     then *checked* rather than assumed — a rotation applied twice is as wrong
     as one never applied, and the two failures look identical. */

  /* The canonical EXIF-to-canvas transforms. The source is drawn at (0,0) and
     the matrix puts it the right way up; for 5–8 the canvas is the source's
     dimensions swapped, because those four turn the picture on its side. */
  var ORIENT = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, 1, 0],
    3: [-1, 0, 0, -1, 1, 1],
    4: [1, 0, 0, -1, 0, 1],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, 1, 0],
    7: [0, -1, -1, 0, 1, 1],
    8: [0, -1, 1, 0, 0, 1]
  };

  function swapsAxes(orientation) { return orientation >= 5 && orientation <= 8; }

  /* The Orientation tag, out of the APP1/Exif segment of a JPEG. Anything this
     cannot read is orientation 1, which is what a file with no tag means and
     what every PNG and WebP is. */
  function readOrientation(buffer) {
    var view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

    var at = 2;
    while (at + 4 <= view.byteLength) {
      if (view.getUint8(at) !== 0xff) { at += 1; continue; }
      var marker = view.getUint8(at + 1);
      if (marker === 0xda) return 1;                    // start of scan: no Exif
      var size = view.getUint16(at + 2);
      if (size < 2) return 1;

      if (marker === 0xe1 && at + 10 <= view.byteLength &&
          view.getUint32(at + 4) === 0x45786966) {      // "Exif"
        var tiff = at + 10;
        if (tiff + 8 > view.byteLength) return 1;
        /* The TIFF header says which way round its own numbers are, and it is
           the one place in a JPEG where that is not fixed. */
        var little = view.getUint16(tiff) === 0x4949;
        var ifd = tiff + view.getUint32(tiff + 4, little);
        if (ifd + 2 > view.byteLength) return 1;
        var count = view.getUint16(ifd, little);
        var i;
        for (i = 0; i < count; i++) {
          var entry = ifd + 2 + i * 12;
          if (entry + 12 > view.byteLength) return 1;
          if (view.getUint16(entry, little) === 0x0112) {
            var value = view.getUint16(entry + 8, little);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      at += 2 + size;
    }
    return 1;
  }

  /* The dimensions as they are stored, before any rotation — the frame header
     of a JPEG, the IHDR of a PNG. Used only to work out whether the browser
     already turned the picture the right way up. */
  function rawSize(buffer) {
    var view = new DataView(buffer);
    if (view.byteLength > 24 && view.getUint32(0) === 0x89504e47) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

    var at = 2;
    while (at + 9 < view.byteLength) {
      if (view.getUint8(at) !== 0xff) { at += 1; continue; }
      var marker = view.getUint8(at + 1);
      var size = view.getUint16(at + 2);
      /* 0xC4, 0xC8 and 0xCC sit in the same numeric range and are not frame
         headers — Huffman tables and arithmetic coding conditioning. */
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
      }
      if (size < 2) return null;
      at += 2 + size;
    }
    return null;
  }

  /* Did the browser hand back the raw pixels, as asked, or had it already
     applied the rotation? Only 5–8 can be told apart this way, because only
     those four swap width and height — and only those four are the ones that
     look catastrophically wrong when they go astray. */
  function orientationToApply(bitmap, raw, orientation) {
    if (!swapsAxes(orientation)) return orientation;
    if (!raw) return orientation;
    if (bitmap.width === raw.width && bitmap.height === raw.height) return orientation;
    return 1;                                   // already turned; do not turn it twice
  }

  function fitInside(width, height, max) {
    var longest = Math.max(width, height);
    if (longest <= max) return { width: width, height: height };
    var scale = max / longest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function forgetUpload(row) {
    if (row._upload && row._upload.preview && window.URL && window.URL.revokeObjectURL) {
      try { window.URL.revokeObjectURL(row._upload.preview); } catch (err) { /* already gone */ }
    }
    delete row._upload;
  }

  function prepare(file, row, view) {
    view.problem("");

    var name = String(file.name || "");
    if (/\.hei[cf]$/i.test(name) || /^image\/hei[cf]/i.test(file.type || "")) {
      view.problem(HEIC_MESSAGE);
      return;
    }
    if (ALLOWED_TYPES.indexOf(file.type) < 0) {
      view.problem("That is a " + (file.type || "file of an unknown kind") +
                   ". A photograph has to be a JPEG, a PNG or a WebP.");
      return;
    }

    view.say("Reading the photograph…", "busy");

    var makeBitmap = window.createImageBitmap;
    if (typeof makeBitmap !== "function") {
      view.problem("This browser cannot resize a photograph before uploading it. " +
                   "Chrome, Safari and Firefox all can — try one of those.");
      return;
    }

    file.arrayBuffer().then(function (buffer) {
      var orientation = readOrientation(buffer);
      var raw = rawSize(buffer);
      /* "none" is a request for the pixels as stored. A browser that ignores it
         is caught by orientationToApply rather than trusted. */
      return makeBitmap(file, { imageOrientation: "none" }).then(function (bitmap) {
        return { bitmap: bitmap, orientation: orientationToApply(bitmap, raw, orientation) };
      });
    }).then(function (decoded) {
      var bitmap = decoded.bitmap;
      var turn = decoded.orientation;

      var fit = fitInside(bitmap.width, bitmap.height, MAX_EDGE);
      var out = swapsAxes(turn)
        ? { width: fit.height, height: fit.width }
        : { width: fit.width, height: fit.height };

      var canvas = document.createElement("canvas");
      canvas.width = out.width;
      canvas.height = out.height;
      var ctx = canvas.getContext("2d");
      var m = ORIENT[turn] || ORIENT[1];
      /* The matrix is written in units of the source, so the translate terms
         are multiplied up by the size it is being drawn at. */
      ctx.setTransform(m[0], m[1], m[2], m[3],
                       m[4] * fit.width, m[5] * fit.height);
      ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
      if (bitmap.close) bitmap.close();

      view.say("Compressing…", "busy");
      return toBlob(canvas, "image/webp", WEBP_QUALITY).then(function (blob) {
        return { blob: blob, width: out.width, height: out.height };
      });
    }).then(function (made) {
      if (!made.blob) throw new Error("this browser would not re-encode the photograph");
      if (made.blob.size > MAX_BYTES) {
        throw new Error("even after resizing, the photograph is " + kb(made.blob.size) +
                        " and the limit is " + kb(MAX_BYTES) + ". Try a smaller one.");
      }

      forgetUpload(row);

      /* The path carries the slot and the moment, so two uploads to the same
         slot never collide and a file in the bucket says where it belongs
         without anything having to be looked up. */
      var stamp = String(Date.now());
      var base = row.slot + "/" + stamp;
      var keepOriginal = file.size <= MAX_BYTES && ALLOWED_TYPES.indexOf(file.type) >= 0;

      row._upload = {
        blob: made.blob,
        path: base + ".webp",
        width: made.width,
        height: made.height,
        bytes: made.blob.size,
        preview: window.URL.createObjectURL(made.blob),
        /* The file exactly as it was picked, so a crop can be undone later
           against the pixels the owner actually chose. Skipped when it is over
           the bucket's limit: the site needs the display copy, and failing the
           whole upload to preserve something nothing reads yet would be the
           wrong trade. */
        source: keepOriginal ? file : null,
        sourcePath: keepOriginal ? base + "-original" + extensionFor(file.type) : null
      };

      row.storage_path = row._upload.path;
      row.source_path = row._upload.sourcePath;
      row.width = made.width;
      row.height = made.height;

      renderAll();
    }).catch(function (err) {
      view.say("");
      view.problem("That photograph could not be prepared: " +
                   ((err && err.message) || err) + ".");
    });
  }

  function extensionFor(type) {
    if (type === "image/png") return ".png";
    if (type === "image/webp") return ".webp";
    return ".jpg";
  }

  /* canvas.toBlob is callback-based and predates promises everywhere. */
  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof canvas.toBlob !== "function") {
        reject(new Error("this browser cannot re-encode a photograph"));
        return;
      }
      canvas.toBlob(function (blob) { resolve(blob); }, type, quality);
    });
  }


  /* ── the FAQ ───────────────────────────────── */

  function faqEntries() {
    return rowsOf("faq_entries").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }

  function faqNote() {
    return makeNote(function (node) {
      node.appendChild(el("strong", null, "The FAQ page is still undecided. "));
      node.appendChild(document.createTextNode(
        "The eighteen questions on it today are placeholder text written by the " +
        "studio, and the page itself carries a notice saying so. Nothing has been " +
        "moved into the editor yet. Dropping the page would waste the work, and " +
        "rewriting it would waste it twice. Say the word and the questions get " +
        "transcribed, or the page gets removed. Until then, anything added here " +
        "goes live on the site as soon as it is saved."));
    });
  }

  function faqIndexFoot(host) {
    var add = el("button", "btn btn--small btn--add", "Add a question");
    add.type = "button";
    on(add, "click", function () {
      var row = {
        id: tempId(), question: "", answer: "", is_published: true,
        sort_order: rowsOf("faq_entries").length + 1
      };
      draft.faq_entries.push(row);
      selectSection("faq", "faq:" + row.id);
      renderAll();
    });
    host.appendChild(add);
  }

  function faqSections() {
    var entries = faqEntries();

    return entries.map(function (entry) {
      return {
        id: "faq:" + entry.id,
        group: "Questions",
        label: entry.question || "(new question)",
        count: entry.is_published ? null : "hidden",
        changed: rowChanged("faq_entries", entry) ? 1 : 0,
        describe: entry.is_published
          ? "One question and its answer, as they appear on the FAQ page."
          : "One question and its answer. It is hidden, so nobody visiting the " +
            "site can see it yet.",
        render: function (host) { renderFaqEntry(host, entry, entries); }
      };
    });
  }

  function renderFaqEntry(host, entry, entries) {
    var cardId = "faq:" + entry.id;
    var card = makeCard(null);
    host.appendChild(card.wrap);

    card.body.appendChild(makeField({
      table: "faq_entries", row: entry, col: "question",
      cardId: cardId, tab: "faq",
      label: "Question", value: entry.question,
      onInput: function (v) { entry.question = v; }
    }).wrap);

    card.body.appendChild(makeField({
      table: "faq_entries", row: entry, col: "answer",
      cardId: cardId, tab: "faq",
      label: "Answer", type: "textarea", rows: 4, value: entry.answer,
      onInput: function (v) { entry.answer = v; }
    }).wrap);

    card.body.appendChild(makeCheck("Show this on the site", entry.is_published,
      function (checked) { entry.is_published = checked; renderAll(); }).wrap);

    var tools = el("div", "tools");
    [["▲", -1], ["▼", 1]].forEach(function (pair) {
      var b = el("button", "mini", pair[0]);
      b.type = "button";
      b.title = pair[1] < 0 ? "Move this question up" : "Move this question down";
      var at = entries.indexOf(entry);
      b.disabled = pair[1] < 0 ? at === 0 : at === entries.length - 1;
      on(b, "click", function () { move(entries, entry, pair[1]); });
      tools.appendChild(b);
    });
    var del = el("button", "btn btn--small btn--danger", "Delete");
    del.type = "button";
    on(del, "click", function () {
      if (!window.confirm("Delete this question?")) return;
      deleteRow("faq_entries", entry);
    });
    tools.appendChild(del);
    card.body.appendChild(tools);
  }


  /* ═══════════════════════════════════════════════
     5. adding and removing
     ═══════════════════════════════════════════════ */

  /* Take a row out of the draft without asking the database to delete it —
     used for rows that were never saved, and for children the database will
     cascade away on its own. */
  function dropRow(table, row) {
    draft[table] = rowsOf(table).filter(function (r) { return r !== row; });
  }

  function deleteRow(table, row) {
    if (!isNew(row)) (removed[table] || (removed[table] = [])).push(row.id);
    dropRow(table, row);
    renderAll();
  }

  function deleteCourse(course) {
    /* The foreign keys cascade, so the items and pours under a deleted course
       need no delete of their own — but they do need to leave the draft, or
       the next save would try to update rows that no longer exist. */
    itemsIn(course.id).forEach(function (item) {
      poursOf(item.id).forEach(function (p) { dropRow("menu_item_pours", p); });
      dropRow("menu_items", item);
    });
    deleteRow("menu_courses", course);
  }


  /* ═══════════════════════════════════════════════
     6. the headline check, measured rather than guessed
     ═══════════════════════════════════════════════

     The six headlines on the home page and the one on each inner page are
     chopped into per-word spans and animated in sequence. Too long and nothing
     errors — the headline takes an extra line, the choreography runs against a
     block that is taller than it was designed around, and everything below it
     moves down.

     tools/measure-headlines.mjs went looking for a character limit and found
     that a character count is the wrong control: "Wine Bar" and "khinkali" are
     the same eight characters and not the same width, and lines break at
     spaces, so the last word either fits whole or moves whole. The quantity
     that describes the constraint is the rendered line count of the real
     element — which is measurable here, live, as the owner types.

     So the real page is loaded into a hidden frame, the candidate text is put
     into the real element, and the line boxes are counted with a Range. No
     stylesheet is duplicated, no font metric is copied, and nothing can drift:
     it is the page itself doing the measuring.

     It warns; it does not block. Whether one extra line is a problem is a
     judgement about that particular headline, and the character limit in the
     database stays as the hard backstop against something absurd. */

  var frames = {};      // page → { node, ready }
  var measureTimer = null;

  function frameFor(page, then) {
    var file = PAGE_FILES[page];
    if (!file) return;

    if (frames[page] && frames[page].ready) { then(frames[page].node); return; }
    if (frames[page]) return;                    // already loading; the retype will catch it

    var node = el("iframe", "measure");
    node.setAttribute("title", "measuring " + file);
    frames[page] = { node: node, ready: false };
    on(node, "load", function () {
      frames[page].ready = true;
      then(node);
    });
    node.src = file;
    document.body.appendChild(node);
  }

  function countLines(node) {
    var range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    return range.getClientRects().length;
  }

  function measureHeadline(row, field) {
    if (measureTimer) window.clearTimeout(measureTimer);
    measureTimer = window.setTimeout(function () { runMeasure(row, field); }, 350);
  }

  function runMeasure(row, field) {
    frameFor(row.page, function (frame) {
      var doc, target;
      try {
        doc = frame.contentDocument;
        target = doc && doc.querySelector('[data-copy="' + row.key + '"]');
      } catch (err) {
        return;                                  // no frame, no measurement, no noise
      }
      if (!target) return;

      var saved = (baseline.site_copy[row.id] || {}).value || "";
      var candidate = String(row.value);

      /* Two widths: the composition the site was designed at, and the narrowest
         phone worth caring about. A headline that holds at 1280 and wraps at
         390 is a real trade-off rather than a mistake, and saying which is
         which is the useful part. */
      var result = [1280, 390].map(function (width) {
        frame.style.width = width + "px";
        target.textContent = saved;
        var before = countLines(target);
        target.textContent = candidate;
        var after = countLines(target);
        return { width: width, before: before, after: after };
      });
      target.textContent = candidate;
      frame.style.width = "1280px";

      var worse = result.filter(function (r) { return r.after > r.before; });
      if (!worse.length) {
        field.setNote(candidate === saved ? "" :
          "Still fits on " + result[0].after + (result[0].after === 1 ? " line" : " lines") +
          ", the same as now.");
        return;
      }

      var where = worse.map(function (r) {
        return r.width === 390 ? "on a phone" : "on a laptop";
      }).join(" and ");

      field.setNote("This takes an extra line " + where + " (" +
        worse[0].after + " instead of " + worse[0].before +
        "). Nothing breaks, but the section below it moves down — worth a look " +
        "at the page before you save.", true);
    });
  }


  /* ═══════════════════════════════════════════════
     7. validation, and the savebar
     ═══════════════════════════════════════════════ */

  function problems() {
    var found = [];

    function add(message, table, id, col) {
      found.push({ message: message, table: table, id: id, col: col });
    }

    rowsOf("site_settings").forEach(function (row) {
      var problem = settingProblem(row);
      if (problem) add(problem, "site_settings", row.id, "value");
    });

    rowsOf("site_copy").forEach(function (row) {
      var problem = copyProblem(row);
      if (problem) add(row.label + ": " + problem, "site_copy", row.id, "value");
    });

    rowsOf("business_hours").concat(rowsOf("hours_exceptions")).forEach(function (row) {
      var what = row.day_of_week !== undefined
        ? DAY_NAMES[row.day_of_week]
        : (row.on_date || "a date with nothing in the date box");
      if (row.on_date !== undefined && isBlank(row.on_date)) {
        add("One of the one-off days has no date on it. Give it one, or remove it.",
            "hours_exceptions", row.id, "on_date");
        return;
      }
      if (row.is_closed) return;
      if (!row.opens_at || !row.closes_at) {
        add(what + " is open but has no opening or closing time.",
            row.day_of_week !== undefined ? "business_hours" : "hours_exceptions",
            row.id, !row.opens_at ? "opens_at" : "closes_at");
        return;
      }
      if (String(row.closes_at) <= String(row.opens_at)) {
        add(what + " closes at or before it opens. A café that shuts at 7am and " +
            "opens at 10pm is almost certainly the two boxes the wrong way round.",
            row.day_of_week !== undefined ? "business_hours" : "hours_exceptions",
            row.id, "closes_at");
      }
    });

    var dates = {};
    rowsOf("hours_exceptions").forEach(function (row) {
      if (isBlank(row.on_date)) return;
      if (dates[row.on_date]) {
        add("There are two entries for " + row.on_date + ". Only one can be saved.",
            "hours_exceptions", row.id, "on_date");
      }
      dates[row.on_date] = true;
    });

    rowsOf("menu_courses").forEach(function (course) {
      if (course.is_static) return;
      if (isBlank(course.heading)) {
        add("A section on the " + course.page + " menu has no heading.",
            "menu_courses", course.id, "heading");
      }
      if (isBlank(course.tab_label)) {
        add("“" + (course.heading || "a section") + "” has no tab label.",
            "menu_courses", course.id, "tab_label");
      }
      if (!/^[a-z][a-z0-9-]*$/.test(t(course.course_key))) {
        add("The filter name for “" + (course.heading || "a section") + "” has to start " +
            "with a lowercase letter and use only lowercase letters, numbers and dashes.",
            "menu_courses", course.id, "course_key");
      }
      if (course.sizes && course.sizes.length > 2) {
        add("“" + course.heading + "” has more than two size columns, which the menu " +
            "layout has no room for.", "menu_courses", course.id, "sizes");
      }
    });

    rowsOf("menu_items").forEach(function (item) {
      var course = findRow("menu_courses", item.course_id);
      var where = course ? " in " + (course.heading || "a section") : "";

      if (isBlank(item.name)) {
        add("An item" + where + " has no name.", "menu_items", item.id, "name");
      }

      var shape = priceShape(item);
      if (shape === "one" && isBlank(item.price)) {
        add("“" + (item.name || "an item") + "” is priced with one price, but the price " +
            "box is empty. Enter a price, or set it to “No price shown”.",
            "menu_items", item.id, "price");
      }
      if (shape === "all" && isBlank(item.price_all_sizes)) {
        add("“" + (item.name || "an item") + "” has no price in the box.",
            "menu_items", item.id, "price_all_sizes");
      }
      if (shape === "sizes") {
        var sizes = (course && course.sizes) || [];
        if (!sizes.length) {
          add("“" + (item.name || "an item") + "” has a price per size, but its section has " +
              "no size columns. Give the section its sizes, or use a single price instead.",
              "menu_items", item.id, "prices");
        } else if ((item.prices || []).length !== sizes.length) {
          add("“" + (item.name || "an item") + "” has " + (item.prices || []).length +
              " prices but its section has " + sizes.length + " size columns. They must " +
              "match one to one.", "menu_items", item.id, "prices");
        }
      }
    });

    rowsOf("menu_item_pours").forEach(function (pour) {
      var item = findRow("menu_items", pour.item_id);
      var name = (item && item.name) || "an item";
      if (isBlank(pour.label) || isBlank(pour.price)) {
        add("An extra line under “" + name + "” is missing its label or its price. " +
            "Fill both in, or remove the line.", "menu_item_pours", pour.id,
            isBlank(pour.label) ? "label" : "price");
      }
    });

    /* A photograph with no description is a photograph a screen reader
       announces as nothing at all. The database refuses it too — same rule,
       same sentence, deliberately in both places. Decoration is exempt, and
       which slots are decoration is not the owner's to decide. */
    rowsOf("photos").forEach(function (row) {
      if (row.is_decorative) return;
      if (!row.storage_path) return;
      if (isBlank(row.alt)) add(needsDescription(row.label), "photos", row.id, "alt");
    });

    rowsOf("faq_entries").forEach(function (entry) {
      if (isBlank(entry.question) || isBlank(entry.answer)) {
        add("A question in the FAQ is missing its question or its answer.",
            "faq_entries", entry.id, isBlank(entry.question) ? "question" : "answer");
      }
    });

    return found;
  }

  function showProblems(list) {
    var host = byId("problems");
    var titleNode = byId("problemsTitle");
    var listNode = byId("problemsList");

    if (!list.length) { host.hidden = true; return; }

    titleNode.textContent = list.length === 1
      ? "One thing to fix before this can be saved"
      : list.length + " things to fix before this can be saved";

    clear(listNode);
    list.forEach(function (problem) {
      var li = el("li", "problems__item");
      var link = el("button", "problems__link", problem.message);
      link.type = "button";
      on(link, "click", function () {
        var field = findField(problem.table, problem.id, problem.col);
        if (field) field.focus();
      });
      li.appendChild(link);
      listNode.appendChild(li);
    });
    host.hidden = false;
  }

  var savebarExitToken = 0;

  function showSavebar(bar) {
    savebarExitToken += 1;
    bar.classList.remove("savebar--leaving");
    bar.classList.remove("savebar--clean");
  }

  /* The bar stays where it is and goes quiet, rather than sliding away and
     taking the foot of the pane with it. Something that moves out from under
     the pointer as the last edit is undone is worse than something that
     changes what it says. */
  function hideSavebarAnimated(bar) {
    if (bar.classList.contains("savebar--clean")) {
      bar.classList.remove("savebar--leaving");
      return;
    }
    if (bar.classList.contains("savebar--leaving")) return;

    var token = ++savebarExitToken;
    bar.classList.add("savebar--leaving");
    function finish() {
      if (savebarExitToken !== token) return;
      bar.classList.remove("savebar--leaving");
      bar.classList.add("savebar--clean");
    }
    if (prefersReducedMotion()) finish();
    else window.setTimeout(finish, STATUS_EXIT_MS);
  }

  /* "3 unsaved changes in Hero" beats "3 changes not yet saved", because the
     second one leaves the owner to go and find them. The section named is the
     one the editor is showing, and only when the changes are in fact in it. */
  function saveSentence(total) {
    if (total === 0) return savedSomething ? "All changes saved" : "No changes yet";

    var here = panelChangeCount(ui.tab);
    var panel = currentPanel();
    var section = currentSection(panel.sections());
    var word = total === 1 ? "1 unsaved change" : total + " unsaved changes";

    if (section && here === total && section.changed === total) {
      return word + " in " + section.label;
    }
    return word;
  }

  function updateSavebar() {
    var n = changeCount();
    var bar = byId("savebar");

    if (n === 0) {
      hideSavebarAnimated(bar);
      byId("problems").hidden = true;
    } else {
      showSavebar(bar);
    }
    byId("saveCount").textContent = saveSentence(n);
    byId("saveBtn").disabled = saving || n === 0;
    byId("discardBtn").disabled = saving || n === 0;

    /* A tab shows a dot when something under it has changed, and the count in
       the savebar is the only number that matters — so both are rebuilt from
       the same derived state rather than incremented anywhere. */
    var tabs = byId("tabs").children, i;
    for (i = 0; i < tabs.length; i++) {
      setTabDot(tabs[i], panelChangeCount(PANELS[i].id) > 0);
    }
  }


  /* ═══════════════════════════════════════════════
     8. saving
     ═══════════════════════════════════════════════

     Deletes first and children before parents, then inserts and parents before
     children, then updates — the order the foreign keys require. Each call is
     awaited on its own, and the baseline advances as each one lands, so a
     failure halfway through leaves an editor that is telling the truth about
     what is and is not saved. */

  var saving = false;

  function payload(table, row, idMap) {
    var out = {};
    WRITABLE[table].forEach(function (col) {
      var value = row[col];
      /* A temporary id on a foreign key means the parent was inserted in this
         same save, and the real id only exists now. */
      if ((col === "course_id" || col === "item_id") && idMap[value]) value = idMap[value];
      if (typeof value === "string" && value === "" &&
          (col === "tag" || col === "description" || col === "note")) value = null;
      out[col] = value === undefined ? null : value;
    });
    return out;
  }

  function snapshot(table, row) {
    /* The picked file has done its job: it is in the bucket, and the row naming
       it has just been written. Holding on to it would keep a blob: URL alive
       and would put a Blob into the deep copy Discard restores from, where it
       would survive as an empty object. */
    if (table === "photos") forgetUpload(row);

    var copy = {};
    WRITABLE[table].forEach(function (col) { copy[col] = row[col]; });
    baseline[table][row.id] = copy;
    rememberSaved(table, row);
  }

  /* `loaded` is what Discard restores from, so it has to keep up with what the
     database has confirmed. Without this, Discard after a save reverts to the
     state the page opened in — and then cheerfully offers to write those stale
     values back over the ones that were just saved. */
  function rememberSaved(table, row) {
    var rows = loaded[table] || (loaded[table] = []);
    var fresh = JSON.parse(JSON.stringify(row));
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === row.id) { rows[i] = fresh; return; }
    }
    rows.push(fresh);
  }

  function forgetSaved(table, id) {
    loaded[table] = (loaded[table] || []).filter(function (r) { return r.id !== id; });

    /* What the foreign keys cascaded away has to leave here too. A child left
       behind would come back on the next Discard as a row that no longer
       exists, and the save after that would update nothing at all — PostgREST
       answers an update matching no row with a cheerful 204. */
    if (table === "menu_courses") {
      (loaded.menu_items || []).slice()
        .filter(function (item) { return item.course_id === id; })
        .forEach(function (item) { forgetSaved("menu_items", item.id); });
    }
    if (table === "menu_items") {
      loaded.menu_item_pours = (loaded.menu_item_pours || [])
        .filter(function (pour) { return pour.item_id !== id; });
    }
  }

  function save() {
    if (saving) return;

    var found = problems();
    showProblems(found);
    if (found.length) {
      /* Opening the card that holds the first problem is the difference between
         a list of complaints and a thing you can act on — the offending field is
         very often inside something collapsed. */
      var first = findField(found[0].table, found[0].id, found[0].col);
      if (first) first.focus();
      return;
    }

    saving = true;
    byId("savebar").className = "savebar savebar--busy";
    byId("saveBtn").disabled = true;
    byId("discardBtn").disabled = true;

    var idMap = {};
    var done = 0, planned = 0;

    /* ── the plan ── */
    var steps = [];

    /* Files first, before any row is written. A row pointing at an object that
       is not there yet is a broken image on the live site for however long the
       upload takes, and if the upload then fails it is a broken image
       permanently. This way a failed upload means nothing was written at all.

       The objects the uploads replace are *not* deleted here. They are noted,
       and swept after the whole save has landed — a delete that runs before the
       row is updated is a delete that can leave the site pointing at nothing. */
    var superseded = [];
    rowsOf("photos").forEach(function (row) {
      var was = baseline.photos && baseline.photos[row.id];
      if (was) {
        if (was.storage_path && was.storage_path !== row.storage_path) superseded.push(was.storage_path);
        if (was.source_path && was.source_path !== row.source_path) superseded.push(was.source_path);
      }
      if (!row._upload) return;
      steps.push({ what: "upload", table: "photos", row: row,
                   path: row._upload.path, blob: row._upload.blob });
      if (row._upload.source) {
        steps.push({ what: "upload", table: "photos", row: row,
                     path: row._upload.sourcePath, blob: row._upload.source });
      }
    });

    ["menu_item_pours", "menu_items", "menu_courses", "hours_exceptions", "faq_entries"]
      .forEach(function (table) {
        (removed[table] || []).forEach(function (id) {
          steps.push({ what: "delete", table: table, id: id });
        });
      });

    ["menu_courses", "menu_items", "menu_item_pours", "hours_exceptions", "faq_entries"]
      .forEach(function (table) {
        rowsOf(table).forEach(function (row) {
          if (isNew(row)) steps.push({ what: "insert", table: table, row: row });
        });
      });

    TABLES.forEach(function (table) {
      rowsOf(table).forEach(function (row) {
        if (!isNew(row) && rowChanged(table, row)) {
          steps.push({ what: "update", table: table, row: row });
        }
      });
    });

    planned = steps.length;

    function finish(error) {
      saving = false;
      byId("savebar").className = "savebar";
      byId("saveBtn").disabled = false;
      byId("discardBtn").disabled = false;
      /* Even a save that failed halfway wrote what it wrote. Setting this on
         `done` rather than on success is the difference between a label that
         reports and one that congratulates. */
      if (done > 0) savedSomething = true;
      renderAll();

      if (error) {
        showProblems([{
          message: "Saved " + done + " of " + planned + " changes, then the database " +
                   "refused one: " + error + " Everything above this point is saved; " +
                   "the rest is still marked as changed.",
          table: null, id: null, col: null
        }]);
      } else {
        showProblems([]);
        sweep(superseded);
        flash("Saved. The site is showing it now.");
      }
    }

    /* Photographs that have been replaced, taken out of the bucket now that
       nothing points at them any more. After the save and only after it: a file
       deleted speculatively is a file deleted on a save that then failed, and
       the row still naming it. A failure here is worth a line in the console
       and nothing else — an object nobody references costs a few hundred
       kilobytes, and telling the owner about it would be telling them about a
       problem they have no way to act on. */
    function sweep(paths) {
      if (!paths.length || !sb.storage) return;
      sb.storage.from(BUCKET).remove(paths).then(function (res) {
        if (res && res.error && window.console) {
          console.warn("admin: could not remove replaced photographs", res.error.message);
        }
      }, function (err) {
        if (window.console) console.warn("admin: could not remove replaced photographs", err);
      });
    }

    function next(i) {
      if (i >= steps.length) { finish(null); return; }
      var step = steps[i];

      var request;
      if (step.what === "upload") {
        /* upsert:false — the path carries a timestamp, so a collision would
           mean two different photographs claiming the same name, and silently
           overwriting one of them is the wrong answer to that. */
        request = sb.storage.from(BUCKET).upload(step.path, step.blob, {
          contentType: step.blob.type || "image/webp",
          cacheControl: "31536000",
          upsert: false
        });
      } else if (step.what === "delete") {
        request = sb.from(step.table).delete().eq("id", step.id);
      } else if (step.what === "insert") {
        request = sb.from(step.table).insert(payload(step.table, step.row, idMap)).select("id");
      } else {
        request = sb.from(step.table).update(payload(step.table, step.row, idMap)).eq("id", step.row.id);
      }

      request.then(function (res) {
        if (res.error) { finish(res.error.message || String(res.error)); return; }

        if (step.what === "upload") {
          /* The file is in the bucket. The row that names it is updated later
             in this same plan; nothing is folded into the baseline here,
             because until that update lands the site is still showing the old
             picture and saying so would be a lie. */
        } else if (step.what === "delete") {
          removed[step.table] = (removed[step.table] || []).filter(function (id) {
            return id !== step.id;
          });
          delete baseline[step.table][step.id];
          forgetSaved(step.table, step.id);
        } else if (step.what === "insert") {
          var realId = res.data && res.data[0] && res.data[0].id;
          if (!realId) { finish("the row was created but the database did not say with what id"); return; }
          idMap[step.row.id] = realId;
          /* Children in this same save point at the temporary id; rewrite them
             now rather than relying on idMap surviving into the next save. */
          rowsOf("menu_items").forEach(function (item) {
            if (item.course_id === step.row.id) item.course_id = realId;
          });
          rowsOf("menu_item_pours").forEach(function (pour) {
            if (pour.item_id === step.row.id) pour.item_id = realId;
          });
          Object.keys(ui.open).forEach(function (key) {
            if (key.indexOf(step.row.id) >= 0) ui.open[key.replace(step.row.id, realId)] = true;
          });
          step.row.id = realId;
          snapshot(step.table, step.row);
        } else {
          snapshot(step.table, step.row);
        }

        done += 1;
        next(i + 1);
      }, function (err) {
        finish((err && err.message) || String(err));
      });
    }

    next(0);
  }

  function flash(message) {
    var bar = byId("savebar");
    showSavebar(bar);
    byId("saveCount").textContent = message;
    window.setTimeout(function () { updateSavebar(); }, 2600);
  }

  function discard() {
    if (changeCount() === 0) return;
    if (!window.confirm("Throw away every change you have made since the last save?")) return;
    buildDraft();
    showProblems([]);
    renderAll();
  }


  /* ═══════════════════════════════════════════════
     9. loading
     ═══════════════════════════════════════════════ */

  var SELECTS = {
    site_settings: "id,key,label,help,value,is_editable,sort_order",
    site_copy: "id,key,page,section,label,help,value,max_length,sort_order",
    business_hours: "id,day_of_week,is_closed,opens_at,closes_at,note,sort_order",
    hours_exceptions: "id,on_date,is_closed,opens_at,closes_at,note",
    menu_courses: "id,page,course_key,tab_label,heading,sizes,is_static,static_id,sort_order",
    menu_items: "id,course_id,name,tag,description,price,prices,price_all_sizes,no_price,options_dom_id,sort_order",
    menu_item_pours: "id,item_id,label,price,sort_order",
    faq_entries: "id,question,answer,is_published,sort_order",
    photos: "id,slot,label,storage_path,source_path,alt,width,height,is_decorative,sort_order"
  };

  /* hours_exceptions has no sort_order — a holiday's place in the list is its
     date, and a second ordering column would be a second answer to a question
     that already has one. Asking PostgREST to order by a column that is not
     there is an error, not an empty result, so the order column is named per
     table rather than assumed. */
  var ORDER_BY = {
    site_settings: "sort_order",
    site_copy: "sort_order",
    business_hours: "sort_order",
    hours_exceptions: "on_date",
    menu_courses: "sort_order",
    menu_items: "sort_order",
    menu_item_pours: "sort_order",
    faq_entries: "sort_order",
    photos: "sort_order"
  };

  var loaded = {};

  function load() {
    return Promise.all(TABLES.map(function (table) {
      return sb.from(table).select(SELECTS[table]).order(ORDER_BY[table], { ascending: true })
        .then(function (res) {
          if (res.error) throw new Error(table + ": " + res.error.message);
          loaded[table] = res.data || [];
        });
    })).then(function () {
      buildDraft();
    });
  }

  /* The draft is a deep copy, not a reference. An editor that hands out the
     same objects it loaded has no way to discard anything. */
  function buildDraft() {
    /* Discard throws away picked files along with everything else, and a
       blob: URL that nothing points at any more is a page holding onto a
       decoded photograph until it is closed. */
    (draft.photos || []).forEach(forgetUpload);

    TABLES.forEach(function (table) {
      baseline[table] = {};
      removed[table] = [];
      draft[table] = (loaded[table] || []).map(function (row) {
        var copy = JSON.parse(JSON.stringify(row));
        var base = {};
        WRITABLE[table].forEach(function (col) { base[col] = copy[col]; });
        baseline[table][copy.id] = base;
        return copy;
      });
    });
  }


  /* ═══════════════════════════════════════════════
     10. the gate
     ═══════════════════════════════════════════════ */

  function show(which) {
    byId("boot").hidden = which !== "boot";
    byId("gate").hidden = which !== "gate";
    byId("app").hidden = which !== "app";
  }

  function bootMessage(text, bad) {
    var boot = byId("boot");
    boot.className = bad ? "boot boot--bad" : "boot";
    byId("bootText").textContent = text;
    show("boot");
  }

  function gateMessage(text) {
    var node = byId("gateMsg");
    node.textContent = text || "";
    node.hidden = !text;
  }

  /* Signing in is not the same question as being allowed to edit. The database
     answers the second one — is_owner() reports on the caller and nothing else
     — and asking it here means the editor never opens for an account that
     would be refused by every write anyway. That is a courtesy, not the
     control: row level security is the control, and it holds whether this
     check runs or not. */
  function confirmOwner() {
    return sb.rpc("is_owner").then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data === true;
    });
  }

  function enter(user) {
    account = user;
    byId("who").textContent = "Signed in as " + (user.email || "the owner");
    bootMessage("Loading the site’s content…");
    return load().then(function () {
      var app = byId("app");
      app.classList.remove("app--enter");
      show("app");
      renderAll();
      nextFrame(function () { app.classList.add("app--enter"); });
    }).catch(function (err) {
      bootMessage("Signed in, but the content would not load: " +
                  ((err && err.message) || err) +
                  " The site itself is unaffected — visitors are still being served " +
                  "from what is cached and from the files in the repository.", true);
    });
  }

  function signOut() {
    if (changeCount() > 0 &&
        !window.confirm("You have unsaved changes. Sign out and lose them?")) return;
    sb.auth.signOut().then(function () { window.location.reload(); });
  }

  function wireGate() {
    on(byId("signInForm"), "submit", function (e) {
      e.preventDefault();
      gateMessage("");
      var btn = byId("signInBtn");
      btn.disabled = true;

      sb.auth.signInWithPassword({
        email: t(byId("email").value),
        password: byId("password").value
      }).then(function (res) {
        if (res.error) {
          btn.disabled = false;
          /* Supabase says "Invalid login credentials" for a wrong password and
             for an account that does not exist, and that is the right answer to
             give back — which of the two it was is not the signer-in's business
             to learn by guessing. */
          gateMessage(res.error.message === "Invalid login credentials"
            ? "That email and password do not match an account."
            : res.error.message);
          return;
        }
        return confirmOwner().then(function (isOwner) {
          if (!isOwner) {
            return sb.auth.signOut().then(function () {
              btn.disabled = false;
              gateMessage("That account exists, but it is not allowed to edit this site.");
            });
          }
          return enter(res.data.user);
        });
      }).catch(function (err) {
        btn.disabled = false;
        gateMessage("Could not reach the database: " + ((err && err.message) || err));
      });
    });
  }


  /* ═══════════════════════════════════════════════
     11. boot
     ═══════════════════════════════════════════════ */

  function boot() {
    if (typeof AROMATI_CONFIG !== "object" || !AROMATI_CONFIG ||
        !/^https:\/\//.test(String(AROMATI_CONFIG.url || "")) ||
        String(AROMATI_CONFIG.anonKey || "").length <= 20) {
      bootMessage("config.js has no project in it, so there is nothing to sign in to. " +
                  "The public site is fine — it falls back to the content stored in the " +
                  "repository — but the editor needs a project URL and a publishable key.", true);
      return;
    }

    if (typeof supabase !== "object" || !supabase || typeof supabase.createClient !== "function") {
      bootMessage("vendor/supabase.js did not load, so the editor cannot sign in. " +
                  "Check that the file is there and that the page is being served over " +
                  "http rather than opened from disk.", true);
      return;
    }

    if (window.location.protocol === "file:") {
      bootMessage("The editor has to be served over http, not opened from a file. " +
                  "Signing in needs an origin. Run `npm run dev` and open the address " +
                  "it prints.", true);
      return;
    }

    sb = supabase.createClient(AROMATI_CONFIG.url, AROMATI_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    restoreTab();
    restoreSections();
    wireGate();
    on(byId("signOut"), "click", signOut);
    on(byId("saveBtn"), "click", save);
    on(byId("discardBtn"), "click", discard);

    /* ⌘S and Ctrl+S. The browser's own Save-page dialog is never what anybody
       pressing it in here wanted. */
    on(document, "keydown", function (e) {
      if (e.key !== "s" && e.key !== "S") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey) return;
      if (byId("app").hidden) return;
      e.preventDefault();
      if (changeCount() > 0) save();
    });

    /* Closing the tab with unsaved work in it is the one mistake this page can
       actually prevent, so it does. */
    on(window, "beforeunload", function (e) {
      if (changeCount() === 0) return;
      e.preventDefault();
      e.returnValue = "";
      return "";
    });

    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { show("gate"); return; }
      return confirmOwner().then(function (isOwner) {
        if (!isOwner) {
          return sb.auth.signOut().then(function () {
            show("gate");
            gateMessage("That session is not allowed to edit this site.");
          });
        }
        return enter(session.user);
      });
    }).catch(function (err) {
      show("gate");
      gateMessage("Could not reach the database: " + ((err && err.message) || err));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* Exported for tools/test-admin.mjs, which drives the panels against a fake
     client rather than the real project. Nothing here is called by the page. */
  return {
    _test: {
      settingProblem: settingProblem,
      copyProblem: copyProblem,
      mustNotBeEmpty: mustNotBeEmpty,
      needsDescription: needsDescription,
      readOrientation: readOrientation,
      rawSize: rawSize,
      orientationToApply: orientationToApply,
      fitInside: fitInside,
      shapeName: shapeName,
      SETTING_RULES: SETTING_RULES,
      WRITABLE: WRITABLE,
      CAN_ADD: CAN_ADD,
      TABLES: TABLES,
      SELECTS: SELECTS
    }
  };
})();
