/* ═══════════════════════════════════════════════
   AROMATI — network → localStorage → seed
   ═══════════════════════════════════════════════

   Phase 4. This is the file that decides what the page is built from, and the
   order is the whole design:

     1. what the last visit cached, if it is intact
     2. otherwise the SEED_* files, which are the site as it shipped

   ...rendered **synchronously**, before anything is painted. Only then does a
   request go out, and what comes back is folded in afterwards, and only if it
   is actually different.

   Nothing on this page ever waits on the network. That is not a performance
   preference. The entrance choreography, the reveal observers, the parallax
   and the menu tab cascade all need real DOM to exist before they run, so a
   board that arrives late is not "slower" — it is a board the animations have
   already run past.

   The consequence worth stating plainly: if the database is down, deleted,
   unpaid or misconfigured, the site serves the correct menu from files in git.
   The worst case is "restore from git, lose the last few edits", never "the
   client's site is down and the menu is gone".

   ── no SDK, on purpose ──
   Plain fetch against the REST endpoint. The public pages load no third-party
   script at all; only admin.html gets the Supabase SDK, and it gets it from
   vendor/ rather than a CDN. See memory.md, "Constraints".

   ── the one security rule still applies downstream ──
   Nothing here touches the DOM. Everything this returns is handed to render.js,
   which builds nodes with createElement and fills them with textContent. Data
   arriving from the network is owner-typed text and is treated exactly like
   data arriving from a seed file: as text, never as markup. */

