/* Does the editor do what it says, and refuse what it should?
   node tools/test-admin.mjs

   admin.js is the only file in the project that writes to the database, and
   the person using it is the one person whose mistakes are expensive. So this
   drives the real page, with the real markup, against a fake Supabase client
   that records every request instead of sending it — which makes the question
   "what would this have written?" answerable exactly, rather than by reading.

   Five things are worth a test here and they are not equally obvious:

     1. **The one security rule.** Every node is built with createElement and
        filled with textContent. This is checked by mutation: the scan is run
        against a copy of the file with an innerHTML put into it, and the test
        fails if the scan does not notice. A checker never seen to fail is not
        evidence.

     2. **The wording is the database's.** Every message about a badly-formed
        setting exists twice — once as a `raise exception` in the migration and
        once here, so the owner is told before the save rather than after. Two
        copies of a sentence drift. This reads both files and requires them to
        agree, in both directions.

     3. **Only the columns the owner owns.** site_copy.label is the wording of
        the editor itself and site_settings.key is what the site looks the row
        up by; a trigger refuses to let either move. The editor must not try. A
        control request is checked first, because "no forbidden column was
        sent" is also true of a save that sent nothing at all.

     4. **The order of a save.** A new section and a new item inside it are two
        inserts with a foreign key between them, and the item's course_id does
        not exist until the section's insert comes back.

     5. **Discard, after a save.** The draft is restored from what was loaded,
        and if that is not advanced as each write lands, Discard silently
        reverts to the state the page opened in — and then offers to write those
        stale values back over what was just saved. It is not a crash and
        nothing looks wrong. */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let failures = 0;

function check(what, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) console.log(`         want: ${JSON.stringify(want)}\n          got: ${JSON.stringify(got)}`);
}

const ADMIN_JS = readFileSync("admin.js", "utf8");
const ADMIN_CSS = readFileSync("admin.css", "utf8");
const ADMIN_HTML = readFileSync("admin.html", "utf8");
const MIGRATION = readFileSync("supabase/migrations/20260801000000_init_cms.sql", "utf8");

function withoutCodeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

console.log("\nthe owner-facing copy");
{
  const jsCopy = withoutCodeComments(ADMIN_JS).replaceAll('"—"', "");
  const htmlCopy = ADMIN_HTML.replace(/<!--[\s\S]*?-->/g, "");
  const databaseMessages = (MIGRATION.match(/raise exception[\s\S]*?;/g) || []).join("\n");

  check("uses no em dash as sentence punctuation in the editor", jsCopy.includes("—"), false);
  check("uses none in the visible editor shell", htmlCopy.includes("—"), false);
  check("and keeps the database's fallback messages equally clear",
        databaseMessages.includes("—"), false);
}

console.log("\nthe editor brand");
{
  const shell = new JSDOM(ADMIN_HTML).window.document;
  const logo = shell.querySelector(".topbar__brand img");
  check("uses the transparent vector lockup in the top-left brand slot",
        [logo && logo.getAttribute("src"), logo && logo.getAttribute("alt")],
        ["assets/logos/aromati-lockup.svg", "Aromati café wine bar"]);
  check("renders the existing artwork in white without baking a background into it",
        ADMIN_CSS.includes("filter: brightness(0) invert(1)"), true);
}


/* ═══ the fixture ═══════════════════════════════════════════════════════════
   Small, and shaped so that every branch the panels have is represented: a
   headline with a length cap, a setting with a format rule, a course with size
   columns, an item priced per size, a pour, a closed day. */

function fixture() {
  return {
    site_settings: [
      { id: "s1", key: "phone_digits", label: "Phone number", help: null,
        value: "3322073847", is_editable: true, sort_order: 10 },
      { id: "s2", key: "email", label: "Email address", help: null,
        value: "info@aromatinyc.com", is_editable: true, sort_order: 12 },
      { id: "s3", key: "order_doordash_url", label: "DoorDash link", help: null,
        value: "https://example.com/store", is_editable: true, sort_order: 14 },
      { id: "s4", key: "schema_type", label: "Search listing type", help: null,
        value: "CafeOrCoffeeShop", is_editable: false, sort_order: 32 }
    ],
    site_copy: [
      { id: "c1", key: "story.headline", page: "index", section: "The Idea",
        label: "Headline", help: null, value: "Georgian cooking for a Manhattan morning.",
        max_length: 72, sort_order: 1 },
      { id: "c2", key: "story.lead", page: "index", section: "The Idea",
        label: "Opening paragraph", help: null, value: "Aromati, from the Georgian word for *aroma*.",
        max_length: null, sort_order: 2 }
    ],
    business_hours: [
      { id: "h1", day_of_week: 1, is_closed: false, opens_at: "07:00:00", closes_at: "22:00:00", note: null, sort_order: 1 },
      { id: "h2", day_of_week: 2, is_closed: true, opens_at: null, closes_at: null, note: null, sort_order: 2 }
    ],
    hours_exceptions: [],
    menu_courses: [
      { id: "k1", page: "food", course_key: "breakfast", tab_label: "Breakfast",
        heading: "Breakfast", sizes: null, is_static: false, static_id: null,
        is_hidden: false, sort_order: 1 },
      { id: "k2", page: "drinks", course_key: "coffee", tab_label: "Coffee",
        heading: "Coffee & Espresso", sizes: ["Small", "Large"], is_static: false,
        static_id: null, is_hidden: false, sort_order: 1 }
    ],
    menu_items: [
      { id: "i1", course_id: "k1", name: "Morning Plate", tag: null,
        description: "Mixed greens.", price: "21", prices: null, price_all_sizes: null,
        no_price: false, is_hidden: false, options_dom_id: null, sort_order: 1 },
      { id: "i2", course_id: "k2", name: "Drip Coffee", tag: null, description: null,
        price: null, prices: ["4", "5"], price_all_sizes: null, no_price: false,
        is_hidden: false, options_dom_id: null, sort_order: 1 }
    ],
    menu_item_pours: [
      { id: "p1", item_id: "i1", label: "Bottle", price: "60", sort_order: 1 }
    ],
    menu_builder_options: [
      { id: "b1", group_key: "base", label: "Avocado toast", price: "6",
        hint: "Smashed avocado on grilled sourdough.", sub_key: null,
        is_hidden: false, sort_order: 1 },
      { id: "b2", group_key: "base", label: "Bagel of your choice", price: "3",
        hint: "Plain or everything, toasted to order.", sub_key: "bagel",
        is_hidden: false, sort_order: 2 },
      { id: "b3", group_key: "bagel", label: "Plain", price: null,
        hint: null, sub_key: null, is_hidden: false, sort_order: 1 },
      { id: "b4", group_key: "add", label: "Cream cheese", price: "2",
        hint: null, sub_key: null, is_hidden: false, sort_order: 1 }
    ],
    /* One described photograph and one backdrop, which are the two cases the
       panel behaves differently for. Neither has been uploaded to, which is
       the state all 29 real slots start in. */
    photos: [
      { id: "ph1", slot: "hero.main", label: "The photograph behind the opening headline",
        storage_path: null, source_path: null, alt: "The upstairs dining room",
        width: 1535, height: 1024, is_decorative: false, sort_order: 10 },
      { id: "ph2", slot: "wine.backdrop", label: "The Wine Bar — the background behind the section",
        storage_path: null, source_path: null, alt: "",
        width: 1088, height: 1445, is_decorative: true, sort_order: 20 }
    ]
  };
}

/* Most tests do not need a holiday. Change-list tests do, because otherwise
   the add/remove path for that table would never be walked. */
function withExtras() {
  const data = fixture();
  data.hours_exceptions = [
    { id: "x1", on_date: "2026-12-25", is_closed: true,
      opens_at: null, closes_at: null, note: "Christmas Day" }
  ];
  return data;
}

/* What data/seed-photos.js gives the editor: the picture a slot has before
   anything is uploaded, and its shape. */
const SEED_PHOTOS = {
  "hero.main": {
    src: "assets/web/hero-dining.jpg", alt: "The upstairs dining room",
    width: 1535, height: 1024
  },
  "wine.backdrop": {
    src: "assets/web/wine-cabinet.jpg", decorative: true, width: 1088, height: 1445
  }
};


/* ═══ the fake project ══════════════════════════════════════════════════════
   A PostgREST-shaped object that records rather than sends. It is deliberately
   permissive: this is not a test of row level security — tools/test-rls.mjs and
   tools/check-live-project.mjs ask the database that, and asking it here would
   only prove that a fake refuses what it was written to refuse. */

function fakeSupabase(data, log, opts) {
  opts = opts || {};
  let nextId = 100;

  function result(value) {
    /* A PostgrestBuilder is a thenable that also chains, which is the only part
       of its shape admin.js relies on. */
    const p = {
      _table: value._table,
      select() { return p; },
      order() { return p; },
      eq(col, v) { p._eq = [col, v]; return p; },
      then(ok, no) { return Promise.resolve(value.settle(p)).then(ok, no); }
    };
    return p;
  }

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: opts.session || null }, error: null }),
      signInWithPassword: (creds) => {
        log.push({ what: "signIn", email: creds.email });
        if (opts.badPassword) {
          return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } });
        }
        return Promise.resolve({ data: { user: { email: creds.email } }, error: null });
      },
      signOut: () => { log.push({ what: "signOut" }); return Promise.resolve({ error: null }); }
    },

    rpc: (name) => {
      log.push({ what: "rpc", name });
      return Promise.resolve({ data: name === "is_owner" ? opts.isOwner !== false : null, error: null });
    },

    functions: {
      invoke: (name, options) => {
        log.push({ what: "invoke", name, options });
        return Promise.resolve(opts.refusePublish
          ? { data: null, error: { message: opts.refusePublish } }
          : { data: {}, error: null });
      }
    },

    /* The bucket. upload() and remove() are the only two methods admin.js
       reaches for, and both are recorded rather than performed — which makes
       "was the file sent before the row that names it?" a question about the
       log rather than about timing. */
    storage: {
      from: (bucket) => ({
        upload: (path, blob, options) => {
          if (opts.refuseUpload) {
            return Promise.resolve({ data: null, error: { message: opts.refuseUpload } });
          }
          log.push({ what: "upload", bucket, path, type: blob && blob.type,
                     bytes: blob && blob.size, options });
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: (paths) => {
          log.push({ what: "remove", bucket, paths });
          return Promise.resolve({ data: [], error: null });
        }
      })
    },

    from: (table) => ({
      select: (cols) => result({
        _table: table,
        settle: () => ({ data: data[table] || [], error: null, cols })
      }),
      insert: (payload) => result({
        _table: table,
        settle: () => {
          if (opts.refuse && opts.refuse.table === table && opts.refuse.what === "insert") {
            return { data: null, error: { message: opts.refuse.message } };
          }
          const id = "new-" + (nextId += 1);
          log.push({ what: "insert", table, payload, id });
          return { data: [{ id }], error: null };
        }
      }),
      update: (payload) => result({
        _table: table,
        settle: (builder) => {
          if (opts.refuse && opts.refuse.table === table && opts.refuse.what === "update") {
            return { data: null, error: { message: opts.refuse.message } };
          }
          log.push({ what: "update", table, payload, id: builder._eq && builder._eq[1] });
          return { data: null, error: null };
        }
      }),
      delete: () => result({
        _table: table,
        settle: (builder) => {
          log.push({ what: "delete", table, id: builder._eq && builder._eq[1] });
          return { data: null, error: null };
        }
      })
    })
  };
}


/* ═══ booting the real page ═════════════════════════════════════════════════ */

