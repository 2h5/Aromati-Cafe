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
    "menu_courses", "menu_items", "menu_item_pours", "faq_entries"
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
    faq_entries:     ["question", "answer", "is_published", "sort_order"]
  };

  /* Where the owner may add and remove rows at all. site_settings, site_copy
     and business_hours are absent on purpose: their row sets are decided by
     what the site renders and by there being seven days in a week. The
     database has no insert or delete policy for them either. */
  var CAN_ADD = ["hours_exceptions", "menu_courses", "menu_items", "menu_item_pours", "faq_entries"];

  var sb = null;              // the Supabase client
  var account = null;         // the signed-in user
  var baseline = {};          // table → { id: row }
  var draft = {};             // table → [row], in display order
  var removed = {};           // table → [id] of rows the owner deleted
  var newRows = 0;            // counter behind the temporary ids

  var ui = {
    tab: "copy",
    open: {},                 // cardId → true when expanded
    menuPage: "food",
    search: "",
    fields: []                // every rendered field, for validation to reach
  };

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
      message: "That does not look like an email address. It needs an @ and a dot after it, for example info@aromatiNY.com." },

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
      cardId: spec.cardId, tab: spec.tab, label: spec.label
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
    wrap.appendChild(input);

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

    f.wrap = wrap;
    f.input = input;

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
      wrap.className = "field" + (edited ? " field--edited" : "") + extra;
      if (counter) {
        var len = String(input.value).length;
        counter.textContent = len + " / " + spec.max;
        counter.className = "field__count" + (len > spec.max ? " field__count--over" : "");
      }
    }
    f.refresh = refreshMark;

    f.focus = function () {
      openTab(f.tab);
      if (f.cardId) ui.open[f.cardId] = true;
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

  /* ── cards ─────────────────────────────────── */

  function makeCard(id, title, opts) {
    opts = opts || {};
    var wrap = el("section", "card");
    var head = el("button", "card__head");
    head.type = "button";

    var caret = el("span", "card__caret", "▸");
    head.appendChild(caret);
    head.appendChild(el("span", null, title));

    if (opts.dot) head.appendChild(el("span", "card__dot"));
    if (opts.count !== undefined && opts.count !== null) {
      head.appendChild(el("span", "card__count", opts.count));
    }

    var body = el("div", "card__body");
    var open = !!ui.open[id];
    body.hidden = !open;
    caret.textContent = open ? "▾" : "▸";

    on(head, "click", function () {
      var nowOpen = body.hidden;
      body.hidden = !nowOpen;
      caret.textContent = nowOpen ? "▾" : "▸";
      ui.open[id] = nowOpen;
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return { wrap: wrap, body: body, head: head };
  }


  /* ═══════════════════════════════════════════════
     4. the panels
     ═══════════════════════════════════════════════ */

  var PANELS = [
    { id: "copy",    name: "Words",    render: renderCopyPanel },
    { id: "hours",   name: "Hours",    render: renderHoursPanel },
    { id: "contact", name: "Contact",  render: renderContactPanel },
    { id: "menu",    name: "Menus",    render: renderMenuPanel },
    { id: "faq",     name: "FAQ",      render: renderFaqPanel }
  ];

  function panelChangeCount(id) {
    var tables = {
      copy: ["site_copy"],
      hours: ["business_hours", "hours_exceptions"],
      contact: ["site_settings"],
      menu: ["menu_courses", "menu_items", "menu_item_pours"],
      faq: ["faq_entries"]
    }[id] || [];
    var n = 0;
    tables.forEach(function (table) {
      rowsOf(table).forEach(function (row) { if (rowChanged(table, row)) n += 1; });
      n += (removed[table] || []).length;
    });
    return n;
  }

  function openTab(id) { ui.tab = id; }

  function renderTabs() {
    var host = byId("tabs");
    clear(host);
    PANELS.forEach(function (panel) {
      var b = el("button", "tab", panel.name);
      b.type = "button";
      b.setAttribute("aria-selected", ui.tab === panel.id ? "true" : "false");
      if (panelChangeCount(panel.id) > 0) b.appendChild(el("span", "tab__dot"));
      on(b, "click", function () { openTab(panel.id); renderAll(); });
      host.appendChild(b);
    });
  }

  function renderAll() {
    ui.fields = [];
    renderTabs();
    var host = byId("panels");
    clear(host);
    var panel = PANELS.filter(function (p) { return p.id === ui.tab; })[0] || PANELS[0];
    var node = el("div", "panel");
    panel.render(node);
    host.appendChild(node);
    updateSavebar();
  }


  /* ── the words ─────────────────────────────── */

  function renderCopyPanel(host) {
    host.appendChild(el("p", "panel__intro",
      "Every heading, paragraph and button label on the site. A line break in a " +
      "box below becomes a line break on the page, and *asterisks around a phrase* " +
      "make it italic. Anything else you type appears exactly as you typed it — " +
      "the site never treats this as code."));

    var byPage = {};
    rowsOf("site_copy").forEach(function (row) {
      var page = byPage[row.page] || (byPage[row.page] = {});
      (page[row.section] || (page[row.section] = [])).push(row);
    });

    Object.keys(PAGE_NAMES).forEach(function (page) {
      if (!byPage[page]) return;
      host.appendChild(el("h2", "panel__intro", PAGE_NAMES[page]));

      Object.keys(byPage[page]).forEach(function (section) {
        var rows = byPage[page][section];
        var cardId = "copy:" + page + ":" + section;
        var changed = rows.filter(function (r) { return rowChanged("site_copy", r); }).length;
        var card = makeCard(cardId, section, {
          dot: changed > 0,
          count: rows.length + (rows.length === 1 ? " field" : " fields")
        });

        rows.forEach(function (row) {
          var multiline = String(row.value).indexOf("\n") >= 0 || String(row.value).length > 90;
          var f = makeField({
            table: "site_copy", row: row, col: "value",
            cardId: cardId, tab: "copy",
            label: row.label, help: row.help,
            type: multiline ? "textarea" : "text",
            rows: Math.min(8, 2 + Math.floor(String(row.value).length / 90)),
            max: row.max_length || null,
            value: row.value,
            onInput: function (value, field) {
              row.value = value;
              field.setError(copyProblem(row));
              if (row.max_length) measureHeadline(row, field);
            }
          });
          card.body.appendChild(f.wrap);
        });

        host.appendChild(card.wrap);
      });
    });
  }


  /* ── the hours ─────────────────────────────── */

  function renderHoursPanel(host) {
    host.appendChild(el("p", "panel__intro",
      "The opening hours in one place. They drive the open/closed pill on the " +
      "home page, the table under Visit, the footer, the mobile menu and what " +
      "Google is told — change them here and all five move together."));

    var days = rowsOf("business_hours").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    var changed = days.filter(function (r) { return rowChanged("business_hours", r); }).length;
    var card = makeCard("hours:week", "The usual week", {
      dot: changed > 0, count: "7 days"
    });

    days.forEach(function (row) {
      var name = DAY_NAMES[row.day_of_week] || ("Day " + row.day_of_week);
      var block = el("div", "row");

      var closed = makeCheck("Closed all day", row.is_closed, function (isClosed) {
        row.is_closed = isClosed;
        /* The database will not accept a closed day that still has times on it,
           and neither will the constraint that says so. Clearing them here is
           not a convenience — it is the only state that saves. */
        if (isClosed) { row.opens_at = null; row.closes_at = null; }
        else {
          if (!row.opens_at) row.opens_at = "07:00:00";
          if (!row.closes_at) row.closes_at = "22:00:00";
        }
        renderAll();
      });

      var head = el("div", "field");
      head.appendChild(el("span", "field__label", name));
      head.appendChild(closed.wrap);
      block.appendChild(head);

      if (!row.is_closed) {
        block.appendChild(makeField({
          table: "business_hours", row: row, col: "opens_at",
          cardId: "hours:week", tab: "hours",
          label: "Opens", type: "time", value: toInputTime(row.opens_at),
          onInput: function (v) { row.opens_at = v ? v + ":00" : null; }
        }).wrap);

        block.appendChild(makeField({
          table: "business_hours", row: row, col: "closes_at",
          cardId: "hours:week", tab: "hours",
          label: "Closes", type: "time", value: toInputTime(row.closes_at),
          onInput: function (v) { row.closes_at = v ? v + ":00" : null; }
        }).wrap);
      }

      card.body.appendChild(block);
    });

    host.appendChild(card.wrap);

    /* ── one-off days ── */
    var exceptions = rowsOf("hours_exceptions").slice().sort(function (a, b) {
      return String(a.on_date) < String(b.on_date) ? -1 : 1;
    });
    var exChanged = exceptions.filter(function (r) { return rowChanged("hours_exceptions", r); }).length +
      (removed.hours_exceptions || []).length;

    var exCard = makeCard("hours:exceptions", "Holidays and one-off days", {
      dot: exChanged > 0,
      count: exceptions.length === 0 ? "none" :
        exceptions.length + (exceptions.length === 1 ? " date" : " dates")
    });

    exCard.body.appendChild(el("p", "field__help",
      "A single date that does not follow the usual week — closed for a holiday, " +
      "or closing early for a private event. The site uses it on that date and " +
      "then goes back to normal by itself. Old dates do no harm; delete them when " +
      "you feel like tidying."));

    exceptions.forEach(function (row) {
      var block = el("div", "row");

      block.appendChild(makeField({
        table: "hours_exceptions", row: row, col: "on_date",
        cardId: "hours:exceptions", tab: "hours",
        label: "Date", type: "date", value: row.on_date || "",
        onInput: function (v) { row.on_date = v || null; }
      }).wrap);

      var closedWrap = el("div", "field");
      closedWrap.appendChild(el("span", "field__label", "Closed"));
      closedWrap.appendChild(makeCheck("Closed all day", row.is_closed, function (isClosed) {
        row.is_closed = isClosed;
        if (isClosed) { row.opens_at = null; row.closes_at = null; }
        else {
          if (!row.opens_at) row.opens_at = "07:00:00";
          if (!row.closes_at) row.closes_at = "22:00:00";
        }
        renderAll();
      }).wrap);
      block.appendChild(closedWrap);

      if (!row.is_closed) {
        block.appendChild(makeField({
          table: "hours_exceptions", row: row, col: "opens_at",
          cardId: "hours:exceptions", tab: "hours",
          label: "Opens", type: "time", value: toInputTime(row.opens_at),
          onInput: function (v) { row.opens_at = v ? v + ":00" : null; }
        }).wrap);
        block.appendChild(makeField({
          table: "hours_exceptions", row: row, col: "closes_at",
          cardId: "hours:exceptions", tab: "hours",
          label: "Closes", type: "time", value: toInputTime(row.closes_at),
          onInput: function (v) { row.closes_at = v ? v + ":00" : null; }
        }).wrap);
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

      exCard.body.appendChild(block);
    });

    var add = el("button", "btn btn--small btn--add", "Add a date");
    add.type = "button";
    on(add, "click", function () {
      draft.hours_exceptions.push({
        id: tempId(), on_date: "", is_closed: true,
        opens_at: null, closes_at: null, note: null
      });
      ui.open["hours:exceptions"] = true;
      renderAll();
    });
    exCard.body.appendChild(add);

    host.appendChild(exCard.wrap);
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

  function renderContactPanel(host) {
    host.appendChild(el("p", "panel__intro",
      "The phone number, email, Instagram and address, each stored once and " +
      "written into every place on the site that shows them — the phone alone " +
      "appears in twenty-four."));

    var groups = {};
    rowsOf("site_settings").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    }).forEach(function (row) {
      var bucket = Math.floor((row.sort_order || 0) / 10);
      (groups[bucket] || (groups[bucket] = [])).push(row);
    });

    Object.keys(groups).sort().forEach(function (bucket) {
      var rows = groups[bucket];
      var cardId = "contact:" + bucket;
      var changed = rows.filter(function (r) { return rowChanged("site_settings", r); }).length;
      var card = makeCard(cardId, SETTING_GROUPS[bucket] || "Other settings", {
        dot: changed > 0,
        count: rows.length + (rows.length === 1 ? " field" : " fields")
      });

      rows.forEach(function (row) {
        var f = makeField({
          table: "site_settings", row: row, col: "value",
          cardId: cardId, tab: "contact",
          label: row.label,
          help: row.is_editable ? row.help
            : (row.help ? row.help + " This one is not editable here." : "Not editable here."),
          disabled: !row.is_editable,
          value: row.value,
          onInput: function (value, field) {
            row.value = value;
            field.setError(settingProblem(row));
          }
        });
        card.body.appendChild(f.wrap);
      });

      host.appendChild(card.wrap);
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

  function move(rows, row, by) {
    var from = rows.indexOf(row), to = from + by;
    if (from < 0 || to < 0 || to >= rows.length) return;
    rows.splice(from, 1);
    rows.splice(to, 0, row);
    renumber(rows);
    renderAll();
  }

  function renderMenuPanel(host) {
    host.appendChild(el("p", "panel__intro",
      "The three menu pages. A section is a block with its own heading and its " +
      "own tab; an item is a line inside one. Prices are typed without the " +
      "dollar sign — the site adds it — and 7.50 stays 7.50 rather than " +
      "becoming 7.5."));

    var pick = el("div", "pagepick");
    MENU_PAGES.forEach(function (page) {
      var b = el("button", "pagepick__btn", page.name);
      b.type = "button";
      b.setAttribute("aria-pressed", ui.menuPage === page.id ? "true" : "false");
      on(b, "click", function () { ui.menuPage = page.id; renderAll(); });
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
      applySearch();
    });
    search.appendChild(input);
    var note = el("span", "search__note");
    search.appendChild(note);
    host.appendChild(search);

    var courses = coursesOn(ui.menuPage);
    if (!courses.length) host.appendChild(el("p", "empty", "This page has no sections yet."));

    courses.forEach(function (course) {
      host.appendChild(renderCourse(course, courses).wrap);
    });

    var add = el("button", "btn btn--small btn--add", "Add a section");
    add.type = "button";
    on(add, "click", function () {
      var row = {
        id: tempId(), page: ui.menuPage, course_key: "", tab_label: "", heading: "",
        sizes: null, is_static: false, static_id: null,
        sort_order: coursesOn(ui.menuPage).length + 1
      };
      draft.menu_courses.push(row);
      ui.open["course:" + row.id] = true;
      renderAll();
    });
    host.appendChild(add);

    applySearch();

    function applySearch() {
      var shown = 0, total = 0;
      rowsOf("menu_items").forEach(function (item) {
        var node = document.querySelector('[data-item="' + item.id + '"]');
        if (!node) return;
        total += 1;
        var ok = matchesSearch(item);
        node.hidden = !ok;
        if (ok) shown += 1;
      });
      note.textContent = ui.search
        ? shown + " of " + total + " items on this page match “" + ui.search + "”"
        : "";
      /* A search that matches something inside a collapsed section is a search
         that found nothing, as far as the person doing it can tell. */
      if (ui.search) {
        coursesOn(ui.menuPage).forEach(function (course) {
          var any = itemsIn(course.id).some(matchesSearch);
          var body = document.querySelector('[data-course-body="' + course.id + '"]');
          if (body && any) body.hidden = false;
        });
      }
    }
  }

  function renderCourse(course, siblings) {
    var items = itemsIn(course.id);
    var cardId = "course:" + course.id;
    var changed = rowChanged("menu_courses", course) ||
      items.some(function (i) { return rowChanged("menu_items", i); });

    var card = makeCard(cardId, course.heading || "(untitled section)", {
      dot: changed,
      count: course.is_static ? "built in" :
        items.length + (items.length === 1 ? " item" : " items")
    });
    card.body.setAttribute("data-course-body", course.id);

    var moves = el("span", "item__moves");
    [["▲", -1], ["▼", 1]].forEach(function (pair) {
      var b = el("button", "mini", pair[0]);
      b.type = "button";
      b.title = pair[1] < 0 ? "Move this section up" : "Move this section down";
      var at = siblings.indexOf(course);
      b.disabled = pair[1] < 0 ? at === 0 : at === siblings.length - 1;
      on(b, "click", function (e) { e.stopPropagation(); move(siblings, course, pair[1]); });
      moves.appendChild(b);
    });
    card.head.appendChild(moves);

    if (course.is_static) {
      card.body.appendChild(el("p", "static",
        "Build Your Own Breakfast is built into the page rather than stored here. " +
        "Its position on the menu can be moved with the arrows above; its contents " +
        "are not editable — ask a developer."));
      return card;
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

    items.forEach(function (item) {
      card.body.appendChild(renderItem(item, course, items));
    });

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

    card.body.appendChild(tools);
    return card;
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
    if (rowChanged("menu_items", item)) head.appendChild(el("span", "card__dot"));
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

    var body = el("div", "item__body");
    body.hidden = !ui.open[openId];
    on(head, "click", function () {
      body.hidden = !body.hidden;
      ui.open[openId] = !body.hidden;
    });

    wrap.appendChild(head);
    wrap.appendChild(body);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "name",
      cardId: "course:" + course.id, tab: "menu",
      label: "Name", value: item.name,
      onInput: function (v) { item.name = v; }
    }).wrap);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "tag",
      cardId: "course:" + course.id, tab: "menu",
      label: "Qualifier", value: item.tag || "",
      placeholder: "2022 · 750 ml · 7 toppings",
      help: "The small note beside the name, if there is one. Leave empty for none.",
      onInput: function (v) { item.tag = v ? v : null; }
    }).wrap);

    body.appendChild(makeField({
      table: "menu_items", row: item, col: "description",
      cardId: "course:" + course.id, tab: "menu",
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
      cardId: "course:" + course.id, tab: "menu",
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
        cardId: "course:" + course.id, tab: "menu",
        label: "Price", value: item.price || "", placeholder: "21",
        help: "Without the dollar sign. 7.50 and 21 both stay exactly as typed.",
        onInput: function (v) { item.price = v; }
      }).wrap);
    } else if (shape === "all") {
      body.appendChild(makeField({
        table: "menu_items", row: item, col: "price_all_sizes",
        cardId: "course:" + course.id, tab: "menu",
        label: "Price, across both columns", value: item.price_all_sizes || "",
        onInput: function (v) { item.price_all_sizes = v; }
      }).wrap);
    } else if (shape === "sizes") {
      var priceRow = el("div", "row");
      (course.sizes || []).forEach(function (size, n) {
        var f = makeField({
          table: "menu_items", row: item, col: "prices",
          cardId: "course:" + course.id, tab: "menu",
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
        cardId: "course:" + course.id, tab: "menu",
        label: "Label", value: pour.label, placeholder: "Bottle",
        onInput: function (v) { pour.label = v; }
      }).wrap);
      row.appendChild(makeField({
        table: "menu_item_pours", row: pour, col: "price",
        cardId: "course:" + course.id, tab: "menu",
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


  /* ── the FAQ ───────────────────────────────── */

  function renderFaqPanel(host) {
    var entries = rowsOf("faq_entries").slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    var notice = el("p", "notice");
    notice.appendChild(el("strong", null, "The FAQ page is still undecided. "));
    notice.appendChild(document.createTextNode(
      "The eighteen questions on it today are placeholder text written by the " +
      "studio, and the page itself carries a notice saying so. Nothing has been " +
      "moved into the editor yet, because if the page is dropped the work is " +
      "wasted and if it is rewritten it is wasted twice. Say the word and the " +
      "questions get transcribed — or the page gets removed. Until then anything " +
      "added below is live on the site as soon as it is saved."));
    host.appendChild(notice);

    entries.forEach(function (entry) {
      var cardId = "faq:" + entry.id;
      var card = makeCard(cardId, entry.question || "(new question)", {
        dot: rowChanged("faq_entries", entry),
        count: entry.is_published ? null : "hidden"
      });

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

      host.appendChild(card.wrap);
    });

    if (!entries.length) host.appendChild(el("p", "empty", "No questions yet."));

    var add = el("button", "btn btn--small btn--add", "Add a question");
    add.type = "button";
    on(add, "click", function () {
      var row = {
        id: tempId(), question: "", answer: "", is_published: true,
        sort_order: rowsOf("faq_entries").length + 1
      };
      draft.faq_entries.push(row);
      ui.open["faq:" + row.id] = true;
      renderAll();
    });
    host.appendChild(add);
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

  function updateSavebar() {
    var n = changeCount();
    var bar = byId("savebar");
    bar.hidden = n === 0;
    byId("saveCount").textContent = n === 1
      ? "1 change not yet saved"
      : n + " changes not yet saved";
    if (n === 0) byId("problems").hidden = true;

    /* A tab shows a dot when something under it has changed, and the count in
       the savebar is the only number that matters — so both are rebuilt from
       the same derived state rather than incremented anywhere. */
    var tabs = byId("tabs").children, i;
    for (i = 0; i < tabs.length; i++) {
      var has = panelChangeCount(PANELS[i].id) > 0;
      var dot = tabs[i].querySelector(".tab__dot");
      if (has && !dot) tabs[i].appendChild(el("span", "tab__dot"));
      if (!has && dot) tabs[i].removeChild(dot);
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
        flash("Saved. The site is showing it now.");
      }
    }

    function next(i) {
      if (i >= steps.length) { finish(null); return; }
      var step = steps[i];

      var request;
      if (step.what === "delete") {
        request = sb.from(step.table).delete().eq("id", step.id);
      } else if (step.what === "insert") {
        request = sb.from(step.table).insert(payload(step.table, step.row, idMap)).select("id");
      } else {
        request = sb.from(step.table).update(payload(step.table, step.row, idMap)).eq("id", step.row.id);
      }

      request.then(function (res) {
        if (res.error) { finish(res.error.message || String(res.error)); return; }

        if (step.what === "delete") {
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
    bar.hidden = false;
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
    faq_entries: "id,question,answer,is_published,sort_order"
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
    faq_entries: "sort_order"
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
      show("app");
      renderAll();
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

    wireGate();
    on(byId("signOut"), "click", signOut);
    on(byId("saveBtn"), "click", save);
    on(byId("discardBtn"), "click", discard);

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
      SETTING_RULES: SETTING_RULES,
      WRITABLE: WRITABLE,
      CAN_ADD: CAN_ADD,
      TABLES: TABLES,
      SELECTS: SELECTS
    }
  };
})();
