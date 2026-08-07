/* ═══════════════════════════════════════════════
   AROMATI — interactions
   smooth scroll · nav · reveals · parallax · rail
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── one block failing must not take the rest down ──
     Everything below shares one closure, so an exception anywhere used to kill
     every block after it: a bad hours value would silently cost the visitor the
     mobile menu and the back-to-top button, with nothing on screen to say why.

     From Phase 4 the content arrives from a database and can be malformed in
     ways no amount of care here prevents, which is what makes this worth the
     indirection. Same shape as render.js's step().

     Only the self-contained blocks are wrapped — the ones that were already
     IIFEs. The rest declare names their neighbours close over (splitWords,
     lockNav, isInnerPage, MENU_T), and a try/catch cannot be put around a
     declaration without hiding it from everything that reads it. */
  function boot(name, fn) {
    try { fn(); }
    catch (err) { if (window.console) console.error("script: " + name + " failed", err); }
  }

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
  var MENU_T = { eyebrow: 0, title: 110, lede: 250, switcher: 380, order: 450,
                 tabs: 510, board: 640 };

  boot("entrance", function () {
    var n = document.getElementById("nav");
    var stage = document.querySelector(".hero") || document.querySelector(".mhead");
    var t = document.querySelector(".hero__title") || (stage && stage.querySelector("[data-split]"));
    var titleAt = isInnerPage ? MENU_T.title : 0;
    var steps = [];

    if (isInnerPage) {
      [[".mhead .section-head", MENU_T.eyebrow],
       [".mhead__lede", MENU_T.lede],
       [".mswitch", MENU_T.switcher],
       /* Anything .reveal inside .mhead has to be listed here — the masthead
          is skipped by the intersection observer on purpose, so a piece that
          is not on this clock is a piece that never appears. */
       [".morder", MENU_T.order],
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
  });

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
  boot("menus dropdown", function () {
    var drop = document.getElementById("navdrop");
    var btn = document.getElementById("menusBtn");
    var panel = document.getElementById("menusPanel");
    if (!drop || !btn || !panel) return;
    var hoverTimer = null;

    /* The panel's gold wash is one element, so it travels between menu rows
       instead of switching three separate backgrounds on and off. This is the
       same CSSOM-positioned fill used by the CMS handoff's selection rows. */
    function currentLink() {
      return panel.querySelector("a.is-on");
    }

    function highlightedLink() {
      var hovered = panel.querySelector("a:hover");
      if (hovered) return hovered;
      var focused = document.activeElement;
      if (focused && panel.contains(focused) && focused.closest) return focused.closest("a");
      return currentLink();
    }

    function positionMark(link) {
      if (panel.offsetParent === null) return;
      if (!link) {
        panel.style.setProperty("--navdrop-mark-o", "0");
        return;
      }
      panel.style.setProperty("--navdrop-mark-x", link.offsetLeft + "px");
      panel.style.setProperty("--navdrop-mark-y", link.offsetTop + "px");
      panel.style.setProperty("--navdrop-mark-w", link.offsetWidth + "px");
      panel.style.setProperty("--navdrop-mark-h", link.offsetHeight + "px");
      panel.style.setProperty("--navdrop-mark-o", "1");
      if (!panel._markReady) {
        panel.offsetWidth;
        panel.classList.add("navdrop__panel--ready");
        panel._markReady = true;
      }
    }

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("mouseenter", function () { positionMark(link); });
      link.addEventListener("focus", function () { positionMark(link); });
    });

    function open(on) {
      clearTimeout(hoverTimer);
      drop.classList.toggle("is-open", on);
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) window.requestAnimationFrame(function () { positionMark(currentLink()); });
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      open(!drop.classList.contains("is-open"));
    });
    /* Mouse only, and pointerType is the test rather than a hover:hover query:
       an iPad with a trackpad attached reports hover:hover but still sends
       pointerType "touch" for a finger, which is the case that broke. One tap
       there synthesises enter *and* click, so the enter opened the panel and the
       click toggled it straight back shut — the first tap only lit the pill up,
       and it took a second one to open. Leaving hover to real pointers means
       touch is carried by the click handler alone, which is one tap. */
    drop.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "mouse") open(true);
    });
    drop.addEventListener("pointerleave", function (e) {
      if (e.pointerType !== "mouse") return;
      // a beat of grace, so crossing the gap to the panel doesn't close it
      hoverTimer = setTimeout(function () { open(false); }, 160);
    });
    panel.addEventListener("mouseleave", function () { positionMark(currentLink()); });
    panel.addEventListener("focusout", function (e) {
      if (!panel.contains(e.relatedTarget)) positionMark(currentLink());
    });
    window.addEventListener("resize", function () { positionMark(highlightedLink()); });
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
  });

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
  /* Where the compositor can run the backdrops itself, let it: see styles.css,
     "the same drift, run on the compositor". A view() timeline is evaluated on
     the thread that moves the page, which is the one thing this loop cannot be
     on iOS. The CSS covers every [data-parallax] backdrop, so when it applies
     there is nothing left here to do for them — but the figure images have no
     CSS equivalent yet and stay on the loop either way. */
  if (window.CSS && CSS.supports && CSS.supports("animation-timeline", "view()")) pxEls = [];
  /* will-change is a standing request for a compositor layer, so setting it here
     on every parallax image pinned ten layers in video memory for the whole
     session. iOS has the tightest layer budget of anything we run on: it starts
     evicting and re-rasterising them mid-scroll, and that re-raster is a large
     part of what read as lag. The flag is now raised per element, only while it
     is actually on screen — see pxPaint. */
  pxImgs.forEach(function (img) { img.style.transform = "scale(1.12)"; });

  /* window.innerHeight is not a constant on a phone. Safari grows and shrinks it
     as the URL bar collapses and expands, and it does that DURING the very
     scroll this reads it from. Sampling it per frame fed a moving viewport
     height into every offset below, so the backdrop lurched at exactly the
     moment the visitor was scrolling fastest. Sample it on resize instead and
     let the photo travel against a viewport that holds still. */
  var pxVH = window.innerHeight;

  /* Measure and paint are separate passes. Interleaved — as they were, one
     element at a time — each transform write invalidated layout for the next
     getBoundingClientRect(), forcing a synchronous reflow: eleven per frame, at
     up to 120Hz on a ProMotion phone. Read everything, then write everything. */
  var pxOut = [], imgOut = [];
  function pxMeasure() {
    var i, n, el, parent, fig, r, speed, off, slack;
    for (i = 0, n = pxEls.length; i < n; i++) {
      el = pxEls[i]; parent = el.parentElement;
      r = parent.getBoundingClientRect();
      if (r.bottom < 0 || r.top > pxVH) { pxOut[i] = null; continue; }
      speed = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      off = (r.top + r.height / 2 - pxVH / 2) * speed;
      /* Travel is a fraction of the SECTION's height, so a tall section asks the
         backdrop to move further than its own overscan allows and the photo
         slides out of frame — and any change in that height (a filter, an
         accordion) lands as a jump. Clamp to the slack the element actually has
         and neither can happen, whatever the section grows into. */
      slack = Math.max(0, (el.offsetHeight - parent.clientHeight) / 2);
      if (off > slack) off = slack;
      else if (off < -slack) off = -slack;
      pxOut[i] = off;
    }
    for (i = 0, n = pxImgs.length; i < n; i++) {
      fig = pxImgs[i].closest("figure") || pxImgs[i].parentElement;
      r = fig.getBoundingClientRect();
      if (r.bottom < 0 || r.top > pxVH) { imgOut[i] = null; continue; }
      imgOut[i] = ((r.top + r.height / 2 - pxVH / 2) / pxVH) * -7; // -0.5..0.5 → %
    }
  }
  function pxLayer(el, on) {
    var want = on ? "transform" : "";
    if (el.style.willChange !== want) el.style.willChange = want;
  }
  function pxPaint() {
    var i, n;
    for (i = 0, n = pxEls.length; i < n; i++) {
      if (pxOut[i] === null) { pxLayer(pxEls[i], false); continue; }
      pxLayer(pxEls[i], true);
      /* translate3d, not translateY: the 3D form is what gets this promoted to
         its own compositor layer on WebKit, so the scroll moves a texture the
         GPU already holds instead of repainting the photo each frame. */
      pxEls[i].style.transform = "translate3d(0," + pxOut[i].toFixed(1) + "px,0)";
    }
    for (i = 0, n = pxImgs.length; i < n; i++) {
      if (imgOut[i] === null) { pxLayer(pxImgs[i], false); continue; }
      pxLayer(pxImgs[i], true);
      pxImgs[i].style.transform = "scale(1.14) translate3d(0," + imgOut[i].toFixed(2) + "%,0)";
    }
  }

  /* The loop used to run forever whether or not anything had moved: 120 wakeups
     a second on a ProMotion phone, each doing the full measure, holding the CPU
     out of idle and warming it toward the thermal throttle that then made the
     scroll it was decorating worse. It now sleeps once the page has been still
     for a moment, and anything that can move it wakes it again. */
  var pxRunning = false, pxStill = 0, pxLastY = -1;
  function parallax() {
    var y = window.scrollY;
    if (y !== pxLastY) { pxLastY = y; pxStill = 0; }
    else if (++pxStill > 30) { pxRunning = false; return; }
    pxMeasure();
    pxPaint();
    requestAnimationFrame(parallax);
  }
  function pxWake() {
    if (pxRunning) return;
    pxRunning = true; pxStill = 0; pxLastY = -1;
    requestAnimationFrame(parallax);
  }
  if (!prefersReduced) {
    window.addEventListener("resize", function () { pxVH = window.innerHeight; pxWake(); }, { passive: true });
    window.addEventListener("scroll", pxWake, { passive: true });
    /* Sleeping means a layout change that moves a section without scrolling —
       an accordion, a reveal settling — would otherwise leave the backdrop on a
       stale offset until the next scrolled pixel. These two cover that. */
    window.addEventListener("transitionend", pxWake, true);
    document.addEventListener("click", pxWake, true);
    pxWake();
  }

  /* ═══════════ KITCHEN ═══════════ */

  /* ── plates in the reel uncover left-to-right as the reel arrives ── */
  boot("reel", function () {
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
  });

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

  /* The tab bar is removed outright when there is only one course to filter.
     Phase 4 can replace the board with one that has several, so the node has
     to be recoverable — a removed element with no record of where it sat
     cannot be put back. Captured once, before anything can remove it. */
  var tabsHome = (function () {
    var el = document.getElementById("carteTabs");
    return el ? { el: el, parent: el.parentNode, next: el.nextSibling } : null;
  })();

  /* Returns a teardown. initMenu is run again from scratch whenever fresh data
     replaces the board, and everything it attaches has to come off first:
     otherwise the click handler fires twice per tab, a second spacer stacks up
     under the board, and the old IntersectionObserver keeps holding nodes that
     are no longer in the document. */
  function initMenu(bodyId, tabsId) {
    var menuBody = document.getElementById(bodyId);
    var menuTabs = document.getElementById(tabsId);

    /* Put the tab bar back if a previous run removed it. */
    if (!menuTabs && tabsHome && !tabsHome.el.isConnected) {
      tabsHome.parent.insertBefore(tabsHome.el, tabsHome.next);
      menuTabs = tabsHome.el;
    }
    if (menuTabs) while (menuTabs.firstChild) menuTabs.removeChild(menuTabs.firstChild);

    if (!menuBody) return function () {};

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

    /* The board is a two-column flow, so the browser does the balancing — the
       only case it cannot help with is one course, which would sit in the first
       column with the second left empty. Full-width blocks (the builder) are
       not a column's worth of content and don't count towards the pair. */
    function balance() {
      var n = 0;
      courses.forEach(function (c) {
        if (c.classList.contains("is-hidden") || c.hasAttribute("data-full")) return;
        n++;
      });
      menuBody.classList.toggle("is-single", n <= 1);
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

    var onTabClick = null;

    if (menuTabs) {
      var activeFilter = "all";
      var swapTimer = null;

      onTabClick = function (e) {
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
      };

      menuTabs.addEventListener("click", onTabClick);

      function commit(filter) {
        // read while the scroll is still ours, before anything is hidden
        var keep = window.scrollY;

        /* Courses that stay on screen across the swap are still .in, and
           removing a class does not rewind a transition — it starts a new one
           the other way. Two frames later they would be re-tagged .in while
           still all but fully visible, so their cascade would run over nothing.
           .is-resetting turns the transitions off for one layout so they can be
           put back at the start of the entrance. See styles.css. */
        menuBody.classList.add("is-resetting");

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

        /* The reset only counts if the browser sees it while the transitions
           are still off. Without a forced layout here the whole task coalesces
           and it sees a course that was .in and is .in again — nothing to
           animate, which is the bug this is fixing. */
        void menuBody.offsetHeight;
        menuBody.classList.remove("is-resetting");

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

    return function teardown() {
      courseIO.disconnect();
      if (onTabClick && menuTabs) menuTabs.removeEventListener("click", onTabClick);
      if (spacer.parentNode) spacer.parentNode.removeChild(spacer);
      menuBody.classList.remove("is-swapping", "is-resetting", "is-single");
    };
  }

  // one board per menu page; absent on the home page, where initMenu returns
  var teardownMenu = initMenu("carteBody", "carteTabs");

  /* ── expandable option rows (the crêpe) ── */
  function bindOptionRows() {
    document.querySelectorAll(".mi[data-opts]").forEach(function (mi) {
      /* A rebuilt board brings new nodes, but Build Your Own is *moved* rather
         than recreated, and a moved node keeps its listeners. Binding it twice
         would toggle the row open and straight back shut. */
      if (mi.hasAttribute("data-opts-bound")) return;
      mi.setAttribute("data-opts-bound", "");

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
  }
  bindOptionRows();

  /* ── Phase 4: fresh data replaced the board ──
     render.js fires this only when the network came back with a menu that
     genuinely differs from the one already on screen. Everything the previous
     run attached comes off first — see the teardown returned by initMenu. */
  document.addEventListener("aromati:board-replaced", function () {
    boot("menu replay", function () {
      if (teardownMenu) teardownMenu();
      teardownMenu = initMenu("carteBody", "carteTabs");
      bindOptionRows();
    });
  });

  /* ── build your own breakfast ── */
  boot("build your own", function () {
    var build = document.getElementById("build");
    if (!build) return;
    var linesEl = document.getElementById("buildLines");
    var totalEl = document.getElementById("buildTotal");
    var hintEl = document.getElementById("buildHint");
    var bagelField = document.getElementById("bagelField");
    var reset = document.getElementById("buildReset");

    var HINTS = {
      "Avocado toast": "Smashed avocado on grilled sourdough.",
      "Bagel": "Plain or everything, toasted to order.",
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
  });

  /* ── book a table: placeholder until reservations are wired up ──
     The button is deliberately inert. This is a demo build, so the note says
     so plainly rather than pretending to be real copy. */
  boot("book a table", function () {
    var btn = document.getElementById("bookBtn");
    var note = document.getElementById("bookNote");
    if (!btn || !note) return;

    btn.addEventListener("click", function () {
      lockNav(900); // the note opening nudges everything below it
      note.textContent = "Placeholder. The booking form would open here.";
      note.classList.add("is-on");
    });
  });

  /* ── hours: open / closed, in New York time ───
     The café keeps New York hours no matter where the page is read from,
     so the clock is read in that timezone rather than the visitor's. */
  boot("hours", function () {
    var status = document.getElementById("hoursStatus");
    var list = document.getElementById("hoursList");
    if (!status && !list) return;

    /* The same hours render.js used for the table, the two prose formats and
       the Google listing block, so the pill can never disagree with the page
       around it. The old constants — one opening time, a per-day closing array
       — could not express a closed day; this can.

       Read through AROMATI_DATA rather than from SEED_HOURS, and read again on
       every render rather than once at boot. Both halves matter. From Phase 4
       the hours come from the database and the seed file is only the offline
       floor, so a pill wired to SEED_HOURS is wired to the fallback; and the
       network answers *after* this block has already run, so a value captured
       at boot is the old week no matter where it was read from. `current()`
       returns cache-or-seed and is written before refresh calls back, which is
       what makes re-reading enough. */
    var DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function week() {
      var live = typeof AROMATI_DATA === "object" && AROMATI_DATA
        ? (AROMATI_DATA.current() || {}).hours
        : null;
      return live || (typeof SEED_HOURS !== "undefined" && SEED_HOURS) || null;
    }

    /* The one-off dates, read the same way and for the same reasons. Absent is
       `{}` rather than null: a café with no holidays booked is a complete
       answer, not a missing one. */
    function oneOffs() {
      var live = typeof AROMATI_DATA === "object" && AROMATI_DATA
        ? (AROMATI_DATA.current() || {}).exceptions
        : null;
      return live ||
        (typeof SEED_HOURS_EXCEPTIONS !== "undefined" && SEED_HOURS_EXCEPTIONS) || {};
    }

    if (!week()) return;                                // no data, no claim

    /* The site's clock, from data.js, so this pill and the search listing
       render.js writes can never disagree about what day it is in New York.
       The local fallback covers the same case `week()` covers one for: a page
       whose data.js did not load still has to render, and a pill that threw
       would take the rest of this boot step down with it. */
    function nyNow() {
      if (typeof AROMATI_DATA === "object" && AROMATI_DATA && AROMATI_DATA.nowNY) {
        return AROMATI_DATA.nowNY();
      }
      var d = new Date();
      return {
        date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
        day: d.getDay(),
        mins: d.getHours() * 60 + d.getMinutes()
      };
    }

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    /* Calendar arithmetic on a date with no time in it, done in UTC so that no
       daylight saving transition can add or drop an hour and land the walk on
       the wrong day. The weekday is read back off the resulting date rather
       than counted forward from today's, so the two cannot drift apart. */
    function plusDays(dateKey, n) {
      var p = dateKey.split("-");
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 86400000);
      return {
        date: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()),
        day: d.getUTCDay()
      };
    }

    /* What the café is actually doing on a given date: the one-off if there is
       one, otherwise the usual weekday. The two are the same shape, which is
       what lets everything below this line stop caring which it got. */
    function dayAt(hours, ones, dateKey, dow) {
      return (ones && ones[dateKey]) || hours[dow];
    }

    function clock(mins) {
      var h = Math.floor(mins / 60), m = mins % 60;
      var suffix = h >= 12 ? "pm" : "am";
      var h12 = h % 12 === 0 ? 12 : h % 12;
      return h12 + ":" + (m < 10 ? "0" + m : m) + " " + suffix;
    }

    /* The next day the café is actually open, and when. Walks forward rather
       than assuming tomorrow, so a run of closed days reads correctly instead
       of promising a door that stays shut. Stops after a week: if every day is
       closed there is nothing truthful to say.

       It walks dates, not weekday numbers, because a one-off closure lands on
       a date. Without that, "opens 7:00 am tomorrow" is exactly the sentence
       the pill would print on Christmas Eve. */
    function nextOpening(hours, ones, fromDate) {
      for (var i = 1; i <= 7; i++) {
        var at = plusDays(fromDate, i);
        var h = dayAt(hours, ones, at.date, at.day);
        if (h && !h.closed) return { day: at.day, opens: h.opens, days: i };
      }
      return null;
    }

    function render() {
      /* Read once per render and passed down, so a render cannot start on one
         week and finish on another. */
      var hours = week();
      if (!hours) return;
      var ones = oneOffs();
      var now = nyNow();
      var today = dayAt(hours, ones, now.date, now.day);
      var open = !!today && !today.closed &&
        now.mins >= today.opens && now.mins < today.closes;

      if (list) {
        list.querySelectorAll(".hours__line").forEach(function (li) {
          var days = (li.getAttribute("data-days") || "").split(",");
          li.classList.toggle("is-today", days.indexOf(String(now.day)) > -1);
        });
      }
      if (!status) return;

      status.hidden = false;
      status.setAttribute("data-state", open ? "open" : "closed");

      if (open) {
        var soon = today.closes - now.mins <= 60;
        status.textContent = soon
          ? "Closing at " + clock(today.closes)
          : "Open now · until " + clock(today.closes);
        return;
      }

      /* Closed. Either it has not opened yet today, or the day is done and the
         next opening is on a later day. */
      if (today && !today.closed && now.mins < today.opens) {
        status.textContent = "Closed · opens " + clock(today.opens);
        return;
      }

      /* A one-off closure carries its reason, and it is worth saying. "Closed"
         on a day the café is normally open is a confusing thing to read, and
         the note is the answer to the question it raises. A day with unusual
         *times* gets no such treatment — the times already say everything. */
      var why = today && today.closed && today.note ? " for " + today.note : "";

      var next = nextOpening(hours, ones, now.date);
      if (!next) { status.hidden = true; return; }
      status.textContent = "Closed" + why + " · opens " + clock(next.opens) +
        (next.days === 1 ? " tomorrow" : " " + DAY[next.day]);
    }

    render();
    setInterval(render, 60000);

    /* The network answers after this block has run. render.js fires this on
       every second paint; without it the pill would be up to a minute stale on
       the tick, and permanently stale in the case that matters — the table
       beside it rebuilt from the new hours while the pill kept the old ones.

       It also repaints the `is-today` highlight, which renderHours wipes when
       it rebuilds the Visit table's list items. */
    document.addEventListener("aromati:content-changed", render);
  });

  /* ── back to top ────────────────────────────
     Appears once the opening stage — the hero here, a masthead on the inner
     pages — has scrolled fully out of view, so it never covers the arrival.
     An IntersectionObserver on that block means no scroll math and no listener
     running every frame. CSS keeps the puck off entirely above 760px.

     The scroll goes through Lenis where Lenis is running: a native smooth
     scrollTo would race the rAF loop, and the two would fight over the same
     scrollTop the whole way up. */
  boot("back to top", function () {
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
  });

  /* ── footer year ────────────────────────────── */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();
})();