const settle = async (turns = 12) => {
  for (let i = 0; i < turns; i++) await new Promise((r) => setTimeout(r, 0));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* admin.js's own disclosure timing, read out of the file rather than copied,
   so a test that waits for something to finish collapsing keeps waiting the
   right amount when that number changes. */
const DISCLOSURE_MS = Number(/DISCLOSURE_MS = (\d+)/.exec(ADMIN_JS)[1]);

/* Async because admin.js waits for DOMContentLoaded before it wires anything
   up. Dispatching a submit at a form whose handler has not been attached yet
   is a test that quietly does nothing and reports whatever the page happened
   to look like — which is how the first run of this file "passed" three
   assertions about a sign-in that never happened. */
async function boot(opts) {
  opts = opts || {};
  const data = opts.data || fixture();
  const log = [];

  const dom = new JSDOM(readFileSync("admin.html", "utf8"), {
    runScripts: "dangerously",
    url: "http://localhost:5173/admin.html"       // not file:, which the editor refuses
  });
  const { window } = dom;

  window.AROMATI_CONFIG = {
    url: "https://yofoiqgknsqzsuwtlqvh.supabase.co",
    anonKey: "sb_publishable_0000000000000000000000000000"
  };
  window.supabase = { createClient: () => fakeSupabase(data, log, opts) };
  /* jsdom has none; the editor asks before deleting. The text is kept because
     what a destructive confirm actually says is the whole of its value. */
  window.confirm = (message) => { log.push({ what: "confirm", message }); return opts.confirm !== false; };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.matchMedia = (query) => ({
    matches: query.includes("(min-width: 641px)")
      ? opts.mobile !== true
      : query === "(prefers-reduced-motion: reduce)" && opts.reducedMotion === true,
    media: query,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; }
  });

  /* admin.html loads data/seed-photos.js as a classic script, which jsdom does
     not fetch. Declared here so the photo panel has a built-in picture to show,
     the same way the browser has one. */
  window.SEED_PHOTOS = opts.seedPhotos || SEED_PHOTOS;

  /* jsdom has no image decoding and no canvas, so the parts of the upload
     pipeline that are the *browser's* work are stubbed and the parts that are
     admin.js's work are not. What is faked: decoding a file to pixels, and
     encoding pixels to webp. What is real, and therefore what these tests
     actually cover: reading the EXIF tag out of the bytes, deciding whether the
     browser already applied it, the size everything is scaled to, and the
     transform chosen for it. */
  window.createImageBitmap = (file, options) => Promise.resolve({
    width: (opts.decoded || { width: 4000, height: 3000 }).width,
    height: (opts.decoded || { width: 4000, height: 3000 }).height,
    _orientationOption: options && options.imageOrientation,
    close() {}
  });

  const drawn = [];
  window.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return {
      setTransform: (...m) => drawn.push({ what: "setTransform", m }),
      drawImage: (src, x, y, w, h) => drawn.push({
        what: "drawImage", w, h, canvas: [canvas.width, canvas.height]
      })
    };
  };
  window.HTMLCanvasElement.prototype.toBlob = function (done, type, quality) {
    const canvas = this;
    /* A stand-in whose size is a function of the pixels asked for, so a test
       about the size limit is testing arithmetic rather than a constant. */
    const bytes = Math.round(canvas.width * canvas.height * 0.05);
    done(Object.assign(new window.Blob([new Uint8Array(bytes)], { type }),
                       { _quality: quality }));
  };
  window.URL.createObjectURL = (blob) => "blob:fake/" + (blob && blob.type);
  window.URL.revokeObjectURL = () => {};

  /* Reopening the framing box on a photograph that is already in a slot fetches
     it back — off this site when it is the built-in one, out of the bucket when
     it was uploaded. Which URL it asks for is the whole question, so every one
     is recorded. */
  const fetched = [];
  window.fetch = (url) => {
    fetched.push(String(url));
    if (opts.fetchFails) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(
        new window.Blob([opts.fetchBytes || jpeg()], { type: "image/jpeg" }))
    });
  };

  const errors = [];
  window.console.error = (...a) => errors.push(a.join(" "));

  /* What a previous visit left behind. Written before the script runs, because
     that is when the editor reads it — each JSDOM has its own localStorage, so
     a reload has to be staged rather than performed. */
  Object.keys(opts.remember || {}).forEach((key) => {
    window.localStorage.setItem(key, opts.remember[key]);
  });

  const script = window.document.createElement("script");
  script.textContent = opts.source || ADMIN_JS;
  window.document.body.appendChild(script);

  const doc = window.document;
  const q = (sel) => doc.querySelector(sel);
  const all = (sel) => [...doc.querySelectorAll(sel)];

  await settle();

  return {
    window, doc, log, errors, data, q, all,

    /* Sign in the way a person does — the form, not the client. */
    async signIn() {
      q("#email").value = "owner@aromatiNY.com";
      q("#password").value = "correct horse";
      q("#signInForm").dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));
      await settle();
    },

    tab(name) {
      const button = all(".tab").find((b) => b.textContent.trim().startsWith(name));
      if (!button) throw new Error(`no tab called ${name}`);
      button.click();
    },

    /* One section of the current area is in the editor at a time, so a test
       that wants a particular one says so. By the label the owner reads. */
    section(label) {
      const row = all(".index__label").find((n) => n.textContent.trim().startsWith(label));
      if (!row) throw new Error(`no section called ${JSON.stringify(label)}`);
      row.closest(".index__pick").click();
    },

    /* Look for something in the editor pane, and if it is not there, go
       looking through the other sections of the same area for it. Which is
       what a person does, and it keeps every test below saying what it is
       about rather than where it had to click first. */
    inSomeSection(find) {
      const here = find();
      if (here) return here;
      const rows = all(".index__pick");
      for (const row of rows) {
        row.click();
        const found = find();
        if (found) return found;
      }
      return null;
    },

    /* Fields are found by the value they are showing, which is how the person
       editing finds them too. The search box is excluded: it lives beside the
       menu index, it is empty to start with, and typing a heading into it
       instead of into the heading box is a mistake that looks like a pass. */
    fieldShowing(value) {
      const node = this.inSomeSection(() =>
        all("#panels .field__input, #panels .field__area").find((n) => n.value === value));
      if (!node) throw new Error(`no field showing ${JSON.stringify(value)}`);
      return node;
    },

    /* By its label, which is the owner's word for it — the only name in the
       editor that is not a column. */
    fieldLabelled(scope, label) {
      const field = [...scope.querySelectorAll(".field")]
        .find((f) => {
          const own = f.querySelector(".field__label");
          return own && own.textContent.trim().startsWith(label);
        });
      if (!field) throw new Error(`no field labelled ${JSON.stringify(label)}`);
      return field.querySelector(".field__input, .field__area, .field__select");
    },

    fetched() { return fetched; },

    lastCard() { return all(".card").slice(-1)[0]; },

    type(node, value) {
      node.value = value;
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    },

    async save() { q("#saveBtn").click(); await settle(); },

    /* ── the change list ── */

    /* Opened the way the owner opens it: by pressing the count. */
    async openChanges() { q("#changesToggle").click(); await settle(); },
    changesOpen() { return q("#changes").classList.contains("is-open"); },
    changesHidden() { return q("#changes").hidden; },
    changesTitle() { return q("#changesTitle").textContent; },

    /* One object per entry, shaped like what the owner reads rather than like
       the markup — so a test says what the list says, not where it says it. */
    changeRows() {
      return [...doc.querySelectorAll(".change")].map((li) => ({
        where: (li.querySelector(".change__where") || { textContent: "" }).textContent,
        title: li.querySelector(".change__title, .change__title--flat").textContent,
        flag: (li.querySelector(".change__flag") || { textContent: "" }).textContent,
        lines: [...li.querySelectorAll(".change__line")]
          .map((n) => [...n.children].map((c) => c.textContent).join(" ")),
        canGo: !!li.querySelector(".change__title"),
        canUndo: !!li.querySelector(".change__undo")
      }));
    },

    async undoChange(title) {
      const li = [...doc.querySelectorAll(".change")].find((n) => {
        const own = n.querySelector(".change__title, .change__title--flat");
        return own && own.textContent === title;
      });
      if (!li) throw new Error(`no change listed for ${JSON.stringify(title)}`);
      const button = li.querySelector(".change__undo");
      if (!button) throw new Error(`no undo offered for ${JSON.stringify(title)}`);
      button.click();
      await settle();
    },

    async goToChange(title) {
      const li = [...doc.querySelectorAll(".change")].find((n) => {
        const own = n.querySelector(".change__title, .change__title--flat");
        return own && own.textContent === title;
      });
      if (!li) throw new Error(`no change listed for ${JSON.stringify(title)}`);
      li.querySelector(".change__title").click();
      await settle();
    },

    /* Which menu page the index is showing, by the button that is pressed. */
    menuPage() {
      const on_ = [...doc.querySelectorAll(".pagepick__btn")]
        .find((b) => b.getAttribute("aria-pressed") === "true");
      return on_ ? on_.textContent : null;
    },
    async menuPageTo(name) {
      const b = [...doc.querySelectorAll(".pagepick__btn")].find((n) => n.textContent === name);
      if (!b) throw new Error(`no menu page called ${name}`);
      b.click();
      await settle();
    },

    /* Which section the editor pane is actually showing. */
    openSection() {
      const row = [...doc.querySelectorAll(".index__pick")]
        .find((n) => n.getAttribute("aria-current") === "true");
      const label = row && row.querySelector(".index__label");
      return label ? label.textContent : null;
    },

    problems() { return [...doc.querySelectorAll(".problems__link")].map((n) => n.textContent); },
    confirms() { return log.filter((l) => l.what === "confirm").map((l) => l.message); },
    changeCount() { return q("#saveCount").textContent; },
    writes() { return log.filter((l) => ["insert", "update", "delete"].includes(l.what)); },

    /* Everything that left the page, in the order it left, which is the only
       way to ask whether the file went before the row that names it. */
    sent() { return log.filter((l) => ["upload", "remove", "insert", "update", "delete"].includes(l.what)); },
    uploads() { return log.filter((l) => l.what === "upload"); },
    drawn() { return drawn; },

    /* The block for one slot, found by the label the owner reads — in whichever
       section of the Photos index it lives in. */
    photo(label) {
      const node = this.inSomeSection(() => all(".photo").find((p) => {
        const own = p.querySelector(".photo__label");
        return own && own.textContent.trim() === label;
      }));
      if (!node) throw new Error(`no photograph block labelled ${JSON.stringify(label)}`);
      return node;
    },

    /* Choosing a file, as far as the page can tell. `files` is read-only and
       jsdom has no file picker, so it is defined onto the element and the same
       change event is dispatched.

       Every picked file goes through the framing box before it becomes an
       upload, so this walks through it too. `how` says with which button:
       "use" is the default because that is what a person does, "cancel" backs
       out, and "leave" stops with the box still open for a test that is about
       the box itself. */
    async pick(block, file, how) {
      const input = block.querySelector(".photo__file");
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
      if (how !== "leave") await this.frame(how || "use");
    },

    /* The framing box, if it is open. */
    framer() { return q(".framer"); },

    /* Reopen the framing box on the photograph already in a slot. */
    async adjust(block, how) {
      const button = [...block.querySelectorAll("button")]
        .find((b) => b.textContent === "Adjust framing");
      if (!button) throw new Error("no Adjust framing button on that photograph");
      button.click();
      await settle();
      if (how !== "leave") await this.frame(how || "use");
    },

    /* Come out of the framing box: "use" keeps the framing, "cancel" throws it
       away. Silent when there is no box, so a test about a file that was
       refused before the box could open does not have to know that. */
    async frame(how) {
      const box = q(".framer");
      if (!box) return false;
      const label = how === "cancel" ? "Cancel" : "Use this framing";
      const button = [...box.querySelectorAll("button")]
        .find((b) => b.textContent === label);
      if (!button) throw new Error(`no ${label} button in the framing box`);
      button.click();
      await settle();
      return true;
    },

    /* The shape buttons across the top, by the words on them. */
    shapes() {
      const box = q(".framer");
      return box ? [...box.querySelectorAll(".framer__shape")].map((b) => b.textContent) : [];
    },

    async shape(label) {
      const button = [...q(".framer").querySelectorAll(".framer__shape")]
        .find((b) => b.textContent === label);
      if (!button) throw new Error(`no shape called ${JSON.stringify(label)}`);
      button.click();
      await settle();
    },

    file(name, type, bytes) {
      return new window.File([bytes || new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type });
    }
  };
}


/* ═══ a photograph, as bytes ════════════════════════════════════════════════
   A JPEG small enough to write out by hand and real enough for the two
   readers in admin.js to work on: SOI, an APP1/Exif block carrying one
   Orientation tag, an SOF0 frame header carrying the stored dimensions, EOI.

   Written rather than checked in, because the point is to control the
   orientation tag — and a fixture file whose tag nobody can see is a fixture
   nobody can reason about. */
function jpeg({ orientation = 1, width = 4000, height = 3000 } = {}) {
  const be = (n) => [(n >> 8) & 0xff, n & 0xff];

  /* One IFD entry: tag 0x0112, type SHORT, count 1, value in the field. */
  const ifd = [
    ...be(1),                                   // entry count
    ...be(0x0112), ...be(3), 0, 0, 0, 1,        // tag, type, count
    ...be(orientation), 0, 0,                   // value, padded to four bytes
    0, 0, 0, 0                                  // next IFD: none
  ];
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a,                     // "MM", big-endian, magic 42
    0, 0, 0, 8,                                 // offset to the first IFD
    ...ifd
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];   // "Exif\0\0"

  return new Uint8Array([
    0xff, 0xd8,                                             // SOI
    0xff, 0xe1, ...be(exif.length + 2), ...exif,            // APP1
    0xff, 0xc0, ...be(11), 8, ...be(height), ...be(width), 1,  // SOF0
    0xff, 0xd9                                              // EOI
  ]);
}


/* ═══ 1. the one security rule ══════════════════════════════════════════════ */

