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

   ── what this page is not ──
   It is not a control. It changes nothing, deletes nothing, and offers no
   button that writes. The table accepts inserts from any allowlisted account
   and reads for allowlisted accounts; this page is only a window onto that. */

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

  /* The actions whose badge is red — the rows "Needs attention" keeps. One
     word today; the list exists so the next kind of row that deserves a red
     badge joins it here, in one place. */
  var ATTENTION = ["unsaved"];
  var attentionOnly = false;

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
  function applyFilters() {
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
      ? "Nothing needs attention."
      : filtered
        ? "No changes match those filters."
        : "Nothing yet. Saves, discards and publishes appear here as they happen.");
    renderList("sessionlist", sessions, attentionOnly
      ? "Sessions are never marked as needing attention."
      : filtered
        ? "No sessions match those filters."
        : "No sessions yet.");
    byId("changeCount").textContent = "(" + changes.length + ")";
    byId("sessionCount").textContent = "(" + sessions.length + ")";
    byId("tabChangeCount").textContent = "(" + changes.length + ")";
    byId("tabSessionCount").textContent = "(" + sessions.length + ")";
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
  }

  function logMessage(text) {
    var node = byId("logMsg");
    node.textContent = text || "";
    node.hidden = !text;
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
    if (cols) cols.classList.toggle("logcols--sessions", !onChanges);
    byId("tabChanges").classList.toggle("is-on", onChanges);
    byId("tabSessions").classList.toggle("is-on", !onChanges);
    byId("tabChanges").setAttribute("aria-selected", onChanges ? "true" : "false");
    byId("tabSessions").setAttribute("aria-selected", onChanges ? "false" : "true");
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

    on(byId("actorFilter"), "change", applyFilters);
    on(byId("dateFilter"), "change", function () {
      if (byId("dateFilter").value) byId("dayFilter").value = "";
      applyFilters();
    });
    on(byId("dayFilter"), "change", function () {
      if (byId("dayFilter").value) byId("dateFilter").value = "";
      applyFilters();
    });

    on(byId("attentionBtn"), "click", function () {
      attentionOnly = !attentionOnly;
      var btn = byId("attentionBtn");
      btn.classList.toggle("is-on", attentionOnly);
      btn.setAttribute("aria-pressed", attentionOnly ? "true" : "false");
      applyFilters();
    });

    on(byId("tabChanges"), "click", function () { showPane("changes"); });
    on(byId("tabSessions"), "click", function () { showPane("sessions"); });
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
