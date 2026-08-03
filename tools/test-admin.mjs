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
const MIGRATION = readFileSync("supabase/migrations/20260801000000_init_cms.sql", "utf8");


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
        heading: "Breakfast", sizes: null, is_static: false, static_id: null, sort_order: 1 },
      { id: "k2", page: "drinks", course_key: "coffee", tab_label: "Coffee",
        heading: "Coffee & Espresso", sizes: ["Small", "Large"], is_static: false,
        static_id: null, sort_order: 1 }
    ],
    menu_items: [
      { id: "i1", course_id: "k1", name: "Morning Plate", tag: null,
        description: "Mixed greens.", price: "21", prices: null, price_all_sizes: null,
        no_price: false, options_dom_id: null, sort_order: 1 },
      { id: "i2", course_id: "k2", name: "Drip Coffee", tag: null, description: null,
        price: null, prices: ["4", "5"], price_all_sizes: null, no_price: false,
        options_dom_id: null, sort_order: 1 }
    ],
    menu_item_pours: [
      { id: "p1", item_id: "i1", label: "Bottle", price: "60", sort_order: 1 }
    ],
    faq_entries: [],
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
  window.confirm = () => opts.confirm !== false;    // jsdom has none; the editor asks before deleting
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

    /* Fields are found by the value they are showing, which is how the person
       editing finds them too. The search box is excluded: it lives in the menu
       panel, it is empty to start with, and typing a heading into it instead of
       into the heading box is a mistake that looks exactly like a pass. */
    fieldShowing(value) {
      const node = all("#panels .field__input, #panels .field__area")
        .find((n) => n.value === value);
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

    lastCard() { return all(".card").slice(-1)[0]; },

    type(node, value) {
      node.value = value;
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    },

    async save() { q("#saveBtn").click(); await settle(); },

    problems() { return [...doc.querySelectorAll(".problems__link")].map((n) => n.textContent); },
    changeCount() { return q("#saveCount").textContent; },
    writes() { return log.filter((l) => ["insert", "update", "delete"].includes(l.what)); },

    /* Everything that left the page, in the order it left, which is the only
       way to ask whether the file went before the row that names it. */
    sent() { return log.filter((l) => ["upload", "remove", "insert", "update", "delete"].includes(l.what)); },
    uploads() { return log.filter((l) => l.what === "upload"); },
    drawn() { return drawn; },

    /* The block for one slot, found by the label the owner reads. */
    photo(label) {
      const node = all(".photo").find((p) => {
        const own = p.querySelector(".photo__label");
        return own && own.textContent.trim() === label;
      });
      if (!node) throw new Error(`no photograph block labelled ${JSON.stringify(label)}`);
      return node;
    },

    /* Choosing a file, as far as the page can tell. `files` is read-only and
       jsdom has no file picker, so it is defined onto the element and the same
       change event is dispatched. */
    async pick(block, file) {
      const input = block.querySelector(".photo__file");
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
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
  const withLabel = /The field "%" cannot be left empty — it appears on every page\./.test(MIGRATION);
  const inJs = ADMIN_JS.includes('cannot be left empty — it appears on every page.');
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


/* ═══ 4. editing, and what a save actually sends ════════════════════════════ */

console.log("\nediting a paragraph");
{
  const r = await boot();
  await r.signIn();

  const field = r.fieldShowing("Aromati, from the Georgian word for *aroma*.");
  r.type(field, "Aromati, from the Georgian word for *aroma*, in Murray Hill.");

  check("one change is counted", r.changeCount(), "1 change not yet saved");
  check("and nothing has been sent yet", r.writes(), []);

  r.type(field, "Aromati, from the Georgian word for *aroma*.");
  check("undoing a field starts its exit", field.parentElement.classList.contains("field--edited-leaving"), true);
  check("undoing a tab change starts its exit", r.q(".tab__dot").classList.contains("tab__dot--leaving"), true);
  check("undoing the last change starts the savebar exit",
        r.q("#savebar").classList.contains("savebar--leaving"), true);
  await wait(260);
  await settle();
  check("the field marker finishes leaving", field.parentElement.classList.contains("field--edited"), false);
  check("the savebar finishes leaving", r.q("#savebar").hidden, true);

  r.type(field, "Aromati, from the Georgian word for *aroma*, in Murray Hill.");

  await r.save();
  const writes = r.writes();
  check("saving sends exactly one update", writes.length, 1);
  check("to the right row", [writes[0].table, writes[0].id], ["site_copy", "c2"]);
  check("carrying only the value — never the label, help or key",
        Object.keys(writes[0].payload), ["value"]);
  check("with what was typed", writes[0].payload.value,
        "Aromati, from the Georgian word for *aroma*, in Murray Hill.");
  check("and the savebar goes quiet", r.q("#savebar").hidden, false);   // it flashes "Saved."
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
    "The phone number needs exactly 10 digits and nothing else — no spaces, brackets or dashes. For (332) 207-3847 enter 3322073847."
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
        r.problems()[0].startsWith("An ordering link has to be the whole web address"), true);
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

  r.all(".btn").find((b) => b.textContent === "Add a section").click();

  let card = r.lastCard();
  r.type(r.fieldLabelled(card, "Heading on the page"), "Pastries");
  r.type(r.fieldLabelled(card, "Tab label"), "Pastries");
  r.type(r.fieldLabelled(card, "Filter name"), "pastries");

  [...card.querySelectorAll(".btn")].find((b) => b.textContent === "Add an item").click();

  card = r.lastCard();
  const item = card.querySelector(".item");
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
  r.tab("Menus");
  r.all(".card__head")[0].click();                              // open Breakfast
  r.all(".item__head")[0].click();                              // open Morning Plate
  r.all(".btn--danger").find((b) => b.textContent === "Delete this item").click();
  await r.save();

  const writes = r.writes();
  check("the item is deleted", writes.map((w) => [w.what, w.table, w.id]),
        [["delete", "menu_items", "i1"]]);
  check("and its pour is not deleted separately — the database cascades it",
        writes.some((w) => w.table === "menu_item_pours"), false);
}

console.log("\nthe section that is built into the page");
{
  const r = await boot({
    data: Object.assign(fixture(), {
      menu_courses: [{ id: "k9", page: "food", course_key: "breakfast", tab_label: "Breakfast",
                       heading: "Build Your Own Breakfast", sizes: null, is_static: true,
                       static_id: "build", sort_order: 1 }],
      menu_items: [], menu_item_pours: []
    })
  });
  await r.signIn();
  r.tab("Menus");
  r.all(".card__head")[0].click();
  check("Build Your Own offers no fields to edit",
        r.all(".card .field__input").length, 0);
  check("and says where its contents live instead",
        r.q(".static").textContent.includes("built into the page"), true);
}


/* ═══ 7. hours ══════════════════════════════════════════════════════════════ */

console.log("\nhours");
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
  /* Tuesday is closed in the fixture, so it shows no time boxes at all — the
     state the CHECK constraint requires, rather than boxes that cannot save. */
  check("a closed day shows no times to fill in", r.all("#panels input[type=time]").length, 2);
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
  check("mobile keeps the native time inputs", r.all("#panels input[type=time]").length, 2);
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
  check("a second edit is outstanding", r.changeCount(), "1 change not yet saved");

  r.q("#discardBtn").click();
  await settle();
  check("discard starts the savebar exit", r.q("#savebar").classList.contains("savebar--leaving"), true);
  await wait(260);
  await settle();

  check("discarding goes back to what was saved, not to what was loaded",
        r.fieldShowing("First edit.").value, "First edit.");
  check("and leaves nothing to save", r.q("#savebar").hidden, true);

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
  check("the failed edit is still marked as outstanding", r.changeCount(), "1 change not yet saved");
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
    index: "index.html", faq: "faq.html",
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

  check("both slots are listed", r.all(".photo").length, 2);

  const hero = r.photo("The photograph behind the opening headline");
  check("showing the photograph the site was built with",
        hero.querySelector(".photo__img").getAttribute("src"),
        "assets/web/hero-dining.jpg");
  check("and saying so", hero.querySelector(".photo__state").textContent,
        "The photograph the site was built with — 1535 × 1024.");
  check("with the description offered for editing",
        hero.querySelector(".field__area").value, "The upstairs dining room");

  const backdrop = r.photo("The Wine Bar — the background behind the section");
  check("the backdrop is offered no description box",
        backdrop.querySelector(".field__area, .field__input"), null);
  check("and says why", backdrop.querySelector(".field__help").textContent.includes(
        "a screen reader is told to ignore it"), true);

  check("nothing has been sent by looking at any of it", r.sent(), []);
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
        r.changeCount(), "1 change not yet saved");

  const after = r.photo("The photograph behind the opening headline");
  check("and shows the file itself rather than the old photograph",
        after.querySelector(".photo__img").getAttribute("src"), "blob:fake/image/webp");
  check("resized to fit, and the size said out loud",
        after.querySelector(".photo__state").textContent,
        "Ready to upload — 2000 × 1500, 146 KB. Nothing has been sent yet.");

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
        ["photos", true, 2000, 1500]);
  check("and nothing is swept, because nothing was replaced",
        sent.filter((s) => s.what === "remove"), []);

  /* Nothing is left outstanding, asked the only way that means anything: save
     again and see whether it has anything to send. Reading the savebar would
     read "Saved. The site is showing it now." for a couple of seconds, which
     is a message rather than a count. */
  await r.save();
  check("and the page has nothing left to send", r.sent().length, sent.length);
}