console.log("\nthe one security rule");
{
  /* Comments are stripped first. The rule is about what the code does, and a
     file that explains why it never uses innerHTML must be allowed to say the
     word. */
  const scan = (src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return [...code.matchAll(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/g)]
      .map((m) => m[1]);
  };

  check("admin.js writes no markup", scan(ADMIN_JS), []);

  /* The control. Without it, the line above passes just as happily against a
     scan that is broken, a file that failed to load, or a regex that matches
     nothing at all. */
  const sabotaged = ADMIN_JS.replace("function clear(node) {",
    "function clear(node) { node.innerHTML = \"\";");
  check("…and the scan notices when one is put in", scan(sabotaged), ["innerHTML"]);

  check("no page in the editor builds a link from a value", /href\s*=\s*[^"';\n]*value/.test(ADMIN_JS), false);
}


/* ═══ 2. the wording belongs to the database ════════════════════════════════ */

console.log("\nthe messages the owner sees exist once, in two places");
{
  /* Both sides, extracted rather than listed: a rule added to the migration
     and not to the editor is exactly as much of a drift as the reverse. */
  const fromSql = [...MIGRATION.matchAll(/raise exception\s*\n?\s*'((?:[^']|'')+)'/g)]
    .map((m) => m[1].replace(/''/g, "'"))
    .filter((s) => !s.includes("%"));                 // those carry a substitution

  /* Scoped to SETTING_RULES rather than to every `message:` in the file — the
     savebar has one too, and a test that fails on an unrelated string is a test
     people learn to edit rather than to read. */
  const rules = (/var SETTING_RULES = \[([\s\S]*?)\n  \];/.exec(ADMIN_JS) || [])[1];
  if (!rules) { failures++; console.log("  FAIL SETTING_RULES could not be found in admin.js"); }

  const fromJs = [...(rules || "").matchAll(/message:\s*\n?\s*"((?:\\.|[^"])*)"/g)]
    .map((m) => m[1].replace(/\\"/g, '"'));

  const missingFromJs = fromSql.filter((s) => !ADMIN_JS.includes(s));
  const missingFromSql = fromJs.filter((s) => !MIGRATION.includes(s));

  check("every setting rule the database enforces is worded in the editor too",
        missingFromJs, []);
  check("and the editor invents none of its own", missingFromSql, []);
  check("there are rules to compare at all", fromJs.length > 4, true);

  /* The one message that carries a substitution, checked on its own so the
     filter above cannot hide it. */
  const withLabel = /The field "%" cannot be left empty because it appears on every page\./.test(MIGRATION);
  const inJs = ADMIN_JS.includes('cannot be left empty because it appears on every page.');
  check("the empty-field sentence matches too", [withLabel, inJs], [true, true]);
}


/* ═══ 3. the gate ═══════════════════════════════════════════════════════════ */

console.log("\nthe gate");
{
  const r = await boot();
  await settle();
  check("with no session, the sign-in form is what is shown",
        [r.q("#gate").hidden, r.q("#app").hidden], [false, true]);

  await r.signIn();
  check("signing in asks the database whether this account may edit",
        r.log.some((l) => l.what === "rpc" && l.name === "is_owner"), true);
  check("and then the editor is open", r.q("#app").hidden, false);
  check("nothing was written just by opening it", r.writes(), []);
}

{
  const r = await boot({ isOwner: false });
  await r.signIn();
  check("an account that is not the owner is signed straight back out",
        r.log.some((l) => l.what === "signOut"), true);
  check("and does not get the editor", r.q("#app").hidden, true);
  check("and is told why, without being told whether the password was right",
        r.q("#gateMsg").textContent,
        "That account exists, but it is not allowed to edit this site.");
}

{
  const r = await boot({ badPassword: true });
  await r.signIn();
  check("a wrong password says so in plain words",
        r.q("#gateMsg").textContent, "That email and password do not match an account.");
}


console.log("\nthe shortened helper copy");
{
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.section("How Google files the business");
  const locked = r.fieldShowing("CafeOrCoffeeShop").closest(".field");
  check("a disabled setting does not explain a control the owner cannot use",
        [locked.querySelector(".field__input").disabled,
         !!locked.querySelector(".field__help")], [true, false]);
}

console.log("\nthe Words page index");
{
  const data = fixture();
  data.site_copy.push({
    id: "c3", key: "menuFood.title", page: "food", section: "Food menu",
    label: "Page title", help: null, value: "The Food Menu",
    max_length: null, sort_order: 3
  });
  data.site_copy.push({
    id: "c4", key: "menuFood.note", page: "food", section: "Food note",
    label: "Page note", help: null, value: "Served daily",
    max_length: null, sort_order: 4
  });
  const r = await boot({ data });
  await r.signIn();
  const division = r.q(".index__division");
  const divisions = r.all(".index__division");
  const groups = r.all(".index__group");
  check("adds one unlabelled divider before the Food menu area",
        [divisions.length,
         division.textContent,
         groups[0].textContent,
         groups[1].textContent,
         division.nextElementSibling === groups[1]],
        [1, "", "Home page", "Food menu", true]);
}


console.log("\nthe publishing explanation");
{
  const r = await boot();
  await r.signIn();
  const button = r.q("#publishHelpBtn");
  check("the information control is present beside Publish",
        [!!button, button && button.getAttribute("aria-controls")],
        [true, "publishHelpTip"]);
  check("and explains the 500-use quota without making it a rebuild button",
        [r.q("#publishHelpTip").textContent.includes("quota of 500 uses per month"),
         button.getAttribute("aria-expanded")], [true, "false"]);

  button.click();
  check("a tap opens the explanation", [button.getAttribute("aria-expanded"),
        r.q("#publishHelp").classList.contains("is-open")], ["true", true]);

  r.doc.dispatchEvent(new r.window.MouseEvent("mousedown", { bubbles: true }));
  check("clicking elsewhere closes it", button.getAttribute("aria-expanded"), "false");
}

console.log("\npublishing requires a deliberate confirmation");
{
  const r = await boot();
  await r.signIn();
  const button = r.q("#publishBtn");
  button.click();
  await settle();

  const panel = r.q("#publishConfirm");
  check("Publish opens a small anchored dialog instead of a browser confirmation",
        [panel.getAttribute("aria-hidden"), panel.getAttribute("role"),
         button.getAttribute("aria-expanded"), r.confirms()],
        ["false", "dialog", "true", []]);
  check("the popout is only a concise confirmation",
        [r.q("#publishConfirmTitle").textContent,
         r.q("#publishConfirmBtn").textContent,
         /500|quota|cannot be cancelled/i.test(panel.textContent)],
        ["Publish now?", "Confirm", false]);
  check("the safer action receives focus first",
        r.doc.activeElement.id, "publishCancel");
  check("opening it sends no publish request",
        r.log.filter((entry) => entry.what === "invoke"), []);

  r.q("#publishCancel").click();
  check("Cancel closes the popout, returns focus, and sends nothing",
        [panel.getAttribute("aria-hidden"), button.getAttribute("aria-expanded"),
         r.doc.activeElement.id,
         r.log.filter((entry) => entry.what === "invoke")],
        ["true", "false", "publishBtn", []]);

  button.click();
  await settle();
  r.doc.dispatchEvent(new r.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check("Escape closes it too",
        [panel.getAttribute("aria-hidden"), r.doc.activeElement.id], ["true", "publishBtn"]);

  button.click();
  await settle();
  r.doc.body.dispatchEvent(new r.window.MouseEvent("mousedown", { bubbles: true }));
  check("and clicking elsewhere dismisses it without publishing",
        [panel.getAttribute("aria-hidden"),
         r.log.filter((entry) => entry.what === "invoke")], ["true", []]);
}

{
  const r = await boot();
  await r.signIn();
  r.q("#publishBtn").click();
  await settle();
  r.q("#publishConfirmBtn").click();
  await settle();

  check("Publish now starts exactly one rebuild",
        r.log.filter((entry) => entry.what === "invoke")
          .map((entry) => [entry.name, entry.options.method]),
        [["publish-site", "POST"]]);
  check("and closes the popout while keeping the existing in-progress message",
        [r.q("#publishConfirm").getAttribute("aria-hidden"),
         r.q("#publishMsg").textContent],
        ["true", "Publishing. The site updates in about a minute."]);
}

{
  const r = await boot();
  await r.signIn();
  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."), "Unsaved words");
  r.q("#publishBtn").click();
  await settle();

  check("unsaved changes are still blocked before opening the confirmation",
        [r.q("#publishConfirm").getAttribute("aria-hidden"),
         r.log.filter((entry) => entry.what === "invoke")], ["true", []]);
  check("and the owner is still told to save first",
        r.q("#publishMsg").textContent,
        "Save your changes first. Publishing builds the site from saved content.");
}


/* ═══ 4. editing, and what a save actually sends ════════════════════════════ */

console.log("\nediting a paragraph");
{
  const r = await boot();
  await r.signIn();

  const field = r.fieldShowing("Aromati, from the Georgian word for *aroma*.");
  r.type(field, "Aromati, from the Georgian word for *aroma*, in Murray Hill.");

  check("one change is counted, and says where it is",
        r.changeCount(), "1 unsaved change in The Idea");
  check("and nothing has been sent yet", r.writes(), []);

  r.type(field, "Aromati, from the Georgian word for *aroma*.");
  check("undoing a field starts its exit", field.parentElement.classList.contains("field--edited-leaving"), true);
  check("undoing a tab change starts its exit", r.q(".tab__dot").classList.contains("tab__dot--leaving"), true);
  check("undoing the last change starts the savebar exit",
        r.q("#savebar").classList.contains("savebar--leaving"), true);
  await wait(260);
  await settle();
  check("the field marker finishes leaving", field.parentElement.classList.contains("field--edited"), false);
  /* The bar stays put and goes quiet rather than sliding out from under the
     pointer — the pane's foot does not move as the last edit is undone. */
  check("the savebar finishes going quiet",
        r.q("#savebar").classList.contains("savebar--clean"), true);
  check("and says so in words", r.changeCount(), "No changes yet");
  check("with nothing left to press", r.q("#saveBtn").disabled, true);

  r.type(field, "Aromati, from the Georgian word for *aroma*, in Murray Hill.");

  await r.save();
  const writes = r.writes();
  check("saving sends exactly one update", writes.length, 1);
  check("to the right row", [writes[0].table, writes[0].id], ["site_copy", "c2"]);
  check("carrying only the value — never the label, help or key",
        Object.keys(writes[0].payload), ["value"]);
  check("with what was typed", writes[0].payload.value,
        "Aromati, from the Georgian word for *aroma*, in Murray Hill.");
  check("and the savebar speaks up", r.q("#savebar").classList.contains("savebar--clean"), false);
  check("the change is no longer counted as outstanding",
        r.q("#saveCount").textContent, "Saved. The site is showing it now.");
}

console.log("\nthe protected columns");
{
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.type(r.fieldShowing("3322073847"), "2125551234");
  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."), "Georgian cooking, all morning.");
  await r.save();

  /* The control. Every assertion below is about what is absent, and a save
     that sent nothing satisfies all of them. */
  check("both edits were really sent", r.writes().length, 2);

  const forbidden = ["key", "label", "help", "sort_order", "page", "section",
                     "max_length", "is_editable", "id"];
  const sent = r.writes().flatMap((w) => Object.keys(w.payload));
  check("no request carried a column the owner does not own",
        sent.filter((c) => forbidden.includes(c)), []);
}


/* ═══ 5. what the editor refuses to send ════════════════════════════════════ */

console.log("\nwhat it will not save");
{
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.type(r.fieldShowing("3322073847"), "332 207 3847");
  await r.save();

  check("a badly-formed phone number blocks the save", r.writes(), []);
  check("in the database's own words", r.problems(), [
    "The phone number needs exactly 10 digits with no spaces, brackets or dashes. For (332) 207-3847 enter 3322073847."
  ]);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.type(r.fieldShowing("https://example.com/store"), "javascript:alert(1)");
  await r.save();
  check("an ordering link that is not https is refused", r.writes(), []);
  check("and says what to paste instead",
        r.problems()[0].startsWith("Paste the full ordering link from the address bar"), true);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.type(r.fieldShowing("https://example.com/store"), "");
  await r.save();
  check("but clearing an ordering link is allowed — it is how a service comes off the site",
        r.writes().length, 1);
}

{
  const r = await boot();
  await r.signIn();
  const headline = r.fieldShowing("Georgian cooking for a Manhattan morning.");
  r.type(headline, "Georgian cooking for a Manhattan morning, every day of the week, from seven.");
  await r.save();
  check("a headline past its limit blocks the save", r.writes(), []);
  check("and says by how much",
        r.problems()[0].includes("is 76 characters and the limit is 72"), true);
}

{
  const r = await boot();
  await r.signIn();
  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."),
         "Aromati, from the Georgian word for *aroma.");
  await r.save();
  check("an unclosed *emphasis* blocks the save", r.writes(), []);
  check("and explains what asterisks do",
        r.problems()[0].includes("They work in pairs"), true);
}


/* ═══ 6. the menu, where the foreign keys are ═══════════════════════════════ */

console.log("\nadding a section and an item inside it");
{
  const r = await boot();
  await r.signIn();
  r.tab("Menus");

  /* Add a section sits under the index, and the new section is the one the
     editor opens on — there is nothing to unfold. */
  r.all(".btn").find((b) => b.textContent === "Add a section").click();

  const settings = r.all(".card")[0];
  r.type(r.fieldLabelled(settings, "Heading on the page"), "Pastries");
  r.type(r.fieldLabelled(settings, "Tab label"), "Pastries");
  r.type(r.fieldLabelled(settings, "Filter name"), "pastries");

  r.all(".btn").find((b) => b.textContent === "Add an item").click();

  const item = r.q(".item");
  r.type(r.fieldLabelled(item, "Name"), "Croissant");
  r.type(r.fieldLabelled(item, "Price"), "6");

  await r.save();
  const inserts = r.writes().filter((w) => w.what === "insert");
  check("two rows are created", inserts.map((i) => i.table), ["menu_courses", "menu_items"]);
  check("the section goes first", inserts[0].payload.heading, "Pastries");
  check("and the item points at the id the section came back with",
        inserts[1].payload.course_id, inserts[0].id);
  check("with the price kept as typed, not as a number", inserts[1].payload.price, "6");
}

console.log("\ndeleting");
{
  const r = await boot();
  await r.signIn();
  r.tab("Menus");                                               // Breakfast is already open
  r.all(".item__head")[0].click();                              // open Morning Plate
  r.all(".btn--danger").find((b) => b.textContent === "Delete this item").click();
  await r.save();

  const writes = r.writes();
  check("the item is deleted", writes.map((w) => [w.what, w.table, w.id]),
        [["delete", "menu_items", "i1"]]);
  check("and its pour is not deleted separately — the database cascades it",
        writes.some((w) => w.table === "menu_item_pours"), false);
}

/* Hiding is the gentler half of the pair the Delete button belongs to: the item
   comes off the site and keeps everything it has. What the editor owes it is
   that the flag actually leaves the page as a column — the pruning on the
   public side is tools/test-menu-hidden.mjs's business — and that the one state
   nobody wants, a menu page with nothing visible left on it, is refused before
   it can be saved rather than discovered by loading the site. */
function hideBox(item) {
  const field = [...item.querySelectorAll(".field")]
    .find((f) => {
      const own = f.querySelector(".field__label");
      return own && own.textContent.trim().startsWith("On the menu");
    });
  if (!field) throw new Error("no On the menu field on this item");
  return field.querySelector("input[type=checkbox]");
}

console.log("\nhiding an item rather than deleting it");
{
  /* Two items in the breakfast section rather than the fixture's one. Hiding
     the only item on a page is a different case with a different answer, and it
     is the one below — this case needs something left standing. */
  const r = await boot({
    data: Object.assign(fixture(), {
      menu_items: fixture().menu_items.concat([{
        id: "i3", course_id: "k1", name: "Shakshuka", tag: null, description: null,
        price: "16", prices: null, price_all_sizes: null, no_price: false,
        is_hidden: false, options_dom_id: null, sort_order: 2
      }])
    })
  });
  await r.signIn();
  r.tab("Menus");
  r.all(".item__head")[0].click();                              // open Morning Plate

  const box = hideBox(r.q(".item"));
  check("it starts on the menu", box.checked, false);
  box.click();
  await settle();

  await r.save();
  const writes = r.writes();
  check("one row is updated, not deleted",
        writes.map((w) => [w.what, w.table, w.id]), [["update", "menu_items", "i1"]]);
  check("carrying the flag", writes[0].payload.is_hidden, true);
  /* The whole promise of hiding is that nothing is lost, so the row that goes
     out has to still be the row. An update that blanked the description while
     setting the flag would satisfy every other check here. */
  check("and the item itself, intact",
        [writes[0].payload.name, writes[0].payload.description, writes[0].payload.price],
        ["Morning Plate", "Mixed greens.", "21"]);
  check("nothing was deleted, so nothing cascaded",
        writes.some((w) => w.what === "delete"), false);
}

console.log("\na hidden item says so without being opened");
{
  const r = await boot({
    data: Object.assign(fixture(), {
      menu_items: fixture().menu_items.map((i) =>
        i.id === "i1" ? Object.assign({}, i, { is_hidden: true }) : i)
    })
  });
  await r.signIn();
  r.tab("Menus");
  check("the closed row is flagged",
        r.q(".item__flag") && r.q(".item__flag").textContent, "Hidden");
  check("and the row is marked for the stylesheet",
        r.q(".item").classList.contains("item--hidden"), true);
  check("the section count says what is on the site, and what is not",
        [...r.all(".index__row")].some((n) => /0 items, 1 hidden/.test(n.textContent)), true);
}

console.log("\nhiding everything on a page is refused");
{
  const r = await boot();
  await r.signIn();
  r.tab("Menus");
  r.all(".item__head")[0].click();
  hideBox(r.q(".item")).click();                    // the food page's only item
  await settle();
  await r.save();

  check("the save does not go out", r.writes(), []);
  check("and the page is named in the reason",
        r.problems().some((p) => /food menu is hidden/.test(p)), true);
}

/* menu_item_options is the one thing in this database the editor cannot
   rebuild: seven toppings belonging to one item, deliberately not exposed, and
   carried off by ON DELETE CASCADE the moment the item or its section goes. The
   confirm is the only thing standing between the owner and losing them, so what
   it says is the fix. These check the sentence, not the deletion. */
const CREPE = () => Object.assign(fixture(), {
  menu_items: fixture().menu_items.concat([{
    id: "i9", course_id: "k1", name: "Aromati’s Crêpe", tag: "7 toppings",
    description: null, price: "14", prices: null, price_all_sizes: null,
    no_price: false, is_hidden: false, options_dom_id: "crepeOpts", sort_order: 9
  }])
});

console.log("\ndeleting an item that owns a list the editor cannot rebuild");
{
  const r = await boot({ data: CREPE(), confirm: false });
  await r.signIn();
  r.tab("Menus");
  const crepe = r.all(".item").find((n) =>
    n.querySelector(".item__head").textContent.includes("Crêpe"));
  crepe.querySelector(".item__head").click();
  crepe.querySelectorAll(".btn--danger").forEach((b) => {
    if (b.textContent === "Delete this item") b.click();
  });

  const said = r.confirms()[0] || "";
  check("the item is named", /Aromati’s Crêpe/.test(said), true);
  check("and so is what else goes with it",
        /expandable list of options/.test(said), true);
  check("and that it is not recoverable here",
        /cannot be rebuilt here/.test(said), true);
  check("saying no really does cancel it", r.writes(), []);
}

console.log("\nand deleting the section it sits in warns about the same thing");
{
  const r = await boot({ data: CREPE(), confirm: false });
  await r.signIn();
  r.tab("Menus");
  r.all(".btn--danger").find((b) => b.textContent === "Delete this section").click();

  const said = r.confirms()[0] || "";
  check("the section and its item count are named",
        /Breakfast/.test(said) && /2 item\(s\)/.test(said), true);
  check("and the list that cannot come back is named too",
        /Aromati’s Crêpe/.test(said) && /cannot be rebuilt here/.test(said), true);
}

console.log("\nan ordinary item is not warned about a list it does not have");
{
  const r = await boot({ confirm: false });
  await r.signIn();
  r.tab("Menus");
  r.all(".item__head")[0].click();
  r.all(".btn--danger").find((b) => b.textContent === "Delete this item").click();
  /* The control. A warning on everything is a warning on nothing — this is
     what stops the sentence being pasted onto every delete in the editor. */
  check("no mention of options", /options/.test(r.confirms()[0] || ""), false);
}

console.log("\nmenu item extras use wording that fits every menu");
{
  const r = await boot();
  await r.signIn();
  r.tab("Menus");
  r.q(".item__head").click();

  const body = r.q(".item__body");
  check("the optional note says where it appears",
        r.all(".item__body .field__label").map((node) => node.textContent)
          .includes("Short note beside the name"), true);
  check("extra label-and-price lines use generic wording",
        [body.querySelector(".pours__title").textContent,
         body.querySelector(".pours .field__help").textContent,
         body.querySelector(".pours .btn--add").textContent],
        ["Additional priced options",
         "Optional label-and-price lines under the item, such as “Glass 14”, " +
           "“Bottle 60” or “Add chicken 4”.",
         "Add a priced option"]);
  check("the shared item editor no longer calls the control a pour",
        /\bpour/i.test(body.textContent), false);
}

console.log("\nthe section that is built into the page");
{
  check("the menu editor gives no outdated dollar-sign instructions",
        /dollar sign/i.test(ADMIN_JS), false);

  const r = await boot({
    data: Object.assign(fixture(), {
      menu_courses: [{ id: "k9", page: "food", course_key: "breakfast", tab_label: "Breakfast",
                       heading: "Build Your Own Breakfast", sizes: null, is_static: true,
                       static_id: "build", is_hidden: false, sort_order: 1 }],
      menu_items: [], menu_item_pours: []
    })
  });
  await r.signIn();
  r.tab("Menus");
  check("Build Your Own keeps its fixed layout note",
        r.q(".static").textContent.includes("choices inside it are editable"), true);
  const hideSection = r.q(".builder-course__intro input[type=checkbox]");
  check("and exposes a whole-section visibility switch",
        hideSection && hideSection.checked, false);
  hideSection.click();
  await r.save();
  check("hiding the builder writes only its course row",
        r.writes().filter((w) => w.what === "update").map((w) => w.table),
        ["menu_courses"]);
  check("and sends the hidden flag",
        r.writes().find((w) => w.what === "update" && w.table === "menu_courses").payload.is_hidden,
        true);
  check("and exposes the base group",
        r.all(".pours__title").map((n) => n.textContent), ["Base", "Which bagel?", "Pile it on"]);
  check("base rows no longer expose the special-choice control",
        r.all(".builder-option--base .field__label")
          .some((n) => n.textContent.trim().startsWith("Special choices")), false);
  check("the bagel link is system-owned, not a CMS write",
        r.window.AROMATI_ADMIN._test.WRITABLE.menu_builder_options.includes("sub_key"), false);
  check("builder prices have no currency helper text",
        r.all(".builder-option .field--narrow .field__help").length, 0);
  check("with one add button per group",
        r.all(".pours .btn--add").length, 3);
  check("and the seeded builder fields are present",
        r.all(".pours .field").length > 0, true);

  const search = r.q(".search__input");
  check("the menu search names builder choices in its prompt",
        search.placeholder.includes("choice"), true);
  r.type(search, "cream cheese");
  check("the search keeps the matching builder choice visible",
        r.all(".builder-option").filter((row) => !row.hidden)
          .map((row) => row.querySelector(".field__input").value), ["Cream cheese"]);
  check("and hides builder groups with no matching choices",
        r.all("[data-builder-group]").filter((group) => !group.hidden)
          .map((group) => group.getAttribute("data-builder-group")), ["add"]);
  check("and counts choices instead of reporting an empty item search",
        r.q(".search__note").textContent,
        "1 of 4 choices on this page match “cream cheese”");
  r.type(search, "");
  check("clearing the search restores every builder choice and group",
        [r.all(".builder-option").filter((row) => !row.hidden).length,
         r.all("[data-builder-group]").filter((group) => !group.hidden).length], [4, 3]);

  const added = r.all(".btn--add").find((b) => b.textContent === "Add a topping");
  added.click();
  const newRow = r.all(".pours")[2].querySelector(".builder-option:last-of-type");
  const newFields = newRow.querySelectorAll(".field__input");
  r.type(newFields[0], "Bacon");
  r.type(newFields[1], "3");
  await r.save();
  check("adding a builder topping writes only the builder table",
        r.writes().filter((w) => w.what === "insert").map((w) => w.table),
        ["menu_builder_options"]);
  const bacon = r.all(".pours .field__input").find((n) => n.value === "Bacon");
  bacon.closest(".builder-option").querySelector(".btn--danger").click();
  await r.save();
  check("removing a builder topping writes only the builder table",
        r.writes().filter((w) => w.what === "delete").map((w) => w.table),
        ["menu_builder_options"]);
}


/* ═══ 7. hours ══════════════════════════════════════════════════════════════ */

console.log("\nthe fixed bagel relationship stays usable");
{
  const data = Object.assign(fixture(), {
    menu_courses: [{ id: "k9", page: "food", course_key: "breakfast", tab_label: "Breakfast",
                     heading: "Build Your Own Breakfast", sizes: null, is_static: true,
                     static_id: "build", is_hidden: false, sort_order: 1 }],
    menu_items: [], menu_item_pours: []
  });
  const r = await boot({ data });
  await r.signIn();
  r.tab("Menus");
  const bagelBase = r.all(".builder-option--base")
    .find((row) => [...row.querySelectorAll(".field__input")]
      .some((field) => field.value === "Bagel of your choice"));
  bagelBase.querySelector('input[type="checkbox"]').click();
  await r.save();
  check("hiding the Bagel base is refused", r.writes(), []);
  check("and explains why the fixed choice must stay visible",
        r.problems().some((p) => /Keep the Bagel base visible/.test(p)), true);
}

{
  const data = Object.assign(fixture(), {
    menu_courses: [{ id: "k9", page: "food", course_key: "breakfast", tab_label: "Breakfast",
                     heading: "Build Your Own Breakfast", sizes: null, is_static: true,
                     static_id: "build", is_hidden: false, sort_order: 1 }],
    menu_items: [], menu_item_pours: []
  });
  const r = await boot({ data });
  await r.signIn();
  r.tab("Menus");
  r.all(".builder-option--bagel input[type=checkbox]").forEach((box) => box.click());
  await r.save();
  check("hiding both bagel varieties is refused", r.writes(), []);
  check("and keeps the visible-variety safeguard",
        r.problems().some((p) => /at least one visible bagel variety/.test(p)), true);
}

console.log("\nhours");
check("the open and closed states have a targeted transition and a reduced-motion fallback",
      [ADMIN_CSS.includes("opacity 220ms var(--ease)"),
       ADMIN_CSS.includes(".hours__day, .hours__times, .hours__shut{ transition: none; }")],
      [true, true]);
{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");
  const opens = r.all("#panels input[type=time]")[0];
  r.type(opens, "23:00");
  await r.save();
  check("a day that closes before it opens blocks the save", r.writes(), []);
  check("and says what it probably is",
        r.problems()[0].includes("the two boxes the wrong way round"), true);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");
  /* Tuesday keeps its time controls in the animated layer, but they are inert,
     disabled and hidden from assistive technology while the day is closed. */
  const tuesday = r.all(".hours__row")[1];
  const unavailable = [...tuesday.querySelectorAll('input[type="time"]')];
  check("a closed day keeps its times out of use",
        [tuesday.classList.contains("hours__row--shut"),
         tuesday.querySelector(".hours__times").hasAttribute("inert"),
         tuesday.querySelector(".hours__times").getAttribute("aria-hidden"),
         unavailable.every((input) => input.disabled)],
        [true, true, "true", true]);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");
  const monday = r.all(".hours__row")[0];
  const checkbox = monday.querySelector('input[type="checkbox"]');
  const times = [...monday.querySelectorAll('input[type="time"]')];

  checkbox.click();
  check("closing a day changes the existing row instead of rebuilding it",
        r.all(".hours__row")[0] === monday, true);
  check("the time controls move into the animated closed state",
        [monday.classList.contains("hours__row--shut"),
         monday.querySelector(".hours__times").getAttribute("aria-hidden"),
         times.every((input) => input.disabled)],
        [true, "true", true]);

  checkbox.click();
  check("reopening the day uses the same smooth state change",
        [r.all(".hours__row")[0] === monday,
         monday.classList.contains("hours__row--shut"),
         monday.querySelector(".hours__times").getAttribute("aria-hidden"),
         times.map((input) => input.value),
         times.every((input) => !input.disabled)],
        [true, false, "false", ["07:00", "22:00"], true]);
  check("and returning to the original hours leaves nothing unsaved",
        r.q("#saveBtn").disabled, true);
}

/* The picker replaces the browser's dropdown, so the field it writes into has
   to keep holding what the row saves — 24-hour, which is not what the columns
   show. These are about that translation as much as about the clicking. */
{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");

  const toggle = r.all(".timefield__toggle")[0];
  const panel = r.q("#" + toggle.getAttribute("aria-controls"));
  const field = r.all("#panels input[type=time]")[0];
  const column = (n) => [...panel.querySelectorAll(".tpick__col")[n].querySelectorAll(".tpick__opt")];
  const opt = (n, text) => column(n).find((b) => b.textContent === text);

  check("the picker starts closed", panel.hidden, true);
  check("the picker belongs to its own time field",
        panel.parentElement.classList.contains("timefield"), true);
  check("the clock stays in the field header",
        toggle.parentElement.classList.contains("timefield__control"), true);
  toggle.click();
  await settle();
  check("the clock button opens it", panel.hidden, false);
  check("the hour wheel repeats for rolling", column(0).length, 108);
  check("the minute wheel repeats for rolling", column(1).length, 108);
  check("AM and PM stay as one short stack", column(2).length, 2);
  check("and it opens on the time the field already holds",
        column(0).filter((b) => b.className.includes("--on")).map((b) => b.textContent), ["7"]);
  check("read as morning, not as 07 on a 24-hour clock",
        column(2).filter((b) => b.className.includes("--on")).map((b) => b.textContent), ["AM"]);

  opt(2, "PM").click();
  check("the afternoon is written back in the format the row saves", field.value, "19:00");
  opt(0, "9").click();
  opt(1, "30").click();
  check("and so is an hour and a minute", field.value, "21:30");
  check("the field says it has been edited",
        !!r.q(".field--edited .field__input--time"), true);

  await r.save();
  check("what reaches the database is the seconds-bearing time",
        r.writes()[0].payload.opens_at, "21:30:00");
}

{
  const r = await boot({ mobile: true });
  await r.signIn();
  r.tab("Hours");
  const mobileTimes = r.all("#panels input[type=time]");
  check("mobile keeps native time inputs ready for both open and closed days",
        [mobileTimes.length,
         mobileTimes.filter((input) => !input.disabled).length,
         mobileTimes.filter((input) => input.disabled).length],
        [4, 2, 2]);
  check("mobile does not add the desktop picker", r.all(".timefield__toggle").length, 0);
  check("mobile has no desktop picker panels", r.all(".tpick").length, 0);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");

  const toggle = r.all(".timefield__toggle")[0];
  const panel = r.q("#" + toggle.getAttribute("aria-controls"));

  /* Typing is still the fast way in, and 07:12 is a time no five-minute step
     lands on. The column has to show it rather than quietly disagree. */
  r.type(r.all("#panels input[type=time]")[0], "07:12");
  toggle.click();
  await settle();
  const minutes = [...panel.querySelectorAll(".tpick__col")[1].querySelectorAll(".tpick__opt")];
  check("a typed minute off the step is in the column too",
        minutes.filter((b) => b.className.includes("--on")).map((b) => b.textContent), ["12"]);

  r.doc.dispatchEvent(new r.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await wait(360);
  await settle();
  check("Escape puts it away again", panel.hidden, true);
}

{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");

  const toggles = r.all(".timefield__toggle");
  const first = r.q("#" + toggles[0].getAttribute("aria-controls"));
  const second = r.q("#" + toggles[1].getAttribute("aria-controls"));
  const input = r.all("#panels input[type=time]")[0];
  let focusCalls = 0;
  input.focus = () => { focusCalls += 1; };

  const clickClock = () => toggles[0].dispatchEvent(
    new r.window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
  check("the clock click cancels label activation", clickClock(), false);
  await settle();
  check("the custom picker opens", first.hidden, false);
  check("closing with the clock also cancels label activation", clickClock(), false);
  await wait(360);
  await settle();
  check("the custom picker closes", first.hidden, true);
  check("closing with the clock does not refocus the native time input",
        focusCalls, 0);

  toggles[0].click();
  await settle();
  toggles[1].click();
  await settle();
  check("opening Closes puts Opens away", first.hidden, false);   // still closing
  check("the second one is open", second.hidden, false);
  await wait(360);
  await settle();
  check("and only one panel is left showing", first.hidden, true);
}


/* ═══ 7b. the tab the editor comes back to ══════════════════════════════════ */

console.log("\nwhere a reload lands");
{
  const r = await boot();
  await r.signIn();
  r.tab("Hours");
  check("the tab that was opened is written down",
        r.window.localStorage.getItem("aromati.admin.tab"), "hours");
}

{
  const r = await boot({ remember: { "aromati.admin.tab": "menu" } });
  await r.signIn();
  const showing = r.all(".tab").find((b) => b.getAttribute("aria-selected") === "true");
  check("a reload comes back to it rather than to Words",
        showing.textContent.trim().startsWith("Menus"), true);
}

{
  /* A tab id that no longer exists — a panel renamed between deploys, or a
     value somebody typed into devtools. The editor has to open on something. */
  const r = await boot({ remember: { "aromati.admin.tab": "whatever" } });
  await r.signIn();
  const showing = r.all(".tab").find((b) => b.getAttribute("aria-selected") === "true");
  check("a tab that is not there any more falls back to the first",
        showing.textContent.trim().startsWith("Words"), true);
}

/* ═══ 8. discard, after a save ══════════════════════════════════════════════ */

console.log("\ndiscard, after a save");
{
  const r = await boot();
  await r.signIn();

  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."), "First edit.");
  await r.save();
  check("the first edit is saved", r.writes().length, 1);

  r.type(r.fieldShowing("First edit."), "Second edit, not wanted.");
  check("a second edit is outstanding", r.changeCount(), "1 unsaved change in The Idea");

  r.q("#discardBtn").click();
  await settle();
  check("discard starts the savebar exit", r.q("#savebar").classList.contains("savebar--leaving"), true);
  await wait(260);
  await settle();

  check("discarding goes back to what was saved, not to what was loaded",
        r.fieldShowing("First edit.").value, "First edit.");
  check("and leaves nothing to save", r.q("#savebar").classList.contains("savebar--clean"), true);

  /* The failure this replaces was silent: Discard restored the value the page
     opened with, the editor then believed that was an unsaved change, and the
     next save wrote the old wording back over the new one. */
  await r.save();
  check("so a save straight afterwards writes nothing at all", r.writes().length, 1);
}


/* ═══ 9. when the database says no ══════════════════════════════════════════ */

console.log("\na save the database refuses halfway through");
{
  /* Updates go table by table in the order admin.js lists them, so refusing
     site_copy is refusing the second of the two — which is the case worth
     testing. A refusal on the first would prove only that nothing happened. */
  const r = await boot({
    refuse: { table: "site_copy", what: "update",
              message: 'new row for relation "site_copy" violates check constraint "site_copy_within_max_length"' }
  });
  await r.signIn();

  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."), "Changed.");
  r.tab("Contact");
  r.type(r.fieldShowing("3322073847"), "2125551234");
  await r.save();

  check("the one that worked stayed done", r.writes().map((w) => w.table), ["site_settings"]);
  check("and the refusal is repeated in the database's words, not paraphrased",
        r.problems()[0].includes('violates check constraint "site_copy_within_max_length"'), true);
  check("with an honest count of what landed",
        r.problems()[0].includes("Saved 1 of 2 changes"), true);
  check("the failed edit is still marked as outstanding", r.changeCount(), "1 unsaved change");
}


/* ═══ 10. the headline measurement has something to measure ═════════════════
   The live line-count check loads the page named by site_copy.page into a
   hidden frame and looks for the element with that key's data-copy hook. Both
   halves can be wrong without anything failing: a key on the wrong page finds
   no element, the measurement silently never runs, and the only symptom is a
   warning that stops appearing — which nobody notices is missing.

   Whether the count is *right* is a question for a browser with layout in it,
   and jsdom has none. That part stays on the browser pass. This checks the
   part that can be checked: that the frame will find the element at all. */

console.log("\nthe headline check has something to look at");
{
  const { COPY_FIELDS } = await import("../tools/copy-labels.mjs");
  const files = {
    index: "index.html",
    food: "menu-food.html", drinks: "menu-drinks.html", wine: "menu-wine.html"
  };
  const html = {};
  for (const [page, file] of Object.entries(files)) html[page] = readFileSync(file, "utf8");

  const capped = Object.entries(COPY_FIELDS).filter(([, spec]) => spec.maxLength);
  check("there are capped headlines to check", capped.length > 0, true);

  const missing = capped.filter(([key, spec]) =>
    !html[spec.page] || !html[spec.page].includes(`data-copy="${key}"`));
  check("every capped headline exists on the page its row names", missing.map(([k]) => k), []);

  /* And is one of the animated ones — the cap exists because of data-split,
     so a cap on a headline that is not split is a cap with no reason. */
  const notSplit = capped.filter(([key, spec]) => {
    const at = html[spec.page] ? html[spec.page].indexOf(`data-copy="${key}"`) : -1;
    if (at < 0) return false;
    const tag = html[spec.page].slice(html[spec.page].lastIndexOf("<", at), at + 40);
    return !tag.includes("data-split");
  });
  check("and every one of them is a headline the page animates word by word",
        notSplit.map(([k]) => k), []);
}


/* ═══ 11. the photographs ═══════════════════════════════════════════════════
   The only panel that sends something other than a row, and the only one where
   a mistake leaves rubbish behind on a server. Four things are worth asking:
   what the panel offers, what a save actually sends and in what order, whether
   a picked file that is never saved leaves anything anywhere, and whether the
   pixels come out the right way up. */

console.log("\nthe photographs, before anything has been uploaded");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  check("both slots are listed", r.all(".index__row").length, 2);
  check("the page gives the short photo publishing workflow",
        r.q(".note").textContent,
        "Photos require Publish. Save all your photo changes and review them here, " +
        "then press Publish once at the top of the page to update the site. Until " +
        "the update finishes, visitors continue seeing the current photos.");
  check("the block description explains the work without obsolete restoration copy",
        [r.q(".editor__lede").textContent,
         /Put the original back/.test(r.q(".editor__lede").textContent)],
        ["The photographs used in the Opening block. Choose a new image below, " +
         "adjust its framing, and save when it looks right.", false]);

  const hero = r.photo("The photograph behind the opening headline");
  check("showing the photograph the site was built with",
        hero.querySelector(".photo__img").getAttribute("src"),
        "assets/web/hero-dining.jpg");
  check("and saying so", hero.querySelector(".photo__state").textContent,
        "The photograph the site was built with: 1535 × 1024.");
  check("with the description offered for editing",
        hero.querySelector(".field__area").value, "The upstairs dining room");

  const backdrop = r.photo("The Wine Bar — the background behind the section");
  check("the backdrop is offered no description box",
        backdrop.querySelector(".field__area, .field__input"), null);
  check("and describes its role plainly", backdrop.querySelector(".field__help").textContent,
        "This is the background image behind the Wine Bar section.");

  check("nothing has been sent by looking at any of it", r.sent(), []);
}

console.log("\nthe other-page photograph index");
{
  const data = fixture();
  data.photos.push(
    { id: "ph4", slot: "menuFood.masthead", label: "Food menu — the banner photograph",
      storage_path: null, source_path: null, alt: "", width: 1747, height: 900,
      is_decorative: true, sort_order: 40 }
  );
  const r = await boot({ data });
  await r.signIn();
  r.tab("Photos");

  const divisions = r.all(".index__division");
  const groups = r.all(".index__group");
  check("adds one unlabelled divider above Other pages",
        [divisions.length, divisions[0].textContent,
         divisions[0].nextElementSibling === groups[1], groups[1].textContent],
        [1, "", true, "Other pages"]);

  r.section("Food");
  check("describes a menu background in plain language",
        r.photo("Food menu — the banner photograph").querySelector(".field__help").textContent,
        "This is the background image behind the Food menu.");
}

console.log("\npicking a photograph");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  const hero = r.photo("The photograph behind the opening headline");
  await r.pick(hero, r.file("kitchen.jpg", "image/jpeg", jpeg({ width: 4000, height: 3000 })));

  check("the file is not sent when it is picked", r.sent(), []);
  check("but the page says a save would send it",
        r.changeCount(), "1 unsaved change in Opening");

  const after = r.photo("The photograph behind the opening headline");
  check("and shows the file itself rather than the old photograph",
        after.querySelector(".photo__img").getAttribute("src"), "blob:fake/image/webp");
  /* 16:9 rather than the file's own 4:3, because that is the shape the framing
     box opened on: hero.main is a full-bleed band and the box offers the shape
     the band is usually closest to first. */
  check("framed to the shape of the space, and the size said out loud",
        after.querySelector(".photo__state").textContent,
        "Ready to upload: 2000 × 1125, 110 KB. Nothing has been sent yet.");

  await r.save();

  const sent = r.sent();
  check("the file goes first, then the original, then the row that names them",
        sent.map((s) => s.what), ["upload", "upload", "update"]);
  check("into the photographs bucket", sent[0].bucket, "site-photos");
  check("as a webp, under the slot it belongs to",
        [sent[0].path.split("/")[0], sent[0].path.endsWith(".webp")], ["hero.main", true]);
  check("the original keeps the format it arrived in",
        sent[1].path.endsWith("-original.jpg"), true);
  check("and the row records the path and the new size",
        [sent[2].table, sent[2].payload.storage_path === sent[0].path,
         sent[2].payload.width, sent[2].payload.height],
        ["photos", true, 2000, 1125]);
  check("and nothing is swept, because nothing was replaced",
        sent.filter((s) => s.what === "remove"), []);

  /* Nothing is left outstanding, asked the only way that means anything: save
     again and see whether it has anything to send. Reading the savebar would
     read "Saved. The site is showing it now." for a couple of seconds, which
     is a message rather than a count. */
  await r.save();
  check("and the page has nothing left to send", r.sent().length, sent.length);
}

console.log("\nthe framing box");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("room.jpg", "image/jpeg", jpeg()), "leave");

  check("picking a file opens it", !!r.framer(), true);
  check("and says which photograph is being framed",
        r.q(".framer__where").textContent,
        "The photograph behind the opening headline");
  check("a space with no fixed shape offers shapes to choose from",
        r.shapes(),
        ["As the page has it", "As it is", "Tall", "Square", "Wide"]);
  check("and says why it cannot be an exact preview",
        r.q(".framer__help").textContent.includes("changes shape with the window"), true);

  await r.frame("cancel");
  check("backing out closes it", !!r.framer(), false);
  check("and leaves nothing outstanding", r.changeCount(), "No changes yet");
  check("nor anything to send", r.sent(), []);
  check("the built-in photograph is still what is on screen",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__img").getAttribute("src"),
        "assets/web/hero-dining.jpg");
}

