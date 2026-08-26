/* ═══════════════════════════════════════════════
   AROMATI — the audit log viewer
   ═══════════════════════════════════════════════

   One page, every admin. The same gate as the editor and the same question
   behind it — may this account edit the site (is_owner()) — because the
   history of what admins did belongs to all of them equally
   (20260822000200_audit_shared_history.sql). A stranger passes nothing and
   is signed back out with a sentence saying so, because RLS answers a
   refused SELECT with zero rows, and a page that just showed nothing would
   read as a broken feature rather than a locked door.

   ── the one security rule, same as the editor ──
   Every node below is built with createElement and filled with textContent.
   Never innerHTML, never insertAdjacentHTML. The log's summaries and details
   are owner-typed CMS text on the way back out — the whole reason the rule
   exists on the way in.

   ── what this page is ──
   It is mostly a window onto the history. The temporary session cleanup
   control is deliberately narrower: after confirmation it can remove only
   login rows, never saves, publishes, or unsaved-work records. */

(function () {
  "use strict";

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
  function t(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

  var sb = null;
  var account = null;

  /* The café's clock, not the reader's. The site resolves "now" in
     America/New_York (init_cms.sql, the note at the top), and a log entry
     that says when something happened should say it in the zone the thing
     happened in. Falls back to the browser's own zone if Intl is absent. */
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    try {
      return d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
      }) + " ET";
    } catch (err) {
      return d.toLocaleString();
    }
  }

  var ACTION_LABELS = { login: "Session", save: "Save", publish: "Publish", unsaved: "Unsaved" };

  /* The accounts the allowlist holds. The dropdown starts from these rather
     than from the rows, so "did this person ever do anything?" can be asked
     and answered with an empty list — a dropdown built from the rows could
     only ask about people who had already done something. A row from any
     other account is still added to the list, because hiding it would be the
     one thing this page exists to prevent. */
  var KNOWN_ACTORS = [
    "info@aromatinyc.com",
    "aragvelipalazzolo@gmail.com",
    "lachedon@gmail.com"
  ];

  var entries = [];   // everything the last load brought back, unfiltered

  /* The actions whose badge is red — the rows "Unsaved changes" keeps. One
     word today, and the button says so; the list exists so the next kind of
     row that deserves a red badge joins it here, in one place. */
  var ATTENTION = ["unsaved"];
  var attentionOnly = false;
  var dayValueOnFocus = "";
  var dayChangedWhileOpen = false;
  var dayPickerOpen = false;
  var dayPickerCloseTimer = null;
  var customDayPicker = false;
  var dayDraftValue = "";
  var dayViewYear = 0;
  var dayViewMonth = 0;
  var sessionTransitionTimer = null;
  var sessionTransitionToken = 0;
  var SESSION_SWITCH_MS = 220;

  var LOG_PICKERS = [
    { select: "actorFilter", root: "actorFilterPicker", toggle: "actorFilterToggle", text: "actorFilterText", menu: "actorFilterMenu" },
    { select: "dateFilter", root: "dateFilterPicker", toggle: "dateFilterToggle", text: "dateFilterText", menu: "dateFilterMenu" }
  ];

  /* ═══════════════════════════════════════════════
     the list
     ═══════════════════════════════════════════════ */

  function renderEntry(entry) {
    var row = el("div", "logrow logrow--" + entry.action);

    var head = el("div", "logrow__head");
    head.appendChild(el("span", "logrow__when", when(entry.created_at)));
    head.appendChild(el("span", "logrow__badge", ACTION_LABELS[entry.action] || entry.action));
    head.appendChild(el("span", "logrow__actor", entry.actor_email || "unknown account"));
    row.appendChild(head);

    row.appendChild(el("p", "logrow__summary", entry.summary));

    /* detail is the folded-flat change list the editor captured at the moment
       the save started — kind, title, and one line per field that moved. */
    var detail = entry.detail;
    if (detail && detail.length) {
      var list = el("ul", "logrow__detail");
      detail.forEach(function (d) {
        var item = el("li", "logrow__detail-item");
        var kind = d.kind === "added" ? "Added" : d.kind === "removed" ? "Removed" : "Changed";
        item.appendChild(el("span", "logrow__detail-title",
          kind + " " + (d.title || "a row") + (d.where ? " — " + d.where : "")));
        (d.lines || []).forEach(function (line) {
          item.appendChild(el("span", "logrow__detail-line", line));
        });
        list.appendChild(item);
      });
      row.appendChild(list);
    }

    return row;
  }

  function renderList(id, rows, emptyText) {
    var list = byId(id);
    clear(list);
    if (!rows.length) {
      list.appendChild(el("p", "loglist__empty", emptyText));
      return;
    }
    rows.forEach(function (entry) { list.appendChild(renderEntry(entry)); });
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* The sessions rail has one meaningful state change when the attention
     filter moves: cards leave and the explanatory empty box arrives. Keep
     the old nodes long enough to animate them out before replacing them, so
     the new box does not simply pop into an unrelated layout. */
  function renderSessionList(rows, emptyText, animate) {
    var list = byId("sessionlist");
    var nextView = rows.length ? "rows" : "empty";
    var currentView = list.getAttribute("data-session-view");
    var canAnimate = Boolean(animate && currentView && currentView !== nextView &&
      list.children.length && !prefersReducedMotion());

    sessionTransitionToken += 1;
    var token = sessionTransitionToken;
    if (sessionTransitionTimer) {
      window.clearTimeout(sessionTransitionTimer);
      sessionTransitionTimer = null;
    }
    list.classList.remove("loglist--session-exit", "loglist--session-enter");

    if (!canAnimate) {
      renderList("sessionlist", rows, emptyText);
      list.setAttribute("data-session-view", nextView);
      list.scrollTop = 0;
      return;
    }

    void list.offsetWidth;
    list.classList.add("loglist--session-exit");
    sessionTransitionTimer = window.setTimeout(function () {
      if (token !== sessionTransitionToken) return;
      sessionTransitionTimer = null;
      renderList("sessionlist", rows, emptyText);
      list.setAttribute("data-session-view", nextView);
      list.scrollTop = 0;
      list.classList.remove("loglist--session-exit");
      void list.offsetWidth;
      list.classList.add("loglist--session-enter");
      sessionTransitionTimer = window.setTimeout(function () {
        if (token !== sessionTransitionToken) return;
        sessionTransitionTimer = null;
        list.classList.remove("loglist--session-enter");
      }, SESSION_SWITCH_MS);
    }, SESSION_SWITCH_MS);
  }

  /* "When" is answered in the café's day, not the reader's: today in New
     York, yesterday in New York. en-CA is the locale that spells a date as
     YYYY-MM-DD, the one spelling a comparison can be made in. */
  function etDay(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    } catch (err) {
      return d.toISOString().slice(0, 10);
    }
  }

  /* A day picked by hand beats a category — "on the 14th" is a narrower
     question than "this week", and asking it should not require un-asking
     the other first. Choosing either control clears the other. */
  function applyFilters(animateSessions) {
    var actor = byId("actorFilter").value;
    var span = byId("dateFilter").value;
    var day = byId("dayFilter").value;
    var now = Date.now();
    var today = etDay(new Date(now).toISOString());
    var yesterday = etDay(new Date(now - 86400000).toISOString());
    var DAY_MS = 86400000;

    var filtered = Boolean(actor || span || day);
    var shown = entries.filter(function (entry) {
      if (actor && entry.actor_email !== actor) return false;
      if (day) return etDay(entry.created_at) === day;
      var age = now - new Date(entry.created_at).getTime();
      if (span === "today") return etDay(entry.created_at) === today;
      if (span === "yesterday") return etDay(entry.created_at) === yesterday;
      if (span === "week") return age <= 7 * DAY_MS;
      if (span === "month") return age <= 30 * DAY_MS;
      return true;
    });

    /* Sessions get their own column: the door opening is worth a record, but
       a busy day of opens should never push an actual change out of sight. */
    var changes = shown.filter(function (e) { return e.action !== "login"; });
    var sessions = shown.filter(function (e) { return e.action === "login"; });
    if (attentionOnly) {
      changes = changes.filter(function (e) { return ATTENTION.indexOf(e.action) !== -1; });
      sessions = [];
    }
    renderList("loglist", changes, attentionOnly
      ? "No unsaved work."
      : filtered
        ? "No changes match those filters."
        : "Nothing yet. Saves, discards and publishes appear here as they happen.");
    renderSessionList(sessions, attentionOnly
      ? "Sessions are never unsaved work."
      : filtered
        ? "No sessions match those filters."
        : "No sessions yet.", animateSessions);
    byId("changeCount").textContent = "(" + changes.length + ")";
    byId("sessionCount").textContent = "(" + sessions.length + ")";
    byId("tabChangeCount").textContent = "(" + changes.length + ")";
    byId("tabSessionCount").textContent = "(" + sessions.length + ")";
  }

  function syncClearSessionsButton() {
    var button = byId("clearSessionsBtn");
    if (!button) return;
    button.disabled = button.getAttribute("aria-busy") === "true";
  }

  function pickerBySelect(id) {
    for (var i = 0; i < LOG_PICKERS.length; i += 1) {
      if (LOG_PICKERS[i].select === id) return LOG_PICKERS[i];
    }
    return null;
  }

  function pickerSelectedOption(select) {
    for (var i = 0; i < select.options.length; i += 1) {
      if (select.options[i].value === select.value) return select.options[i];
    }
    return select.options[0] || null;
  }

  function pickerOptionForValue(menu, value) {
    var options = menu.querySelectorAll('[role="option"]');
    for (var i = 0; i < options.length; i += 1) {
      if (options[i].getAttribute("data-value") === value) return options[i];
    }
    return options[0] || null;
  }

  function closeLogPicker(config, returnFocus) {
    var root = byId(config.root);
    var toggle = byId(config.toggle);
    var menu = byId(config.menu);
    if (!root || !toggle || !menu) return;

    root.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    if (root._logPickerCloseTimer) window.clearTimeout(root._logPickerCloseTimer);
    root._logPickerCloseTimer = window.setTimeout(function () {
      if (!root.classList.contains("is-open")) menu.hidden = true;
    }, 240);
    if (returnFocus) toggle.focus();
  }

  function openLogPicker(config, focusOption) {
    var root = byId(config.root);
    var toggle = byId(config.toggle);
    var menu = byId(config.menu);
    var select = byId(config.select);
    if (!root || !toggle || !menu || !select) return;

    closeDayPicker();
    LOG_PICKERS.forEach(function (other) {
      if (other !== config) closeLogPicker(other, false);
    });
    if (root._logPickerCloseTimer) window.clearTimeout(root._logPickerCloseTimer);
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    void menu.offsetWidth;
    window.requestAnimationFrame(function () {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      root.classList.add("is-open");
      if (focusOption) {
        var option = pickerOptionForValue(menu, select.value);
        if (option) option.focus();
      }
    });
  }

  function chooseLogPickerValue(config, value) {
    var select = byId(config.select);
    if (!select) return;
    select.value = value;
    syncLogPicker(config.select);
    closeLogPicker(config, true);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveLogPickerFocus(config, current, direction) {
    var menu = byId(config.menu);
    if (!menu) return;
    var options = menu.querySelectorAll('[role="option"]');
    if (!options.length) return;
    var index = Array.prototype.indexOf.call(options, current);
    var next = index + direction;
    if (index < 0) next = direction > 0 ? 0 : options.length - 1;
    next = Math.max(0, Math.min(options.length - 1, next));
    options[next].focus();
  }

  function syncLogPicker(selectId) {
    var config = pickerBySelect(selectId);
    if (!config) return;
    var select = byId(config.select);
    var toggle = byId(config.toggle);
    var text = byId(config.text);
    var menu = byId(config.menu);
    if (!select || !toggle || !text || !menu) return;

    var selected = pickerSelectedOption(select);
    text.textContent = selected ? selected.textContent : "";
    clear(menu);
    Array.prototype.forEach.call(select.options, function (option) {
      var item = el("button", "logfilter__option", option.textContent);
      item.type = "button";
      item.setAttribute("role", "option");
      item.setAttribute("data-value", option.value);
      item.setAttribute("aria-selected", option.value === select.value ? "true" : "false");
      on(item, "click", function () { chooseLogPickerValue(config, option.value); });
      on(item, "keydown", function (event) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveLogPickerFocus(config, item, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveLogPickerFocus(config, item, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          var first = menu.querySelector('[role="option"]');
          if (first) first.focus();
        } else if (event.key === "End") {
          event.preventDefault();
          var options = menu.querySelectorAll('[role="option"]');
          if (options.length) options[options.length - 1].focus();
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          chooseLogPickerValue(config, option.value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeLogPicker(config, true);
        }
      });
      menu.appendChild(item);
    });
  }

  function initLogFilterPickers() {
    LOG_PICKERS.forEach(function (config) {
      var root = byId(config.root);
      var toggle = byId(config.toggle);
      if (!root || !toggle) return;
      syncLogPicker(config.select);
      on(toggle, "click", function () {
        if (root.classList.contains("is-open")) closeLogPicker(config, false);
        else openLogPicker(config, false);
      });
      on(toggle, "keydown", function (event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openLogPicker(config, true);
        } else if (event.key === "Escape") {
          closeLogPicker(config, false);
        }
      });
    });
    on(document, "pointerdown", function (event) {
      LOG_PICKERS.forEach(function (config) {
        var root = byId(config.root);
        if (root && !root.contains(event.target)) closeLogPicker(config, false);
      });
    });
  }

  function refreshActorOptions() {
    var select = byId("actorFilter");
    var kept = select.value;
    var seen = KNOWN_ACTORS.slice();
    clear(select);
    select.appendChild(el("option", "", "Everyone")).value = "";
    seen.forEach(function (email) {
      select.appendChild(el("option", "", email)).value = email;
    });
    entries.forEach(function (entry) {
      var email = entry.actor_email;
      if (!email || seen.indexOf(email) !== -1) return;
      seen.push(email);
      select.appendChild(el("option", "", email)).value = email;
    });
    select.value = kept;
    syncLogPicker("actorFilter");
  }

  function logMessage(text) {
    var node = byId("logMsg");
    node.textContent = text || "";
    node.hidden = !text;
  }

  function setDayValue(value) {
    var input = byId("dayFilter");
    input.value = value || "";
    syncDayField();
  }

  function syncDayField() {
    var input = byId("dayFilter");
    var parts = input.value.split("-");
    var display = parts.length === 3
      ? parts[1] + "/" + parts[2] + "/" + parts[0]
      : "Select a date";
    byId("dayFilterWrap").classList.toggle("is-filled", Boolean(input.value));
    byId("dayFilterText").textContent = display;
  }

  function padNumber(value) { return String(value).padStart(2, "0"); }

  function dateValue(year, month, day) {
    return year + "-" + padNumber(month + 1) + "-" + padNumber(day);
  }

  function dateParts(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 3) return null;
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var day = Number(parts[2]);
    if (!year || month < 0 || month > 11 || !day || day > 31) return null;
    return { year: year, month: month, day: day };
  }

  function browserDay() {
    var d = new Date();
    return dateValue(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function pickerToday() {
    return etDay(new Date().toISOString()) || browserDay();
  }

  function pickerDayLabel(value) {
    var parts = dateParts(value);
    if (!parts) return value;
    return new Date(parts.year, parts.month, parts.day).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
  }

  function renderDayPicker() {
    var month = new Date(dayViewYear, dayViewMonth, 1);
    byId("dayPickerMonth").textContent = month.toLocaleDateString("en-US", {
      month: "long", year: "numeric"
    });

    var grid = byId("dayPickerGrid");
    clear(grid);
    for (var blank = 0; blank < month.getDay(); blank += 1) {
      grid.appendChild(el("span", "daypicker__empty"));
    }

    var daysInMonth = new Date(dayViewYear, dayViewMonth + 1, 0).getDate();
    var today = pickerToday();
    for (var day = 1; day <= daysInMonth; day += 1) {
      var value = dateValue(dayViewYear, dayViewMonth, day);
      var button = el("button", "daypicker__day", String(day));
      button.type = "button";
      button.setAttribute("aria-label", pickerDayLabel(value));
      button.setAttribute("aria-pressed", dayDraftValue === value ? "true" : "false");
      if (dayDraftValue === value) button.classList.add("is-selected");
      if (today === value) button.classList.add("is-today");
      (function (pickedValue) {
        on(button, "click", function () {
          dayDraftValue = pickedValue;
          renderDayPicker();
        });
      }(value));
      grid.appendChild(button);
    }

    byId("dayPickerDone").disabled = !dayDraftValue;
    byId("dayPickerClear").disabled = !byId("dayFilter").value && !dayDraftValue;
  }

  function closeDayPicker() {
    var picker = byId("dayPicker");
    if (!picker) return;
    dayPickerOpen = false;
    byId("dayFilter").setAttribute("aria-expanded", "false");
    picker.classList.remove("is-open");
    if (dayPickerCloseTimer) window.clearTimeout(dayPickerCloseTimer);
    dayPickerCloseTimer = window.setTimeout(function () {
      if (!dayPickerOpen) picker.hidden = true;
    }, 240);
  }

  function openDayPicker() {
    var input = byId("dayFilter");
    if (dayPickerOpen) {
      closeDayPicker();
      return;
    }
    var current = dateParts(input.value);
    var start = current || dateParts(pickerToday()) || dateParts(browserDay());
    LOG_PICKERS.forEach(function (config) { closeLogPicker(config, false); });
    dayDraftValue = current ? input.value : "";
    dayViewYear = start.year;
    dayViewMonth = start.month;
    dayPickerOpen = true;
    var picker = byId("dayPicker");
    if (dayPickerCloseTimer) window.clearTimeout(dayPickerCloseTimer);
    picker.hidden = false;
    picker.classList.remove("is-open");
    input.setAttribute("aria-expanded", "true");
    renderDayPicker();
    void picker.offsetWidth;
    window.requestAnimationFrame(function () {
      if (dayPickerOpen) picker.classList.add("is-open");
    });
  }

  function commitDayPicker(value) {
    if (!value) return;
    setDayValue(value);
    byId("dateFilter").value = "";
    syncLogPicker("dateFilter");
    closeDayPicker();
    applyFilters();
  }

  function initCustomDayPicker() {
    var input = byId("dayFilter");
    input.type = "text";
    input.readOnly = true;
    input.setAttribute("inputmode", "none");
    input.setAttribute("aria-readonly", "true");

    on(input, "click", function (event) {
      event.preventDefault();
      openDayPicker();
    });
    on(input, "keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDayPicker();
      } else if (event.key === "Escape") {
        closeDayPicker();
      }
    });
    on(byId("dayPickerPrev"), "click", function () {
      dayViewMonth -= 1;
      if (dayViewMonth < 0) { dayViewMonth = 11; dayViewYear -= 1; }
      renderDayPicker();
    });
    on(byId("dayPickerNext"), "click", function () {
      dayViewMonth += 1;
      if (dayViewMonth > 11) { dayViewMonth = 0; dayViewYear += 1; }
      renderDayPicker();
    });
    on(byId("dayPickerDone"), "click", function () { commitDayPicker(dayDraftValue); });
    on(byId("dayPickerCancel"), "click", closeDayPicker);
    on(byId("dayPickerClear"), "click", function () {
      setDayValue("");
      closeDayPicker();
      applyFilters();
    });
    on(document, "pointerdown", function (event) {
      var picker = byId("dayPicker");
      if (dayPickerOpen && !picker.contains(event.target) && event.target !== input) {
        closeDayPicker();
      }
    });
    on(document, "keydown", function (event) {
      if (dayPickerOpen && event.key === "Escape") closeDayPicker();
    });
  }

  function load() {
    var btn = byId("refreshBtn");
    btn.disabled = true;
    return sb.from("audit_log")
      .select("actor_email, action, summary, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(function (res) {
        btn.disabled = false;
        if (res.error) {
          logMessage("The history would not load: " + res.error.message);
          return;
        }
        logMessage("");
        entries = res.data || [];
        syncClearSessionsButton();
        refreshActorOptions();
        applyFilters();
      }, function (err) {
        btn.disabled = false;
        logMessage("The history would not load: " + ((err && err.message) || err));
      });
  }

  /* ═══════════════════════════════════════════════
     the gate
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

  function rpc(name) {
    return sb.rpc(name).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data === true;
    });
  }

  /* One question: may this account edit the site (is_owner()). Every
     allowlisted account may also read the history — the log is shared by the
     people it records, per 20260822000200_audit_shared_history.sql. */
  function admit(user) {
    return rpc("is_owner").then(function (isOwner) {
      if (!isOwner) {
        return sb.auth.signOut().then(function () {
          show("gate");
          gateMessage("That account exists, but it is not allowed on this site.");
        });
      }
      account = user;
      byId("who").textContent = "Signed in as " + (user.email || "an admin");
      show("app");
      return load();
    });
  }

  /* One pane at a time on narrow screens (see the logtabs note in the
     markup). The class lives on the columns' parent so CSS owns what shows;
     the buttons only say which. */
  function showPane(which) {
    var cols = document.querySelector(".logcols");
    var onChanges = which !== "sessions";
    if (cols) {
      var showSessions = !onChanges;
      var paneChanged = cols.classList.contains("logcols--sessions") !== showSessions;
      cols.classList.toggle("logcols--sessions", showSessions);
      if (paneChanged) {
        cols.classList.remove("logcols--reveal");
        void cols.offsetWidth;
        cols.classList.add("logcols--reveal");
      }
    }
    byId("tabChanges").classList.toggle("is-on", onChanges);
    byId("tabSessions").classList.toggle("is-on", !onChanges);
    byId("tabChanges").setAttribute("aria-selected", onChanges ? "true" : "false");
    byId("tabSessions").setAttribute("aria-selected", onChanges ? "false" : "true");
  }

  function logUsesTabs() {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 900px)").matches;
    }
    return window.innerWidth <= 900;
  }

  function clearLoggedSessions() {
    var button = byId("clearSessionsBtn");
    if (!button || button.disabled) return;
    if (!window.confirm("Clear all logged sessions from the audit log? This cannot be undone.")) {
      return;
    }

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    logMessage("Clearing logged sessions…");
    sb.from("audit_log")
      .delete()
      .eq("action", "login")
      .select("id")
      .then(function (res) {
        button.removeAttribute("aria-busy");
        if (res.error) {
          syncClearSessionsButton();
          logMessage("The logged sessions would not clear: " + res.error.message);
          return;
        }
        var clearedCount = Array.isArray(res.data) ? res.data.length : 0;
        entries = entries.filter(function (entry) { return entry.action !== "login"; });
        syncClearSessionsButton();
        refreshActorOptions();
        logMessage(clearedCount ? "Logged sessions cleared." : "No logged sessions to clear.");
        applyFilters();
      }, function (err) {
        button.removeAttribute("aria-busy");
        syncClearSessionsButton();
        logMessage("The logged sessions would not clear: " + ((err && err.message) || err));
      });
  }

  function setFilterOrigin(button, event) {
    var rect = button.getBoundingClientRect();
    var x = Number(event.clientX);
    var y = Number(event.clientY);
    if (!isFinite(x) || !isFinite(y) || (event.detail === 0 && !event.pointerType)) {
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    x = Math.max(0, Math.min(rect.width, x - rect.left));
    y = Math.max(0, Math.min(rect.height, y - rect.top));
    button.style.setProperty("--filter-x", x + "px");
    button.style.setProperty("--filter-y", y + "px");
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
          /* Same answer as the editor gives, for the same reason: which of
             the two it was is not the signer-in's business to learn. */
          gateMessage(res.error.message === "Invalid login credentials"
            ? "That email and password do not match an account."
            : res.error.message);
          return;
        }
        return admit(res.data.user).then(function () {
          btn.disabled = false;
        });
      }).catch(function (err) {
        btn.disabled = false;
        gateMessage("Could not reach the database: " + ((err && err.message) || err));
      });
    });

    on(byId("signOut"), "click", function () {
      sb.auth.signOut().then(function () { window.location.reload(); });
    });
    on(byId("refreshBtn"), "click", load);
    initLogFilterPickers();

    /* The calendar is custom everywhere now. It was introduced for iPhone
       first, but keeping desktop on the browser's native date dialog made
       the same field feel like two different controls. */
    customDayPicker = true;
    initCustomDayPicker();

    on(byId("dayFilterWrap"), "click", function (event) {
      var input = byId("dayFilter");
      if (event.target === input) return;
      event.preventDefault();
      if (customDayPicker) {
        openDayPicker();
        return;
      }
      input.focus();
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
          return;
        } catch (err) { /* Fall through to the native click fallback. */ }
      }
      input.click();
    });

    on(byId("actorFilter"), "change", applyFilters);
    on(byId("dateFilter"), "change", function () {
      if (customDayPicker) closeDayPicker();
      if (byId("dateFilter").value) setDayValue("");
      applyFilters();
    });
    if (!customDayPicker) {
      function rememberDayOpen() {
        if (dayPickerOpen) return;
        dayPickerOpen = true;
        dayValueOnFocus = byId("dayFilter").value;
        dayChangedWhileOpen = false;
      }
      on(byId("dayFilter"), "pointerdown", rememberDayOpen);
      on(byId("dayFilter"), "touchstart", rememberDayOpen);
      on(byId("dayFilter"), "focus", rememberDayOpen);
      on(byId("dayFilter"), "blur", function () { dayPickerOpen = false; });
      on(byId("dayFilter"), "input", function () {
        dayChangedWhileOpen = true;
      });
      on(byId("dayFilter"), "change", function () {
        var input = byId("dayFilter");
        var openedEmptyAndUntouched = !dayValueOnFocus && !dayChangedWhileOpen;
        if (openedEmptyAndUntouched && input.value === browserDay()) {
          setDayValue("");
          dayPickerOpen = false;
          return;
        }
        if (input.value) {
          byId("dateFilter").value = "";
          syncLogPicker("dateFilter");
        }
        dayPickerOpen = false;
        syncDayField();
        applyFilters();
      });
    }

    on(byId("attentionBtn"), "click", function (event) {
      setFilterOrigin(this, event);
      attentionOnly = !attentionOnly;
      var btn = byId("attentionBtn");
      btn.classList.toggle("is-on", attentionOnly);
      btn.setAttribute("aria-pressed", attentionOnly ? "true" : "false");
      if (attentionOnly && logUsesTabs()) showPane("changes");
      applyFilters(true);
    });

    on(byId("clearSessionsBtn"), "click", clearLoggedSessions);

    on(byId("tabChanges"), "click", function (event) {
      setFilterOrigin(this, event);
      showPane("changes");
    });
    on(byId("tabSessions"), "click", function (event) {
      setFilterOrigin(this, event);
      showPane("sessions");
    });
    setDayValue("");
  }

  /* ═══════════════════════════════════════════════
     boot
     ═══════════════════════════════════════════════ */

  function boot() {
    if (typeof AROMATI_CONFIG !== "object" || !AROMATI_CONFIG ||
        !/^https:\/\//.test(String(AROMATI_CONFIG.url || "")) ||
        String(AROMATI_CONFIG.anonKey || "").length <= 20) {
      bootMessage("config.js has no project in it, so there is nothing to sign in to. " +
                  "The public site still works because it falls back to content stored in " +
                  "the repository. This page needs a project URL and a publishable key.", true);
      return;
    }

    if (typeof supabase !== "object" || !supabase || typeof supabase.createClient !== "function") {
      bootMessage("vendor/supabase.js did not load, so this page cannot sign in. " +
                  "Check that the file is there and that the page is being served over " +
                  "http rather than opened from disk.", true);
      return;
    }

    if (window.location.protocol === "file:") {
      bootMessage("This page has to be served over http, not opened from a file. " +
                  "Signing in needs an origin. Run `npm run dev` and open the address " +
                  "it prints, with /audit-log at the end.", true);
      return;
    }

    sb = supabase.createClient(AROMATI_CONFIG.url, AROMATI_CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    wireGate();

    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) { show("gate"); return; }
      return admit(session.user);
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
})();