console.log("\na photograph of a very different shape");
{
  /* hero.main is 1535 × 1024 — a landscape slot in a full-bleed band. A phone
     photograph held upright goes into it and loses its top and bottom, and
     nothing anywhere errors: the editor's own thumbnail is cropped to the same
     shape, so it looks fine right up until it is on the page. */
  const r = await boot({ decoded: { width: 3000, height: 4000 } });
  await r.signIn();
  r.tab("Photos");

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("IMG_9001.jpg", "image/jpeg", jpeg({ width: 3000, height: 4000 })));

  const said = r.photo("The photograph behind the opening headline")
                .querySelector(".photo__problem").textContent;
  check("the difference is pointed out", said.includes("portrait against landscape"), true);
  check("in terms of what will happen to it", said.includes("cropped to fill it"), true);
  check("but it does not block the save", r.problems(), []);

  await r.save();
  check("and it really does upload", r.uploads().length, 2);
}

{
  const r = await boot({ decoded: { width: 3000, height: 2000 } });
  await r.signIn();
  r.tab("Photos");
  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("similar.jpg", "image/jpeg", jpeg({ width: 3000, height: 2000 })));

  check("a similar shape is not remarked on",
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
  check("something is outstanding", r.changeCount(), "1 change not yet saved");

  r.q("#discardBtn").click();
  await settle();
  await wait(260);
  await settle();

  check("discarding leaves nothing outstanding", r.changeCount(), "0 changes not yet saved");
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
  check("nothing is outstanding as a result", r.changeCount(), "0 changes not yet saved");

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

  await r.pick(r.photo("The photograph behind the opening headline"),
               r.file("IMG_2201.jpg", "image/jpeg", jpeg({ orientation: 6 })));

  check("it comes out the right way up",
        r.photo("The photograph behind the opening headline")
          .querySelector(".photo__state").textContent
          .startsWith("Ready to upload — 1500 × 2000"), true);

  const transform = r.drawn().find((d) => d.what === "setTransform");
  check("drawn through the quarter turn the tag asked for",
        transform.m, [0, 1, -1, 0, 2000, 0]);

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
        ["alt", "height", "source_path", "storage_path", "width"]);
}


console.log(failures
  ? `\n${failures} failure(s) — the editor does not do what it says\n`
  : "\nthe editor writes what it shows, and refuses what the database would\n");
process.exit(failures ? 1 : 0);