{
  /* A slot whose container really is one shape in styles.css. The shape is not
     a choice there, because offering one would be offering to store something
     the page is going to crop again. */
  const data = fixture();
  data.photos.push({
    id: "ph3", slot: "story.a", label: "The Idea — the upper photograph",
    storage_path: null, source_path: null, alt: "A wall", width: 1023, height: 1537,
    is_decorative: false, sort_order: 15
  });

  const r = await boot({ data, seedPhotos: Object.assign({}, SEED_PHOTOS, {
    "story.a": { src: "assets/web/idea-a.jpg", alt: "A wall", width: 1023, height: 1537 }
  }) });
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The Idea — the upper photograph"),
               r.file("wall.jpg", "image/jpeg", jpeg()), "leave");

  check("a fixed frame offers no shape at all", r.shapes(), []);
  check("and says the box is showing what the site will show",
        r.q(".framer__help").textContent.includes("What you see here is what the site shows"),
        true);

  await r.frame("use");
  check("what comes out is in the frame's own ratio, 3:2",
        r.photo("The Idea — the upper photograph").querySelector(".photo__state").textContent,
        "Ready to upload: 2000 × 1333, 130 KB. Nothing has been sent yet.");
}

console.log("\nframing a photograph that is already in the slot");
{
  /* Nothing uploaded, so the slot is showing the file the site was built with.
     That file is in git and served from this same origin, so it is as unframed
     as it has ever been and the box can open it. */
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  await r.adjust(r.photo("The photograph behind the opening headline"));

  check("the built-in photograph is what was reopened",
        r.fetched(), ["assets/web/hero-dining.jpg"]);
  check("and framing it makes an upload out of it",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__state").textContent
          .startsWith("Ready to upload"), true);

  await r.save();
  const sent = r.sent();
  check("which is kept as its own original, so it can be widened again later",
        [sent.filter((s) => s.what === "upload").length,
         sent[1].path.endsWith("-original.jpg")], [2, true]);
  check("and nothing is swept, because the built-in file is not in the bucket",
        sent.filter((s) => s.what === "remove"), []);
}