var AROMATI_DATA = (function () {
  "use strict";

  /* Bump when the cached shape changes. An old cache is then ignored rather
     than half-understood — a rename that silently reads `undefined` renders a
     blank menu, which looks like a data-loss bug and is very hard to trace. */
  var CACHE_KEY = "aromati:content:v1";

  /* ── the seed floor ──────────────────────────
     Read through functions rather than captured at load, so a seed file that
     failed to parse leaves a missing key rather than an exception here. */

  function seedContent() {
    return {
      menu:      typeof SEED_MENU === "object" && SEED_MENU ? SEED_MENU : null,
      hours:     typeof SEED_HOURS === "object" && SEED_HOURS ? SEED_HOURS : null,
      hoursNote: typeof SEED_HOURS_NOTE === "string" ? SEED_HOURS_NOTE : null,
      settings:  typeof SEED_SETTINGS === "object" && SEED_SETTINGS ? SEED_SETTINGS : null,
      copy:      typeof SEED_COPY === "object" && SEED_COPY ? SEED_COPY : null
    };
  }

  /* A cache is only usable if it still has the shape the renderer expects. A
     truncated or half-written entry is worse than none: it renders a site that
     is subtly wrong rather than one that is obviously falling back. */
  function looksComplete(c) {
    return !!c &&
      c.menu && typeof c.menu === "object" &&
      c.hours && c.hours.length === 7 &&
      c.settings && typeof c.settings === "object" &&
      c.copy && typeof c.copy === "object";
  }

  /* localStorage throws rather than returning null in a surprising number of
     real situations: Safari private browsing, storage disabled by policy, the
     quota being full, and an opaque origin. All of them mean "no cache", none
     of them mean "stop rendering". */
  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return looksComplete(parsed) ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function writeCache(content) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(content));
    } catch (err) {
      /* Out of quota, or storage refused. The page is already correct; the
         only cost is that the next visit starts from the seeds again. */
    }
  }

  /* What the page renders right now, with no network involved. */
  function current() {
    var cached = readCache();
    return cached || seedContent();
  }

  /* JSON.stringify preserves insertion order, so two objects holding identical
     content compare unequal if their keys were built in a different order —
     and they are: the seed files are hand-ordered, while the database returns
     rows in whatever order the query produced. Comparing raw would report
     "changed" on the first load after the key is configured, every time, and
     replay the whole entrance cascade over a board that had just settled.

     Arrays keep their order, which is the order that is actually meaningful
     here (courses, items, pours). Only object keys are sorted. */
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = stable(value[k]); });
      return out;
    }
    return value;
  }

  function same(a, b) {
    return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  }

  /* ── the network half ────────────────────────── */

  function configured() {
    return typeof AROMATI_CONFIG === "object" && AROMATI_CONFIG &&
      typeof AROMATI_CONFIG.url === "string" && /^https:\/\//.test(AROMATI_CONFIG.url) &&
      typeof AROMATI_CONFIG.anonKey === "string" && AROMATI_CONFIG.anonKey.length > 20;
  }

  function get(path) {
    return fetch(AROMATI_CONFIG.url + "/rest/v1/" + path, {
      headers: {
        apikey: AROMATI_CONFIG.anonKey,
        Authorization: "Bearer " + AROMATI_CONFIG.anonKey,
        Accept: "application/json"
      }
    }).then(function (res) {
      if (!res.ok) throw new Error(path + " → " + res.status);
      return res.json();
    });
  }

  /* ── shaping rows into what render.js already reads ──
     The renderer's input shape is the seed files, and it stays that way. Doing
     the translation here means Phase 1's renderer, and every test written
     against it, keeps working unchanged — and it means the seed files remain a
     genuine drop-in replacement rather than an approximation of one. */

  /* "07:00:00" → minutes past midnight, which is how script.js has always
     reasoned about the clock. */
  function minutes(t) {
    if (typeof t !== "string") return null;
    var m = /^(\d{1,2}):(\d{2})/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function shapeHours(rows) {
    var week = [];
    var i;
    for (i = 0; i < 7; i++) week.push(null);
    rows.forEach(function (r) {
      var d = Number(r.day_of_week);
      if (!(d >= 0 && d <= 6)) return;
      week[d] = r.is_closed
        ? { closed: true, opens: null, closes: null }
        : { closed: false, opens: minutes(r.opens_at), closes: minutes(r.closes_at) };
    });
    /* Seven entries or nothing. A missing day is indistinguishable from a bug
       that dropped one, and the pill would read it as closed forever. */
    for (i = 0; i < 7; i++) if (!week[i]) return null;
    return week;
  }

  var SETTING_NAMES = {
    phone_digits: "phoneDigits",
    phone_country: "phoneCountry",
    email: "email",
    instagram_handle: "instagramHandle",
    schema_type: "schemaType",
    business_name: "businessName",
    cuisine: "cuisine"
  };

  var ADDRESS_NAMES = {
    address_street: "street",
    address_locality: "locality",
    address_region: "region",
    address_postal: "postal",
    address_country: "country"
  };

  function shapeSettings(rows) {
    var out = { address: {}, orderingLinks: {} };
    rows.forEach(function (r) {
      var key = r.key;
      var value = typeof r.value === "string" ? r.value : "";
      if (SETTING_NAMES[key]) { out[SETTING_NAMES[key]] = value; return; }
      if (ADDRESS_NAMES[key]) { out.address[ADDRESS_NAMES[key]] = value; return; }
      /* order_doordash_url → orderingLinks.doordash. Derived rather than
         listed, so adding a third service is a row in the database and no
         change here. An empty value is kept, not dropped: render.js reads an
         empty string as "this service is gone" and removes the link. */
      var order = /^order_([a-z0-9]+)_url$/.exec(key);
      if (order) out.orderingLinks[order[1]] = value;
    });
    return out;
  }

  function shapeCopy(rows) {
    var out = {};
    rows.forEach(function (r) {
      if (typeof r.key === "string") out[r.key] = typeof r.value === "string" ? r.value : "";
    });
    return out;
  }

  function shapeItem(row) {
    var item = { name: row.name };
    if (row.description) item.desc = row.description;
    if (row.tag) item.tag = row.tag;

    if (row.no_price) item.noPrice = true;
    else if (row.price_all_sizes != null) item.priceAllSizes = row.price_all_sizes;
    else if (row.prices != null) item.prices = row.prices;
    else if (row.price != null) item.price = row.price;

    if (row.options_dom_id) item.optionsId = row.options_dom_id;

    var pours = (row.menu_item_pours || []).slice().sort(bySort);
    if (pours.length) {
      item.pours = pours.map(function (p) { return { label: p.label, price: p.price }; });
    }

    var options = (row.menu_item_options || []).slice().sort(bySort);
    if (options.length) {
      item.options = options.map(function (o) { return { name: o.name, price: o.price }; });
    }
    return item;
  }

  /* PostgREST honours `order=` on the top-level rows, but embedded rows come
     back in whatever order the join produced. Sorting here rather than trusting
     it is the difference between "Bottle $60" and a shuffled pour list. */
  function bySort(a, b) {
    var d = (a.sort_order || 0) - (b.sort_order || 0);
    if (d) return d;
    /* Equal sort_order is not a tie to be resolved by luck: two courses that
       share a number must still come back in the same order on every load, or
       the menu quietly reshuffles between visits. */
    return String(a.id) < String(b.id) ? -1 : 1;
  }

  function shapeMenu(courses, items) {
    var byCourse = {};
    items.forEach(function (row) {
      (byCourse[row.course_id] = byCourse[row.course_id] || []).push(row);
    });

    var pages = {};
    courses.slice().sort(bySort).forEach(function (c) {
      var course = {
        key: c.course_key,
        tabLabel: c.tab_label,
        heading: c.heading
      };
      if (c.sizes && c.sizes.length) course.sizes = c.sizes;

      if (c.is_static) {
        /* Build Your Own. The data records where it sits and nothing else —
           its markup is hand-written and out of scope. See memory.md. */
        course.isStatic = true;
        course.staticId = c.static_id;
      } else {
        course.items = (byCourse[c.id] || []).slice().sort(bySort).map(shapeItem);
      }

      (pages[c.page] = pages[c.page] || []).push(course);
    });
    return pages;
  }

  /* ── fetch, shape, and hand back only if it is genuinely different ──
     Re-rendering identical content would replay the entrance choreography over
     a board that is already on screen — a flicker with nothing behind it. */

  function refresh(done) {
    done = typeof done === "function" ? done : function () {};

    if (!configured() || typeof fetch !== "function") {
      done(null);
      return;
    }

    var wanted = [
      get("site_settings?select=key,value"),
      get("business_hours?select=day_of_week,is_closed,opens_at,closes_at"),
      get("site_copy?select=key,value"),
      get("menu_courses?select=id,page,course_key,tab_label,heading,sizes,is_static,static_id,sort_order&order=sort_order"),
      get("menu_items?select=id,course_id,name,tag,description,price,prices,price_all_sizes,no_price,options_dom_id,sort_order," +
          "menu_item_pours(id,label,price,sort_order),menu_item_options(id,name,price,sort_order)&order=sort_order")
    ];

    Promise.all(wanted).then(function (r) {
      var hours = shapeHours(r[1]);
      var menu = shapeMenu(r[3], r[4]);

      /* An empty result is not fresh content, it is a project that has not
         been seeded — or a policy that stopped returning rows. Rendering it
         would blank the site, which is precisely the failure the seed floor
         exists to prevent. */
      if (!hours || !r[0].length || !r[2].length || !Object.keys(menu).length) {
        throw new Error("the database answered, but with nothing in it");
      }

      var fresh = {
        menu: menu,
        hours: hours,
        hoursNote: seedContent().hoursNote,   // not yet a database field
        settings: shapeSettings(r[0]),
        copy: shapeCopy(r[2])
      };

      var before = current();
      writeCache(fresh);

      if (same(fresh, before)) { done(null); return; }
      done(fresh);
    }).catch(function (err) {
      /* Every failure lands here and every one of them is survivable: offline,
         DNS, a wrong key, a paused project, a policy change, malformed JSON.
         The page is already rendered and correct. Say so quietly — a visitor
         must never see this, and a developer must be able to find it. */
      if (window.console) console.warn("aromati: live content unavailable, using cached or seed data —", err && err.message);
      done(null);
    });
  }

  /* `stable` is exported for tools/test-live.mjs, which compares what the
     database returns against the seed files and needs to compare them the same
     way this file decides whether anything changed. Sharing the function means
     the test cannot pass under a looser rule than the site uses. */
  return { current: current, refresh: refresh, stable: stable, CACHE_KEY: CACHE_KEY };
})();
