/* ═══════════════════════════════════════════════
   AROMATI — interactions
   smooth scroll · nav · reveals · parallax · rail
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── smooth scrolling ────────────────────────── */
  var lenis = null;
  if (!prefersReduced) {
    lenis = new Lenis({
      duration: 1.4,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
      syncTouch: false,
      anchors: true,
    });
    requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    });
  }

  /* ── split text into animated words ─────────── */
  function splitWords(el) {
    var nodes = Array.prototype.slice.call(el.childNodes);
    el.innerHTML = "";
    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (piece) {
          if (!piece) return;
          if (/^\s+$/.test(piece)) { el.appendChild(document.createTextNode(" ")); return; }
          var w = document.createElement("span"); w.className = "w";
          var i = document.createElement("i"); i.textContent = piece;
          w.appendChild(i); el.appendChild(w);
        });
      } else if (node.nodeName === "BR") {
        el.appendChild(node);
      } else {
        // keep inline elements (em/strong) but split their text
        var holder = node.cloneNode(false);
        el.appendChild(holder);
        splitInto(holder, node.textContent);
      }
    });
  }
  function splitInto(holder, text) {
    text.split(/(\s+)/).forEach(function (piece) {
      if (!piece) return;
      if (/^\s+$/.test(piece)) { holder.appendChild(document.createTextNode(" ")); return; }
      var w = document.createElement("span"); w.className = "w";
      var i = document.createElement("i"); i.textContent = piece;
      w.appendChild(i); holder.appendChild(w);
    });
  }
  document.querySelectorAll("[data-split]").forEach(function (el) {
    splitWords(el);
    // stagger the word transitions
    el.querySelectorAll(".w > i").forEach(function (i, idx) {
      i.style.transitionDelay = Math.min(idx * 45, 900) + "ms";
    });
    // only now is it safe to show: the words exist and are parked below the
    // line. Until this class lands the element is visibility:hidden, which is
    // what stops the unsplit text flashing for a frame first.
    el.classList.add("is-split");
  });

  /* ── opening entrance: nav + title + reveals, choreographed together ──
     The home page opens on the hero; every inner page — the three menus and the
     FAQ — opens on its .mhead masthead. Both play the same shape, but the inner
     pages skip the bar's drop-in, since arriving there is a click from a
     sibling page rather than opening the site. */
  var isInnerPage = document.body.classList.contains("page-menu") ||
                    document.body.classList.contains("page-doc");

  /* An inner page's opening sequence, in milliseconds, in one place. Read it
     top to bottom and you have the whole arrival: the eyebrow, the title
     lifting its words, the line under it, the switcher, then whatever the page
     puts under the masthead — the filter tabs on a menu, the demo notice on the
     FAQ — and last the courses already on screen. Nothing here is on the
     observer's clock: every one of these is visible at load, so leaving any of
     it to the observer would fire it in the first frame and break the run. */
  var MENU_T = { eyebrow: 0, title: 110, lede: 250, switcher: 380, tabs: 510, board: 640 };

  (function playEntrance() {
    var n = document.getElementById("nav");
    var stage = document.querySelector(".hero") || document.querySelector(".mhead");
    var t = document.querySelector(".hero__title") || (stage && stage.querySelector("[data-split]"));
    var titleAt = isInnerPage ? MENU_T.title : 0;
    var steps = [];

    if (isInnerPage) {
      [[".mhead .section-head", MENU_T.eyebrow],
       [".mhead__lede", MENU_T.lede],
       [".mswitch", MENU_T.switcher],
       [".carte__masthead", MENU_T.tabs],
       [".notice", MENU_T.tabs]].forEach(function (pair) {
        var el = document.querySelector(pair[0]);
        if (el) steps.push([el, pair[1]]);
      });
    } else if (stage) {
      stage.querySelectorAll(".reveal").forEach(function (el, i) {
        steps.push([el, 350 + i * 150]);
      });
    }

    function start() {
      if (t) setTimeout(function () { t.classList.add("in"); }, prefersReduced ? 0 : titleAt);
      steps.forEach(function (s) {
        setTimeout(function () { s[0].classList.add("in"); }, prefersReduced ? 0 : s[1]);
      });
    }

    // Two frames before anything gets .in. Adding the class in the same tick the
    // script runs lands it in the first style pass, so the browser never sees a
    // "before" — the masthead simply appeared, fully formed, with no animation.
    if (prefersReduced) start();
    else requestAnimationFrame(function () { requestAnimationFrame(start); });

    // on the home page the title's last letter finishes rising at ~.32s + 1.1s
    // menu pages: the bar is already there, see .page-menu .nav
    if (n && !isInnerPage) setTimeout(function () { n.classList.add("in"); }, prefersReduced ? 0 : 420);
  })();

  /* ── nav: scrolled state + hide on scroll down ── */
  // A block opening or closing lower down the page changes the document height,
  // which reads as a scroll and used to make the bar flap. lockNav() mutes the
  // auto-hide across a known layout change; the scrolled state still tracks.
  var nav = document.getElementById("nav");
  var lastY = 0;
  var navLockedUntil = 0;
  function lockNav(ms) { navLockedUntil = Date.now() + (ms || 800); }
  window.addEventListener("scroll", function () {
    var y = window.scrollY;
    nav.classList.toggle("scrolled", y > 60);
    if (Date.now() < navLockedUntil) { lastY = y; return; }
    if (y > 500 && y > lastY + 4) nav.classList.add("hidden");
    else if (y < lastY - 4) nav.classList.remove("hidden");
    lastY = y;
  }, { passive: true });

  /* ── mobile menu ────────────────────────────── */
  // The open/close choreography is entirely in CSS, keyed off .open — this only
  // flips the class and handles what CSS cannot: the scroll lock, the nav bar
  // (which sits above the curtain and must stop being the cream scrolled bar),
  // and keeping focus inside the panel while it is open.
  var burger = document.getElementById("burger");
  var mmenu = document.getElementById("mmenu");
  if (burger && mmenu) {
    var menuReturn = null;
    function setMobileMenu(open) {
      mmenu.classList.toggle("open", open);
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      /* Locked on the root, not on body. Both end up the same at the viewport —
         the root's overflow propagates there and the page stops scrolling either
         way — but `hidden` on body makes body itself a scrollport, and with
         `height:100%` on it that collapses the document to a single viewport and
         throws away the scroll position. Restoring it looked fine on desktop and
         dumped you at the top on a phone. The root propagates instead of
         collapsing, so the position survives untouched. Only the y axis, so the
         horizontal clip in the stylesheet is left alone. */
      document.documentElement.style.overflowY = open ? "hidden" : "";
      if (open) {
        mmenu.removeAttribute("inert");
        mmenu.removeAttribute("aria-hidden");
        menuReturn = document.activeElement;
      } else {
        // inert blurs whatever is focused inside, which drops the caret to the
        // top of the document — so if the keyboard was in the panel, hand it
        // back. A tap-to-close never had focus in there and is left alone,
        // since focusing the button would only summon a focus ring nobody asked
        // for. Read before inert, which is what clears activeElement.
        var wasInside = mmenu.contains(document.activeElement);
        mmenu.setAttribute("inert", "");
        mmenu.setAttribute("aria-hidden", "true");
        var back = menuReturn && menuReturn.focus && menuReturn !== document.body
          ? menuReturn
          : (wasInside ? burger : null);
        if (back) back.focus();
        menuReturn = null;
      }
      if (nav) {
        nav.classList.toggle("menu-open", open);
        if (open) nav.classList.remove("hidden");
      }
    }
    burger.addEventListener("click", function () {
      setMobileMenu(!mmenu.classList.contains("open"));
    });
    mmenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        setMobileMenu(false);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (!mmenu.classList.contains("open")) return;
      if (e.key === "Escape") { setMobileMenu(false); return; }
      if (e.key !== "Tab") return;
      // the panel covers the page, so tabbing has to cycle the burger and the
      // panel's own links rather than walking off into the hidden document
      var stops = [burger].concat(Array.prototype.slice.call(mmenu.querySelectorAll("a[href]")));
      var first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── menus dropdown ───────────────────────────
     Hover is a convenience for pointers; click and keyboard are the real
     controls, so the panel is reachable on touch and by tabbing. It closes on
     Escape, on an outside click, and whenever the nav hides itself on scroll. */
  (function menusDropdown() {
    var drop = document.getElementById("navdrop");
    var btn = document.getElementById("menusBtn");
    if (!drop || !btn) return;
    var hoverTimer = null;

    function open(on) {
      clearTimeout(hoverTimer);
      drop.classList.toggle("is-open", on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      open(!drop.classList.contains("is-open"));
    });
    drop.addEventListener("mouseenter", function () { open(true); });
    drop.addEventListener("mouseleave", function () {
      // a beat of grace, so crossing the gap to the panel doesn't close it
      hoverTimer = setTimeout(function () { open(false); }, 160);
    });
    document.addEventListener("click", function (e) {
      if (!drop.contains(e.target)) open(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !drop.classList.contains("is-open")) return;
      open(false);
      btn.focus();
    });
    // a panel left hanging while the bar slides away reads as a bug
    window.addEventListener("scroll", function () {
      if (drop.classList.contains("is-open") && nav.classList.contains("hidden")) open(false);
    }, { passive: true });
  })();

  /* ── intersection reveals ───────────────────── */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -4% 0px" });

  // The opening stage — the hero, or a menu page's masthead and its filter tabs
  // — runs on its own clock in playEntrance(). It is all on screen at load, so
  // leaving it to the observer would fire every piece at once, in the first
  // frame, and skip the stagger entirely.
  function inOpeningStage(el) {
    if (el.closest(".hero") || el.closest(".mhead")) return true;
    return isInnerPage && !!(el.closest(".carte__masthead") || el.closest(".notice"));
  }
  document.querySelectorAll("[data-split], [data-reveal-img], .reveal, .footer")
    .forEach(function (el) { if (!inOpeningStage(el)) io.observe(el); });

  /* ── staggered reveals (story copy, fact row) ─ */
  var staggerGroups = [
    { group: ".story__text", items: "p, .story__floors li", step: 90 },
    { group: ".story__facts", items: ".fact", step: 150 },
    // The visit panel is the one place a menu page can land you mid-document
    // (index.html#visit), so it needs an arrival of its own — without this the
    // whole card, the hours and the buttons are simply there, and only the
    // heading animates. Observed as a group, so it plays once, in order.
    { group: ".visit__inner", items: ".section-head, .visit__card, .visit__row, .visit__actions", step: 75 }
  ];

  // a gentle count-up — eased out, settling in quiet increments so the
  // digits drift up rather than spin
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (!target) return;
    if (prefersReduced) { el.textContent = target.toLocaleString("en-US"); return; }
    var fact = el.closest(".fact");
    var delay = fact ? parseFloat(fact.style.getPropertyValue("--d")) || 0 : 0;
    // start most of the way there — the number lands rather than tallies up
    var from = Math.round(target * 0.82 / 25) * 25;
    var dur = 1200, start = null;
    el.textContent = from.toLocaleString("en-US");
    setTimeout(function () {
      requestAnimationFrame(function step(now) {
        if (start === null) start = now;
        var t = Math.min((now - start) / dur, 1);
        var v = from + (target - from) * (1 - Math.pow(1 - t, 3));
        el.textContent = (t < 1 ? Math.round(v / 25) * 25 : target).toLocaleString("en-US");
        if (t < 1) requestAnimationFrame(step);
      });
    }, delay + 150);
  }

  var staggerIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      staggerIO.unobserve(en.target);
      (en.target.staggerItems || []).forEach(function (el) { el.classList.add("in"); });
      en.target.querySelectorAll("[data-count]").forEach(countUp);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -6% 0px" });

  staggerGroups.forEach(function (cfg) {
    document.querySelectorAll(cfg.group).forEach(function (group) {
      var items = Array.prototype.slice.call(group.querySelectorAll(cfg.items));
      if (!items.length) return;
      items.forEach(function (el, i) {
        el.classList.add("stagger-item");
        el.style.setProperty("--d", (i * cfg.step) + "ms");
      });
      group.staggerItems = items;
      staggerIO.observe(group);
    });
  });

  /* ── parallax (rAF, transform-only) ─────────── */
  var pxEls = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  var pxImgs = Array.prototype.slice.call(document.querySelectorAll("[data-parallax-img]"));
  pxImgs.forEach(function (img) {
    img.style.willChange = "transform";
    img.style.transform = "scale(1.12)";
  });
  function parallax() {
    var vh = window.innerHeight;
    pxEls.forEach(function (el) {
      var parent = el.parentElement;
      var r = parent.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      var off = (r.top + r.height / 2 - vh / 2) * speed;
      /* Travel is a fraction of the SECTION's height, so a tall section asks the
         backdrop to move further than its own overscan allows and the photo
         slides out of frame — and any change in that height (a filter, an
         accordion) lands as a jump. Clamp to the slack the element actually has
         and neither can happen, whatever the section grows into. */
      var slack = Math.max(0, (el.offsetHeight - parent.clientHeight) / 2);
      if (off > slack) off = slack;
      else if (off < -slack) off = -slack;
      el.style.transform = "translateY(" + off.toFixed(1) + "px)";
    });
    pxImgs.forEach(function (img) {
      var fig = img.closest("figure") || img.parentElement;
      var r = fig.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var p = (r.top + r.height / 2 - vh / 2) / vh; // -0.5 .. 0.5
      img.style.transform = "scale(1.14) translateY(" + (p * -7).toFixed(2) + "%)";
    });
    requestAnimationFrame(parallax);
  }
  if (!prefersReduced) requestAnimationFrame(parallax);

  /* ═══════════ KITCHEN ═══════════ */

  /* ── plates in the reel uncover left-to-right as the reel arrives ── */
  (function revealReel() {
    var reel = document.querySelector("[data-reel]");
    if (!reel) return;
    var plates = Array.prototype.slice.call(reel.querySelectorAll(".plate"));
    var reelIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        reelIO.disconnect();
        plates.forEach(function (p, i) {
          // only the first screenful needs staggering; the rest are already
          // past the mask when the drift brings them round
          p.style.setProperty("--d", Math.min(i * 90, 720) + "ms");
          p.classList.add("in");
        });
      });
    }, { threshold: 0.12 });
    reelIO.observe(reel);
  })();

  /* ── menus: courses cascade in, tabs re-cascade what's left ──
     The food carte and the wine list are the same machine twice over, so
     everything below reads the courses out of the DOM rather than a
     hardcoded list. A Supabase-backed render of <section class="course">
     blocks drives the tabs, the counts and the layout with no further
     wiring — for either menu. */

  // how much room to leave above the tabs when a filter parks them: the
  // condensed nav plus a little air. Read live — the nav shrinks once scrolled.
  function navClearance() {
    return (nav ? nav.offsetHeight : 62) + 28;
  }

  // Lines are staggered by their position inside a course, so a course reads
  // top-to-bottom whether it arrives by scroll or by tab.
  function cascade(course, base) {
    // the size header counts as the course's first line, so it leads the rest in
    var items = course.querySelectorAll(".course__sizes, .mi, .build");
    items.forEach(function (el, i) {
      el.style.setProperty("--md", (base + 90 + i * 55) + "ms");
    });
    course.style.setProperty("--d", base + "ms");
  }

  function initMenu(bodyId, tabsId) {
    var menuBody = document.getElementById(bodyId);
    var menuTabs = document.getElementById(tabsId);
    if (!menuBody) return;

    /* A filter can make the page shorter than the scroll position we are
       standing at, and the browser resolves that by clamping the scroll during
       layout — that lurch is not ours and cannot be animated. This spacer buys
       the document back the height it lost so there is nothing to clamp; it is
       then released smoothly, on our terms. */
    var spacer = document.createElement("div");
    function reserve(px) {
      spacer.classList.remove("is-collapsing");
      spacer.style.height = px + "px";
    }
    function release() {
      if (!parseFloat(spacer.style.height)) return;
      spacer.classList.add("is-collapsing");
      // next frame, so the transition has a start value to move from
      requestAnimationFrame(function () { spacer.style.height = "0px"; });
    }

    var courses = Array.prototype.slice.call(menuBody.querySelectorAll(".course"));

    spacer.className = "menu-spacer";
    spacer.setAttribute("aria-hidden", "true");
    menuBody.parentNode.insertBefore(spacer, menuBody.nextSibling);
    spacer.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "height") return;
      spacer.classList.remove("is-collapsing");
      spacer.style.height = "";
    });

    // item counts, so a CMS edit can't leave a stale number in the header
    courses.forEach(function (c) {
      var countEl = c.querySelector(".course__count");
      var n = c.querySelectorAll(".mi").length;
      if (countEl && n) countEl.textContent = n;
    });

    // tabs, derived from each course's data-course / data-label
    if (menuTabs && !menuTabs.children.length) {
      var seen = {};
      var filters = [{ slug: "all", label: "All" }];
      courses.forEach(function (c) {
        var slug = c.getAttribute("data-course");
        if (!slug || seen[slug]) return;
        seen[slug] = true;
        filters.push({ slug: slug, label: c.getAttribute("data-label") || slug });
      });
      // one course means nothing to filter — don't show a pointless tab bar
      if (filters.length > 2) {
        filters.forEach(function (f, i) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "ctab" + (i === 0 ? " is-on" : "");
          b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
          b.setAttribute("data-filter", f.slug);
          b.textContent = f.label;
          menuTabs.appendChild(b);
        });
      } else {
        menuTabs.remove();
        menuTabs = null;
      }
    }

    /* A course that ends up alone on its row spans the full width and centers,
       so a filter down to one course doesn't leave a dead right column.
       Full-width blocks (the builder) break the pairing, so courses either
       side of one are counted as separate runs — which is what the grid does. */
    function balance() {
      var run = [];
      function flush() {
        run.forEach(function (c, i) {
          c.classList.toggle("is-alone", run.length % 2 === 1 && i === run.length - 1);
        });
        run = [];
      }
      courses.forEach(function (c) {
        if (c.classList.contains("is-hidden")) return;
        if (c.hasAttribute("data-full")) { c.classList.remove("is-alone"); flush(); return; }
        run.push(c);
      });
      flush();
    }

    /* On a menu page the board sits under a masthead that is mid-entrance, and
       the first courses are usually already on screen. They queue behind it
       rather than racing it. First batch only — after that the observer is
       scroll-driven and a lead-in would just feel slow. */
    var lead = isInnerPage && !prefersReduced ? MENU_T.board : 0;

    var courseIO = new IntersectionObserver(function (entries) {
      // a row of two courses landing together should still read left-to-right
      var batch = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        courseIO.unobserve(en.target);
        cascade(en.target, lead + batch * 120);
        en.target.classList.add("in");
        batch++;
      });
      lead = 0;
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

    balance();
    courses.forEach(function (c) { courseIO.observe(c); });

    if (menuTabs) {
      var activeFilter = "all";
      var swapTimer = null;

      menuTabs.addEventListener("click", function (e) {
        var tab = e.target.closest(".ctab");
        if (!tab) return;
        var filter = tab.getAttribute("data-filter");
        // re-clicking the live tab used to replay every animation and re-scroll
        if (filter === activeFilter) return;
        activeFilter = filter;
        lockNav(1400); // filtering changes the page height a lot

        menuTabs.querySelectorAll(".ctab").forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("is-on", on);
          t.setAttribute("aria-pressed", on ? "true" : "false");
        });

        // fade the outgoing set rather than cutting it, then swap under cover
        menuBody.classList.add("is-swapping");
        clearTimeout(swapTimer);
        // no point waiting on a fade that reduced-motion has already disabled
        swapTimer = setTimeout(function () { commit(activeFilter); }, prefersReduced ? 0 : 180);
      });

      function commit(filter) {
        // read while the scroll is still ours, before anything is hidden
        var keep = window.scrollY;

        var shown = 0;
        courses.forEach(function (c) {
          var match = filter === "all" || c.getAttribute("data-course") === filter;
          c.classList.toggle("is-hidden", !match);
          // a hidden course that kept .in would pop in with no entrance the
          // next time a filter brings it back
          courseIO.unobserve(c);
          c.classList.remove("in");
          if (!match) return;
          // replay the entrance so a filtered view still animates in
          cascade(c, shown * 110);
          shown++;
        });
        balance();

        /* Stand perfectly still through the swap.

           Reading scrollHeight below forces the layout, which is also where
           the browser would clamp us — but the spacer goes up and the scroll
           goes back in this same task, before any frame is painted, so that
           clamp never reaches the screen. This is the jump the last attempt
           couldn't fix: it was reacting to the clamp instead of preventing it,
           and no amount of scrolling afterwards can un-see a painted lurch. */
        reserve(0);
        // measured with the spacer flat, so this is the height the page will
        // settle back to once the reservation drains away
        var naturalMax = Math.max(
          0, document.documentElement.scrollHeight - window.innerHeight
        );
        var deficit = keep - naturalMax;
        if (deficit > 0) reserve(deficit);
        if (window.scrollY !== keep) window.scrollTo(0, keep);
        // resize() re-seats Lenis on the real scroll, so it can't animate out
        // of a position it thinks it still holds
        if (lenis) lenis.resize();

        menuBody.classList.remove("is-swapping");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            courses.forEach(function (c) {
              if (!c.classList.contains("is-hidden")) c.classList.add("in");
            });

            /* One motion from here, never two. If the swap left the tabs above
               the nav there is nothing to read where we stand, so we glide back
               to them while the reserved height drains away underneath — both
               on the same clock, so it lands as a single settle. */
            var tabsTop = menuTabs.getBoundingClientRect().top + window.scrollY;
            // never aim past where the drained page can actually hold us, or
            // the browser would clamp the last few pixels and undo the glide
            var parked = Math.max(0, Math.min(tabsTop - navClearance(), naturalMax));
            release();
            if (keep - parked > 1) {
              if (lenis) lenis.scrollTo(parked, { duration: 0.66, force: true });
              else window.scrollTo({ top: parked, behavior: prefersReduced ? "auto" : "smooth" });
            }
          });
        });
      }
    }
  }

  // one board per menu page; absent on the home page, where initMenu returns
  initMenu("carteBody", "carteTabs");

  /* ── expandable option rows (the crêpe) ── */
  document.querySelectorAll(".mi[data-opts]").forEach(function (mi) {
    var btn = mi.querySelector(".mi__toggle");
    var row = mi.querySelector(".mi__row");
    if (!btn || !row) return;
    function toggle() {
      lockNav(900); // the row's height animation shifts everything below it
      var open = mi.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    // the button carries the semantics; the whole row is a bigger hit target
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    row.addEventListener("click", toggle);
  });

  /* ── build your own breakfast ── */
  (function buildYourOwn() {
    var build = document.getElementById("build");
    if (!build) return;
    var linesEl = document.getElementById("buildLines");
    var totalEl = document.getElementById("buildTotal");
    var hintEl = document.getElementById("buildHint");
    var bagelField = document.getElementById("bagelField");
    var reset = document.getElementById("buildReset");

    var HINTS = {
      "Avocado toast": "Smashed avocado on grilled sourdough.",
      "Bagel": "Six ways, toasted to order.",
      "Croissant sandwich": "Smashed avocado on a plain croissant."
    };

    function chipsIn(group) {
      return Array.prototype.slice.call(
        build.querySelectorAll('[data-group="' + group + '"] .chip')
      );
    }
    function selected(group) {
      return chipsIn(group).filter(function (c) { return c.classList.contains("is-on"); });
    }
    function money(n) { return "$" + n.toFixed(2); }

    function render(bump) {
      var base = selected("base")[0];
      var adds = selected("add");
      var bagel = selected("bagel")[0];
      var total = base ? parseFloat(base.getAttribute("data-price")) : 0;

      linesEl.innerHTML = "";
      if (base) {
        var name = base.getAttribute("data-name");
        if (name === "Bagel" && bagel) name = bagel.getAttribute("data-name") + " bagel";
        linesEl.appendChild(line(name, parseFloat(base.getAttribute("data-price")), true));
      }
      adds.forEach(function (c) {
        var p = parseFloat(c.getAttribute("data-price"));
        total += p;
        linesEl.appendChild(line(c.getAttribute("data-name"), p, false));
      });

      totalEl.textContent = money(total);
      if (bump && !prefersReduced) {
        totalEl.classList.remove("is-bumped");
        void totalEl.offsetWidth; // restart the animation
        totalEl.classList.add("is-bumped");
      }

      build.querySelectorAll(".chip").forEach(function (c) {
        c.setAttribute("aria-pressed", c.classList.contains("is-on") ? "true" : "false");
      });

      var sub = !!(base && base.getAttribute("data-sub") === "bagel");
      if (bagelField.classList.contains("is-open") !== sub) {
        // the height transition runs for .55s — ride out the whole thing
        lockNav(900);
        bagelField.classList.toggle("is-open", sub);
        if (sub) bagelField.removeAttribute("inert");
        else bagelField.setAttribute("inert", "");
      }
      if (base && hintEl) hintEl.textContent = HINTS[base.getAttribute("data-name")] || "";
    }

    function line(name, price, isBase) {
      var li = document.createElement("li");
      if (isBase) li.className = "is-base";
      var s = document.createElement("span"); s.textContent = name;
      var b = document.createElement("b"); b.textContent = money(price);
      li.appendChild(s); li.appendChild(b);
      return li;
    }

    build.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      lockNav(700); // the ticket grows or shrinks with every choice
      var group = chip.closest("[data-group]").getAttribute("data-group");
      if (group === "add") {
        chip.classList.toggle("is-on"); // multi-select
      } else {
        // base and bagel style are single-choice
        chipsIn(group).forEach(function (c) { c.classList.toggle("is-on", c === chip); });
      }
      render(true);
    });

    if (reset) {
      reset.addEventListener("click", function () {
        chipsIn("add").forEach(function (c) { c.classList.remove("is-on"); });
        chipsIn("base").forEach(function (c, i) { c.classList.toggle("is-on", i === 0); });
        chipsIn("bagel").forEach(function (c, i) { c.classList.toggle("is-on", i === 0); });
        render(true);
      });
    }

    render(false);
  })();

  /* ── book a table: placeholder until reservations are wired up ──
     The button is deliberately inert. This is a demo build, so the note says
     so plainly rather than pretending to be real copy. */
  (function () {
    var btn = document.getElementById("bookBtn");
    var note = document.getElementById("bookNote");
    if (!btn || !note) return;

    btn.addEventListener("click", function () {
      lockNav(900); // the note opening nudges everything below it
      note.textContent = "Placeholder. The booking form would open here.";
      note.classList.add("is-on");
    });
  })();

  /* ── hours: open / closed, in New York time ───
     The café keeps New York hours no matter where the page is read from,
     so the clock is read in that timezone rather than the visitor's. */
  (function () {
    var status = document.getElementById("hoursStatus");
    var list = document.getElementById("hoursList");
    if (!status && !list) return;

    var OPEN = 7 * 60;                                  // 7:00 am, every day
    var CLOSE = [22, 22, 22, 23, 23, 23, 23];           // by day, Sun → Sat
    var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
      });
    } catch (e) { fmt = null; }

    function nyNow() {
      if (!fmt) { var d = new Date(); return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() }; }
      var day = 0, hour = 0, min = 0;
      fmt.formatToParts(new Date()).forEach(function (p) {
        if (p.type === "weekday") day = Math.max(0, DAY.indexOf(p.value));
        else if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
        else if (p.type === "minute") min = parseInt(p.value, 10);
      });
      return { day: day, mins: hour * 60 + min };
    }

    function clock(mins) {
      var h = Math.floor(mins / 60), m = mins % 60;
      var suffix = h >= 12 ? "pm" : "am";
      var h12 = h % 12 === 0 ? 12 : h % 12;
      return h12 + ":" + (m < 10 ? "0" + m : m) + " " + suffix;
    }

    function render() {
      var now = nyNow();
      var close = CLOSE[now.day] * 60;
      var open = now.mins >= OPEN && now.mins < close;

      if (list) {
        list.querySelectorAll(".hours__line").forEach(function (li) {
          var days = (li.getAttribute("data-days") || "").split(",");
          li.classList.toggle("is-today", days.indexOf(String(now.day)) > -1);
        });
      }
      if (status) {
        var soon = open && close - now.mins <= 60;
        status.hidden = false;
        status.setAttribute("data-state", open ? "open" : "closed");
        status.textContent = open
          ? (soon ? "Closing at " + clock(close) : "Open now · until " + clock(close))
          : "Closed · opens " + clock(OPEN) + (now.mins >= close ? " tomorrow" : "");
      }
    }

    render();
    setInterval(render, 60000);
  })();

  /* ── back to top ────────────────────────────
     Appears once the opening stage — the hero here, a masthead on the inner
     pages — has scrolled fully out of view, so it never covers the arrival.
     An IntersectionObserver on that block means no scroll math and no listener
     running every frame. CSS keeps the puck off entirely above 760px.

     The scroll goes through Lenis where Lenis is running: a native smooth
     scrollTo would race the rAF loop, and the two would fight over the same
     scrollTop the whole way up. */
  (function setupToTop() {
    var btn = document.getElementById("toTop");
    var top = document.querySelector(".hero, .mhead");
    if (!btn || !top) return;

    function show(on) {
      btn.classList.toggle("is-up", on);
      btn.setAttribute("aria-hidden", on ? "false" : "true");
      if (on) btn.removeAttribute("tabindex");
      else btn.setAttribute("tabindex", "-1");
    }

    btn.addEventListener("click", function () {
      if (lenis) lenis.scrollTo(0, { duration: 1, force: true });
      else window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
      // the puck is about to hide itself, so the caret would be left on a
      // display:none element — hand it to the top of the document instead
      top.setAttribute("tabindex", "-1");
      top.focus({ preventScroll: true });
      top.removeAttribute("tabindex");
    });

    if (!("IntersectionObserver" in window)) {
      var ticking = false;
      window.addEventListener("scroll", function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          show(window.scrollY > top.offsetHeight);
          ticking = false;
        });
      }, { passive: true });
      return;
    }

    new IntersectionObserver(function (entries) {
      show(!entries[entries.length - 1].isIntersecting);
    }, { threshold: 0 }).observe(top);
  })();

  /* ── footer year ────────────────────────────── */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