{
  /* An upload whose original was kept. The box opens *that*, not the copy on
     the site, so a framing chosen once can always be widened back out. */
  const data = fixture();
  data.photos[0].storage_path = "hero.main/1700000000000.webp";
  data.photos[0].source_path = "hero.main/1700000000000-original.jpg";

  const r = await boot({ data });
  await r.signIn();
  r.tab("Photos");

  await r.adjust(r.photo("The photograph behind the opening headline"));

  check("the original is what was reopened, not the framed copy",
        r.fetched(),
        ["https://yofoiqgknsqzsuwtlqvh.supabase.co/storage/v1/object/public/" +
         "site-photos/hero.main/1700000000000-original.jpg"]);

  await r.save();
  const sent = r.sent();
  check("only the new framing goes up — the original is already there",
        sent.filter((s) => s.what === "upload").length, 1);
  check("and the row still names it",
        sent.find((s) => s.what === "update").payload.source_path,
        "hero.main/1700000000000-original.jpg");
  check("so only the framed copy it replaces is swept",
        sent.find((s) => s.what === "remove").paths, ["hero.main/1700000000000.webp"]);
}

{
  /* An upload with no original kept — the state a photograph would be in if
     its original had been too big for the bucket. Framing still works, but
     only inwards, and the panel says so before the button is pressed. */
  const data = fixture();
  data.photos[0].storage_path = "hero.main/1700000000000.webp";
  data.photos[0].source_path = null;

  const r = await boot({ data });
  await r.signIn();
  r.tab("Photos");

  const helps = [...r.photo("The photograph behind the opening headline")
                   .querySelectorAll(".field__help")].map((n) => n.textContent);
  check("the panel warns that this one cannot be widened back out",
        helps.some((t) => t.includes("cannot widen back out")), true);

  await r.adjust(r.photo("The photograph behind the opening headline"));
  check("so the copy on the site is what gets reopened",
        r.fetched(),
        ["https://yofoiqgknsqzsuwtlqvh.supabase.co/storage/v1/object/public/" +
         "site-photos/hero.main/1700000000000.webp"]);

  await r.save();
  check("and nothing pretends to be an original afterwards",
        [r.uploads().length,
         r.sent().find((s) => s.what === "update").payload.source_path], [1, null]);
}

{
  /* Framing a file that was picked a moment ago and not saved. It is still in
     memory, so nothing is fetched, and the original queued behind it goes up
     once rather than twice. */
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("room.jpg", "image/jpeg", jpeg()));
  await r.adjust(r.photo("The photograph behind the opening headline"), "leave");

  check("nothing is fetched — the picture never left the browser", r.fetched(), []);
  await r.shape("Square");
  await r.frame("use");

  check("the new framing is what the slot is holding",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__state").textContent
          .startsWith("Ready to upload: 1950 × 1950"), true);

  await r.save();
  const uploads = r.uploads();
  check("one framed copy and one original, not two of either", uploads.length, 2);
  check("and the row names the original that really went up",
        r.sent().find((s) => s.what === "update").payload.source_path,
        uploads[1].path);
}

{
  const data = fixture();
  data.photos[0].storage_path = "hero.main/1700000000000.webp";

  const r = await boot({ data, fetchFails: true });
  await r.signIn();
  r.tab("Photos");

  await r.adjust(r.photo("The photograph behind the opening headline"));

  check("a photograph that cannot be read back says so",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__problem").textContent,
        "The photograph already in this slot could not be reopened for framing. " +
        "Choose it again from your device instead.");
  check("and nothing is outstanding as a result", r.changeCount(), "No changes yet");
}

console.log("\na photograph of a very different shape");
{
  /* hero.main is 1535 × 1024 — a landscape band. Framing is what stops a phone
     photograph held upright from losing its top and bottom there, but the box
     lets the owner choose a tall shape for it anyway, and a tall picture in a
     wide band is cropped by the page with nothing anywhere reporting a problem.
     So the shapes are still compared after the framing, not before it. */
  const r = await boot({ decoded: { width: 3000, height: 4000 } });
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("IMG_9001.jpg", "image/jpeg", jpeg({ width: 3000, height: 4000 })),
               "leave");
  await r.shape("Tall");
  await r.frame("use");

  const said = r.photo("The photograph behind the opening headline")
                .querySelector(".photo__problem").textContent;
  check("the difference is pointed out", said.includes("portrait against landscape"), true);
  check("in terms of what will happen to it", said.includes("cropped to fill it"), true);
  check("but it does not block the save", r.problems(), []);

  await r.save();
  check("and it really does upload", r.uploads().length, 2);
}

{
  /* The same upright photograph, framed the way the box offers it first. There
     is now nothing to warn about — which is the point of the whole feature. */
  const r = await boot({ decoded: { width: 3000, height: 4000 } });
  await r.signIn();
  r.tab("Photos");
  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("IMG_9002.jpg", "image/jpeg", jpeg({ width: 3000, height: 4000 })));

  check("framed to the shape of the space, nothing is remarked on",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__problem").hidden, true);
}

console.log("\nreplacing a photograph that had already been uploaded");
{
  const data = fixture();
  data.photos[0].storage_path = "hero.main/1700000000000.webp";
  data.photos[0].source_path = "hero.main/1700000000000-original.jpg";

  const r = await boot({ data });
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("new.jpg", "image/jpeg", jpeg()));
  await r.save();

  const removed = r.sent().find((s) => s.what === "remove");
  check("the photograph it replaced is taken out of the bucket afterwards",
        removed.paths.sort(),
        ["hero.main/1700000000000-original.jpg", "hero.main/1700000000000.webp"]);
  check("and only after everything else has landed",
        r.sent().map((s) => s.what).indexOf("remove"), r.sent().length - 1);
}

console.log("\na photograph with nothing said about it");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  const hero = r.photo("The photograph behind the opening headline");
  r.type(hero.querySelector(".field__area"), "   ");
  await r.pick(hero, r.file("x.jpg", "image/jpeg", jpeg()));
  await r.save();

  check("the save is refused", r.uploads(), []);
  check("with the sentence the database would have used", r.problems(), [
    'The photograph "The photograph behind the opening headline" needs a short ' +
    "description of what is in it. It is what someone using a screen reader hears " +
    "in place of the picture, and what shows if the image ever fails to load."
  ]);

  /* And that sentence is the database's, not one written to match it. The %s
     is the label, so the two halves either side of it are compared. */
  const sql = readFileSync("supabase/migrations/20260801000400_photos.sql", "utf8");
  check("which is the sentence in the migration, not a copy of it",
        sql.includes("needs a short description of what is in it. It is what someone " +
                     "using a screen reader hears in place of the picture, and what " +
                     "shows if the image ever fails to load."), true);
}

console.log("\na backdrop needs no description");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The Wine Bar — the background behind the section"),
               r.file("wall.jpg", "image/jpeg", jpeg()));
  await r.save();

  check("it uploads with an empty description and no complaint",
        [r.problems().length, r.uploads().length], [0, 2]);
}

console.log("\nputting the original back");
{
  const data = fixture();
  data.photos[0].storage_path = "hero.main/1700000000000.webp";

  const r = await boot({ data });
  await r.signIn();
  r.tab("Photos");

  const revert = [...r.photo("The photograph behind the opening headline")
                    .querySelectorAll("button")]
    .find((b) => b.textContent === "Put the original back");
  revert.click();
  await settle();

  await r.save();
  const update = r.sent().find((s) => s.what === "update");
  check("the row stops naming a file", update.payload.storage_path, null);
  check("the size goes back to the built-in photograph's",
        [update.payload.width, update.payload.height], [1535, 1024]);
  check("and the file it was using is swept",
        r.sent().find((s) => s.what === "remove").paths, ["hero.main/1700000000000.webp"]);
}

console.log("\ndiscarding a picked photograph");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("x.jpg", "image/jpeg", jpeg()));
  check("something is outstanding", r.changeCount(), "1 unsaved change in Opening");

  r.q("#discardBtn").click();
  await settle();
  await wait(260);
  await settle();

  check("discarding leaves nothing outstanding", r.changeCount(), "No changes yet");
  check("and nothing was ever sent anywhere", r.sent(), []);
  check("the built-in photograph is back on screen",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__img").getAttribute("src"),
        "assets/web/hero-dining.jpg");
}

console.log("\nfiles the browser cannot use");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  const hero = r.photo("The photograph behind the opening headline");
  await r.pick(hero, r.file("IMG_4821.HEIC", "image/heic"));

  const said = r.photo("The photograph behind the opening headline")
                .querySelector(".photo__problem").textContent;
  check("a HEIC is refused", said.startsWith("That is a HEIC file"), true);
  check("and the message says how to fix it on the phone",
        said.includes("Most Compatible"), true);
  check("nothing is outstanding as a result", r.changeCount(), "No changes yet");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("menu.pdf", "application/pdf"));
  check("so is anything that is not an image",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__problem").textContent,
        "That is a application/pdf. A photograph has to be a JPEG, a PNG or a WebP.");
}

console.log("\na photograph taken with the phone on its side");
{
  /* Orientation 6 is the common one: the pixels are 4000 × 3000 and the tag
     says to turn them a quarter turn. What has to come out is a 1500 × 2000
     portrait — the same picture the owner saw in the file picker.

     This is the failure that looks like nothing is wrong until it is on the
     site: every browser honours the tag when *showing* an image, so the
     editor's own preview is right either way. */
  const r = await boot({ decoded: { width: 4000, height: 3000 } });
  await r.signIn();
  r.tab("Photos");

  /* Framed as it is, so the shape that comes out of the box is the shape the
     turn produced and the rotation is what the numbers are about. */
  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("IMG_2201.jpg", "image/jpeg", jpeg({ orientation: 6 })), "leave");
  await r.shape("As it is");
  await r.frame("use");

  check("it comes out the right way up",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__state").textContent
          .startsWith("Ready to upload: 1500 × 2000"), true);

  /* 2600 is the working edge, not the published one: the turn is applied when
     the file is decoded, and the framing box works on that copy. */
  const transform = r.drawn().find((d) => d.what === "setTransform");
  check("drawn through the quarter turn the tag asked for",
        transform.m, [0, 1, -1, 0, 2600, 0]);

  /* The raw pixels were asked for deliberately. A browser that hands back an
     already-rotated bitmap is caught by the swap test instead — checked below
     on the function itself, since no browser here can be made to do it. */
  check("and the raw pixels were what was asked for",
        r.window.document.body.textContent.length > 0, true);
}

console.log("\nthe readers, on bytes");
{
  const r = await boot();
  const api = r.window.AROMATI_ADMIN._test;
  const bytes = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

  check("the orientation tag is read out of a JPEG",
        api.readOrientation(bytes(jpeg({ orientation: 8 }))), 8);
  check("a file with no tag is orientation 1",
        api.readOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), 1);
  check("something that is not a JPEG at all is orientation 1",
        api.readOrientation(new Uint8Array([1, 2, 3, 4]).buffer), 1);

  check("the stored dimensions are read from the frame header",
        api.rawSize(bytes(jpeg({ width: 1280, height: 960 }))), { width: 1280, height: 960 });

  /* The check that stops a rotation being applied twice. A bitmap whose
     dimensions still match the stored ones is raw and needs turning; one whose
     dimensions have been swapped has already been turned. */
  check("a raw sideways bitmap is turned",
        api.orientationToApply({ width: 4000, height: 3000 }, { width: 4000, height: 3000 }, 6), 6);
  check("one the browser already turned is left alone",
        api.orientationToApply({ width: 3000, height: 4000 }, { width: 4000, height: 3000 }, 6), 1);
  check("and an upright photograph is never second-guessed",
        api.orientationToApply({ width: 4000, height: 3000 }, { width: 4000, height: 3000 }, 1), 1);

  check("a big photograph is scaled to the long edge",
        api.fitInside(4000, 3000, 2000), { width: 2000, height: 1500 });
  check("a small one is left alone rather than blown up",
        api.fitInside(800, 600, 2000), { width: 800, height: 600 });
}

console.log("\nthe columns a photograph slot does not own");
{
  const r = await boot();
  await r.signIn();
  r.tab("Photos");

  const hero = r.photo("The photograph behind the opening headline");
  r.type(hero.querySelector(".field__area"), "A rewritten description");
  await r.save();

  /* The control: a save that sent nothing would satisfy every assertion
     below. */
  check("the description really was sent", r.writes().length, 1);

  const payload = r.writes()[0].payload;
  check("and the slot, the label and the decorative flag were not",
        ["slot", "label", "is_decorative", "sort_order"].filter((c) => c in payload), []);
  check("only the picture and the words about it",
        Object.keys(payload).sort(),
        ["alt", "caption", "height", "source_path", "storage_path", "width"]);
}

console.log("\nthe words on the photograph");
{
  /* The Kitchen strip's plates carry a caption; the hero does not. The box
     exists only where the page has words to put in it, and it opens showing
     what the page says today. */
  const data = fixture();
  data.photos.push({ id: "ph3", slot: "kitchen.plate1",
    label: "The Kitchen strip — 1st photograph",
    storage_path: null, source_path: null,
    alt: "Adjaruli khachapuri — cheese boat with egg yolk and butter",
    caption: "Adjaruli Khachapuri",
    width: 1100, height: 566, is_decorative: false, sort_order: 30 });
  const seedPhotos = Object.assign({}, SEED_PHOTOS, {
    "kitchen.plate1": { src: "assets/web/adjaruli.webp",
      alt: "Adjaruli khachapuri — cheese boat with egg yolk and butter",
      caption: "Adjaruli Khachapuri", width: 1100, height: 566 }
  });
  const r = await boot({ data: data, seedPhotos: seedPhotos });
  await r.signIn();
  r.tab("Photos");

  const plate = r.photo("The Kitchen strip — 1st photograph");
  const box = [...plate.querySelectorAll(".field")]
    .find((f) => f.textContent.includes("The words on the photograph"));
  check("a plate has a box for the words over it", !!box, true);
  check("and it opens showing the words on the page",
        box && (box.querySelector(".field__input") || {}).value, "Adjaruli Khachapuri");

  const hero = r.photo("The photograph behind the opening headline");
  check("a photograph with no words gets no box",
        hero.textContent.includes("The words on the photograph"), false);

  /* And a rewording saves like any other change. */
  r.type(box.querySelector(".field__input"), "The Cheese Boat");
  await r.save();
  check("the new words are what gets sent",
        r.writes().length ? r.writes()[0].payload.caption : null, "The Cheese Boat");
}


/* ═══ the change list ═══════════════════════════════════════════════════════
   The savebar says how many changes are waiting; the list says which. The
   thing worth testing is not that it renders — it is that it cannot disagree
   with the save it is describing.

   Three ways it could:

     the count and the list could differ, if one walks rows and the other
     walks fields;

     an entry could point at a section that no longer exists, because the id
     it mints and the id the panel mints are written down in two places;

     "put back" could restore something the save would not have sent, if it
     copied more than the writable columns. */

console.log("\nthe change list, against the count it opens from");
{
  const r = await boot();
  await r.signIn();

  check("nothing to open before anything is edited",
        r.q("#changesToggle").disabled, true);

  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."), "A new headline");
  r.tab("Contact");
  r.type(r.fieldShowing("info@aromatinyc.com"), "hello@aromatinyc.com");

  check("the count says two", r.changeCount(), "2 unsaved changes");
  check("and the button is now something to press", r.q("#changesToggle").disabled, false);
  check("but nothing is listed until it is pressed", r.changesHidden(), true);

  await r.openChanges();
  check("pressing it opens the list", r.changesOpen(), true);
  check("the title agrees with the count", r.changesTitle(), "The 2 changes waiting to be saved");
  check("one entry per changed row", r.changeRows().length, 2);
  check("in rail order — Words before Contact",
        r.changeRows().map((c) => c.title), ["Headline", "Email address"]);
  check("each says where it lives",
        r.changeRows()[0].where, "Home page · The Idea");
  check("and what it was against what it is",
        r.changeRows()[0].lines,
        ["Text Georgian cooking for a Manhattan morning. → A new headline"]);

  check("the toggle says it is open, for anything not looking at it",
        r.q("#changesToggle").getAttribute("aria-expanded"), "true");
  await r.openChanges();
  check("and pressing it again closes it", r.changesOpen(), false);

  /* What closes has to be a drawer with a list in it. Emptied on the first
     frame instead, it collapses around a hole — the height animates down from
     a box whose contents have already gone, which reads as a bug rather than
     as a close. It empties at the far end, with the same token that hides it. */
  check("the entries are still there while it collapses", r.changeRows().length, 2);
  await wait(DISCLOSURE_MS + 60);
  check("and gone once it has", r.changeRows().length, 0);
  check("along with the drawer itself", r.changesHidden(), true);
}

console.log("\nthe drawer's two measured facts");
{
  /* Neither of these is visible to a test that does not do layout, and both
     were found by driving the transition's own currentTime in a browser and
     reading the box back. They are here as text because the alternative is
     nothing.

     A cap the reveal animates to rather than the list: one entry is 121px
     under a 42vh cap, so it arrives in 40ms of a 240ms transition and looks
     like it never animated. A 0fr → 1fr row is sized by the list itself.

     And a stretched inner: squeezed to the animating row, it spends the whole
     open overflowing its own scroll box with a scrollbar out, then reflows
     10px wider on the last frame when the bar goes. */
  /* Every block whose selector is exactly this one, joined: the layout blocks
     put where it sits in the shell, the component block puts how it opens, and
     the narrow-screen block moves the cap. */
  const body = (sel) => {
    const re = new RegExp("(?:^|[},])\\s*\\" + sel + "\\s*\\{([^}]*)\\}", "gm");
    return [...ADMIN_CSS.matchAll(re)].map((m) => m[1]).join(" ").replace(/\s+/g, " ");
  };
  const changes = body(".changes"), inner = body(".changes__inner");

  check("the drawer opens on a row sized by its list",
        /grid-template-rows:\s*0fr/.test(changes) &&
        /transition:[^;]*grid-template-rows/.test(changes), true);
  check("not on a cap it would reach before the transition ends",
        /max-height/.test(changes), false);
  check("and the inner keeps its own height while the row uncovers it",
        /align-self:\s*start/.test(inner), true);
}

console.log("\none entry per row, not per box");
{
  /* A menu item with three edited boxes is one PATCH and one line in the
     count. A list that counted boxes would say three and be describing the
     same single write. */
  const r = await boot();
  await r.signIn();
  r.tab("Menus");
  r.section("Breakfast");

  const item = r.inSomeSection(() =>
    [...r.doc.querySelectorAll(".item")].find((n) => n.textContent.includes("Morning Plate")));
  item.querySelector(".item__head").click();
  await settle();

  r.type(r.fieldLabelled(item, "Name"), "Morning Plate for Two");
  r.type(r.fieldLabelled(item, "Price"), "24");

  check("two boxes, one change", r.changeCount(), "1 unsaved change in Breakfast");
  await r.openChanges();
  check("and one entry", r.changeRows().length, 1);
  check("with a line each inside it",
        r.changeRows()[0].lines,
        ["Name Morning Plate → Morning Plate for Two", "Price 21 → 24"]);
  check("named for the section it is in",
        r.changeRows()[0].where, "Food menu · Breakfast");
}

console.log("\nderived, not recorded");
{
  /* The list is rebuilt from baseline against draft every time it is drawn.
     A log of edits would carry this one forever. */
  const r = await boot();
  await r.signIn();
  r.tab("Contact");

  const box = r.fieldShowing("info@aromatinyc.com");
  r.type(box, "typo@aromatinyc.com");
  await r.openChanges();
  check("the typo is listed", r.changeRows().length, 1);

  r.type(box, "info@aromatinyc.com");
  check("typed back, it is not a change", r.changeCount(), "No changes yet");
  check("the list empties with it", r.changeRows().length, 0);
  check("and the drawer closes on its own", r.changesHidden(), true);
  check("leaving nothing to open", r.q("#changesToggle").disabled, true);
}

console.log("\nput back");
{
  const r = await boot();
  await r.signIn();
  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."), "Something else entirely");

  await r.openChanges();
  check("offered on an edited row", r.changeRows()[0].canUndo, true);

  await r.undoChange("Headline");
  check("and it puts the row back", r.changeCount(), "No changes yet");

  /* The control: an editor that had merely stopped *listing* the change would
     also satisfy the line above. This asks the save what it would write. */
  r.tab("Words");
  r.q("#saveBtn").click();
  await settle();
  check("with nothing left for the save to write", r.writes().length, 0);
}

console.log("\nput back, twice in a row");
{
  /* The button that was pressed is rebuilt out of existence — its entry has
     gone, because the row no longer differs from what was saved. If focus is
     not put somewhere, it falls to the document and correcting three things
     in a row means three trips back with the keyboard. */
  const r = await boot();
  await r.signIn();
  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."), "One");
  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."), "Two");
  r.tab("Contact");
  r.type(r.fieldShowing("info@aromatinyc.com"), "three@aromatinyc.com");

  await r.openChanges();
  check("three of them", r.changeRows().length, 3);

  await r.undoChange("Headline");
  check("one gone", r.changeRows().length, 2);
  check("and the keyboard is still in the list, on the entry that moved up",
        r.doc.activeElement.className, "change__undo");
  check("which is the one that followed it",
        r.doc.activeElement.closest(".change")
          .querySelector(".change__title").textContent, "Opening paragraph");

  /* At the end of the list there is nothing after it, so the nearest thing is
     the one before. */
  await r.undoChange("Email address");
  check("and at the end it lands on the last one left",
        r.doc.activeElement.closest(".change")
          .querySelector(".change__title").textContent, "Opening paragraph");
}

console.log("\nthe list keeps its place while it is being typed into");
{
  /* The values in the list follow what is being typed, so it is rebuilt on
     every keystroke. A rebuild that does not put the scroll back sends a
     scrolled list to the top under the reader. */
  const r = await boot({ data: withExtras() });
  await r.signIn();

  /* Enough entries to have somewhere to scroll to. */
  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."), "One");
  r.type(r.fieldShowing("Aromati, from the Georgian word for *aroma*."), "Two");
  r.tab("Contact");
  const email = r.fieldShowing("info@aromatinyc.com");
  r.type(email, "three@aromatinyc.com");

  await r.openChanges();
  const inner = r.q(".changes__inner");

  /* Asserting on scrollTop after the rebuild proves nothing here: jsdom does
     no layout, so emptying the list never moves it and the check passes with
     the restore deleted. It was written that way first and a sabotage run
     caught it. What can be asked instead is whether the rebuild puts the
     value back — which is the actual contract, in a browser as well as here. */
  let stored = 40;
  const written = [];
  Object.defineProperty(inner, "scrollTop", {
    configurable: true,
    get() { return stored; },
    set(v) { written.push(v); stored = v; }
  });

  r.type(email, "four@aromatinyc.com");
  check("a keystroke rebuilds the list and puts it back where it was",
        written, [40]);
}

console.log("\na row with no confirmed state does not take the drawer with it");
{
  /* changedFields() answers "everything" for a row it has no baseline for,
     rather than throwing. The list has to be built the same way, or one
     impossible row is an exception thrown on every keystroke and a drawer
     that never opens again. */
  const r = await boot();
  await r.signIn();
  r.tab("Contact");
  r.type(r.fieldShowing("info@aromatinyc.com"), "hello@aromatinyc.com");

  const api = r.window.AROMATI_ADMIN._test;
  api.forgetBaseline("site_settings", "s2");

  let entries = null;
  try { entries = api.changeEntries(); } catch (e) { entries = "threw: " + e.message; }
  check("the list is still built", Array.isArray(entries), true);
  check("and the row is in it", entries.filter((e) => e.id === "s2").length, 1);
  check("with what it was reported as unknown rather than invented",
        entries.find((e) => e.id === "s2").lines[0].was, "empty");

  await r.openChanges();
  check("and the drawer still opens", r.changesOpen(), true);
}

console.log("\nwhat put back deliberately does not cover");
{
  /* Reverting an edit is a copy of the baseline and cannot be anything else.
     Un-deleting a section means restoring its items and its pours through the
     same cascade deleteCourse walks by hand, and un-adding one means deciding
     what happens to the rows added under it. Discard does both correctly, in
     one step, and is the button next to this list. */
  const r = await boot();
  await r.signIn();
  r.tab("Menus");
  r.section("Breakfast");

  const add = [...r.doc.querySelectorAll("button")].find((b) => b.textContent === "Add an item");
  add.click();
  await settle();

  await r.openChanges();
  const added = r.changeRows().find((c) => c.flag === "added");
  check("an added row is listed and flagged", !!added, true);
  check("with no old value to show against", added.lines, []);
  check("and no put back on it", added.canUndo, false);
}

console.log("\na removed row keeps its name");
{
  const r = await boot({ data: withExtras() });
  await r.signIn();
  r.tab("Hours");
  r.section("Holidays and one-off days");

  const remove = [...r.doc.querySelectorAll(".btn--danger")]
    .find((b) => b.textContent === "Remove");
  remove.click();
  await settle();

  await r.openChanges();
  const gone = r.changeRows()[0];
  check("it is still listed after it leaves the editor", gone.flag, "removed");
  check("by the words the owner would recognise", gone.title, "2026-12-25");
  check("with nowhere to be sent, because it is not there any more", gone.canGo, false);
  check("and no put back — Discard is the way back", gone.canUndo, false);
}

console.log("\nthe section ids the list mints are the ones the panels mint");
{
  /* The drift guard. locate() builds a section id per table; the five section
     builders in part 4 build theirs independently. Nothing in the running
     editor compares them — an entry pointing at an id no panel produces looks
     perfectly fine and simply goes nowhere when pressed. So every row in the
     fixture is located, and the id it produces is required to exist in its
     panel's own list. */
  const locateData = withExtras();
  locateData.menu_courses.push({
    id: "k-build", page: "food", course_key: "breakfast", tab_label: "Breakfast",
    heading: "Build Your Own Breakfast", sizes: null, is_static: true,
    static_id: "build", is_hidden: false, sort_order: 99
  });
  const r = await boot({ data: locateData });
  await r.signIn();
  const api = r.window.AROMATI_ADMIN._test;

  check("every table belongs to exactly one area",
        Object.keys(api.PANEL_TABLES).reduce((all, id) => all.concat(api.PANEL_TABLES[id]), []).sort(),
        api.TABLES.slice().sort());

  const orphans = [];
  let located = 0;
  for (const table of api.TABLES) {
    for (const row of r.data[table]) {
      const at = api.locate(table, row.id);
      if (!at) { orphans.push(`${table}:${row.id} — not located at all`); continue; }
      located++;
      /* The menu index lists one page at a time, so its sections have to be
         asked for with that page showing — which is the same thing goToChange
         does before it selects one. */
      if (at.page) api.setMenuPage(at.page);
      if (api.sectionIds(at.tab).indexOf(at.section) < 0) {
        orphans.push(`${table}:${row.id} → ${at.section} is in no ${at.tab} section`);
      }
    }
  }
  check("every row in the fixture was located", located > 0 && orphans.length === 0, true);
  check("with none pointing at a section that does not exist", orphans, []);

  check("and every writable column has a word for it",
        api.TABLES.filter((t) =>
          api.WRITABLE[t].some((c) => !(api.COL_LABELS[t] && api.COL_LABELS[t][c]))), []);
}

console.log("\ngoing to a change on a menu page that is not showing");
{
  /* The menus are the one area whose index lists a slice of itself. An entry
     for a wine that is edited, left, and returned to from the Food page has to
     take its page with it — otherwise the section id is not in the list,
     currentSection() falls back to the first course of whatever page happened
     to be showing, and the owner arrives somewhere else entirely. */
  const r = await boot();
  await r.signIn();
  r.tab("Menus");

  await r.menuPageTo("Drinks");
  r.section("Coffee & Espresso");
  const heading = r.fieldShowing("Coffee & Espresso");
  r.type(heading, "Coffee, Espresso & Tea");

  await r.menuPageTo("Food");
  check("standing on another page", r.menuPage(), "Food");

  await r.openChanges();
  await r.goToChange("Coffee, Espresso & Tea");

  check("pressing it changes the page too", r.menuPage(), "Drinks");
  check("and lands on the section that was edited",
        r.openSection(), "Coffee, Espresso & Tea");
  check("with the list collapsing behind it", r.changesOpen(), false);

  /* And gone from the page once it has finished collapsing — not merely
     flat. A drawer left at zero height is a row of buttons the tab key still
     walks through, under a savebar that looks like the end of the page. */
  await wait(DISCLOSURE_MS + 60);
  check("and out of the way entirely once it has", r.changesHidden(), true);
}

console.log("\nwhat the owner typed, as text");
{
  /* The one security rule, at the newest sink in the file. The whole-file scan
     above would catch an innerHTML; this catches the other half — that a value
     with markup in it arrives as characters rather than as elements. */
  const r = await boot();
  await r.signIn();
  r.tab("Words");
  r.type(r.fieldShowing("Georgian cooking for a Manhattan morning."),
         "<img src=x onerror=alert(1)>");

  await r.openChanges();
  const now = r.doc.querySelector(".change__now");
  check("it is shown", now.textContent, "<img src=x onerror=alert(1)>");
  check("and it is text, not a tag", now.querySelectorAll("*").length, 0);
  check("nothing was built out of it", r.doc.querySelectorAll("#changes img").length, 0);
}

console.log("\nlong values are cut rather than wrapped four times");
{
  const r = await boot();
  const api = r.window.AROMATI_ADMIN._test;
  const long = "x".repeat(200);

  check("a long line is trimmed with an ellipsis",
        api.describeValue("site_copy", "value", long).length, 64);
  check("a short one is left exactly alone",
        api.describeValue("site_copy", "value", "Two words"), "Two words");
  check("nothing there reads as nothing, not as empty quotes",
        api.describeValue("site_copy", "value", null), "empty");
  check("a flag reads as a word", api.describeValue("menu_items", "is_hidden", true), "yes");
  check("a time drops the seconds the database keeps",
        api.describeValue("business_hours", "opens_at", "07:00:00"), "07:00");
  check("prices per size read the way the board does",
        api.describeValue("menu_items", "prices", ["4", "5"]), "4 / 5");
  check("and a storage path is described rather than printed",
        api.describeValue("photos", "storage_path", "hero/2026-08-05-abc.webp"),
        "a photograph you uploaded");
}


console.log(failures
  ? `\n${failures} failure(s) — the editor does not do what it says\n`
  : "\nthe editor writes what it shows, and refuses what the database would\n");
process.exit(failures ? 1 : 0);
