/* Regression checks for refresh, storage failure, and paginated content.
   Every request is mocked; no hosted service or account is used. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { boot, seedRows, serve, settle } from "./page-boot.mjs";

const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("  ok   " + name);
}

await check("breakfast refresh preserves choices and recalculates the ticket", async () => {
  const rows = seedRows();
  rows.menu_builder_options.find(row => row.group_key === "base").price = "17";
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const p = boot("menu-food.html", { fetcher: async (...args) => { await pending; return serve(rows)(...args); } });
  try {
    const chips = p.doc.querySelectorAll('[data-group="base"] .chip');
    chips[1].click();
    const selected = chips[1].dataset.name;
    const add = p.doc.querySelector('[data-group="add"] .chip');
    add.click();
    const expected = p.doc.querySelector("#buildTotal").textContent;
    release();
    await settle();
    assert.equal(p.doc.querySelector('[data-group="base"] .is-on').dataset.name, selected);
    assert.equal(p.doc.querySelector('[data-group="add"] .is-on').dataset.name, add.dataset.name);
    assert.equal(p.doc.querySelector("#buildTotal").textContent, expected);
    p.doc.querySelector('[data-group="base"] .chip').click();
    assert.equal(p.doc.querySelector("#buildTotal").textContent, "19.00");
    assert.deepEqual(p.errors, []);
  } finally { p.window.close(); }
});

await check("legacy invalid breakfast prices cannot produce a NaN ticket", async () => {
  const rows = seedRows();
  rows.menu_builder_options.find(row => row.group_key === "base").price = "$6";
  rows.menu_builder_options.find(row => row.group_key === "add").price = "NaN";
  const p = boot("menu-food.html", { fetcher: serve(rows) });
  try {
    await settle();
    p.doc.querySelector("#buildReset").click();
    assert(Number.isFinite(Number(p.doc.querySelector("#buildTotal").textContent)));
    assert(!p.doc.querySelector('[data-group="base"]').textContent.includes("$6"));
    assert.deepEqual(p.errors, []);
  } finally { p.window.close(); }
});

for (const mode of ["disabled", "quota"]) {
  await check("fresh hours remain authoritative with storage " + mode, async () => {
    const rows = seedRows();
    rows.business_hours.forEach(row => { row.is_closed = true; row.opens_at = row.closes_at = null; });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const p = boot("index.html", { fetcher: async (...args) => { await pending; return serve(rows)(...args); } });
    try {
      const old = p.window.localStorage;
      Object.defineProperty(p.window, "localStorage", { value: {
        getItem: key => { if (mode === "disabled") throw new Error("disabled"); return old.getItem(key); },
        setItem: () => { throw new Error(mode); }
      } });
      release(); await settle();
      assert(p.window.AROMATI_DATA.current().hours.every(day => day.closed));
      assert.equal(p.doc.querySelector("#hoursStatus").hidden, true);
      assert(p.doc.querySelector("#hoursList").textContent.includes("Closed"));
      assert.deepEqual(p.errors, []);
    } finally { p.window.close(); }
  });
}

await check("public REST reads paginate even when the server caps pages below 200 rows", async () => {
  const rows = seedRows();
  const item = rows.menu_items[0];
  rows.menu_items = Array.from({ length: 1105 }, (_, i) => ({ ...item, id: "item-" + i, name: "Paged item " + i, sort_order: i }));
  const p = boot("menu-food.html", { fetcher: async url => {
    const u = new URL(url);
    const table = u.pathname.split("/").pop();
    const offset = Number(u.searchParams.get("offset") || 0);
    const batch = rows[table].slice(offset, offset + 73);
    return { ok: true, headers: { get: () => "0-72/" + rows[table].length }, json: async () => structuredClone(batch) };
  } });
  try {
    for (let i = 0; i < 30 && !p.doc.body.textContent.includes("Paged item 1104"); i++) await settle();
    assert.equal(p.doc.querySelectorAll("#carteBody .mi").length, 1105);
    assert(p.doc.body.textContent.includes("Paged item 1104"));
    assert.deepEqual(p.errors, []);
  } finally { p.window.close(); }
});

await check("CMS and history reads include all 1,205 rows with stable tie ordering", async () => {
  const sandbox = {};
  runInNewContext(readFileSync("cms-client.js", "utf8"), sandbox);
  const rows = Array.from({ length: 1205 }, (_, i) => ({ id: String(i) }));
  const orders = [];
  const client = { from() { return { select() { return {
    order(col) { orders.push(col); return this; },
    range(start, end) { return Promise.resolve({ data: rows.slice(start, Math.min(end + 1, start + 71)), count: rows.length, error: null }); }
  }; } }; } };
  const all = await sandbox.AROMATI_CMS.readAll(client, "audit_log", "id", "created_at", false);
  assert.equal(all.length, 1205);
  assert.equal(all[1204].id, "1204");
  assert.deepEqual(orders.slice(0, 2), ["created_at", "id"]);
});

await check("audit viewer search finds a change older than the newest 1,000 sessions", async () => {
  const rows = Array.from({ length: 1005 }, (_, i) => ({ id: String(i), actor_email: "editor@example.invalid",
    action: i === 1004 ? "save" : "login", summary: i === 1004 ? "Older audit marker" : "Opened the editor",
    detail: null, created_at: "2026-10-03T12:00:00Z" }));
  const dom = new JSDOM(readFileSync("audit-log.html", "utf8"), { runScripts: "dangerously", url: "https://stub.invalid/audit-log" });
  const w = dom.window;
  try {
    w.AROMATI_CONFIG = { url: "https://stub.invalid", anonKey: "x".repeat(40) };
    w.matchMedia = () => ({ matches: true });
    w.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user: { email: "editor@example.invalid" } } } }) },
      rpc: async () => ({ data: true, error: null }),
      from: () => ({ select: () => ({ order() { return this; },
        range: (start, end) => Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null }) }) })
    }) };
    w.eval(readFileSync("cms-client.js", "utf8"));
    w.eval(readFileSync("audit-log.js", "utf8"));
    await settle();
    assert.equal(w.document.getElementById("app").hidden, false);
    const search = w.document.getElementById("logSearch");
    search.value = "Older audit marker";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert(w.document.getElementById("loglist").textContent.includes("Older audit marker"));
  } finally { w.close(); }
});

await check("a failed later page never replaces complete content with a partial response", async () => {
  const rows = seedRows();
  const first = rows.menu_items[0];
  rows.menu_items = Array.from({ length: 300 }, (_, i) => ({ ...first, id: "partial-" + i, name: "Incomplete item " + i }));
  const p = boot("menu-food.html", { fetcher: async url => {
    const u = new URL(url), table = u.pathname.split("/").pop();
    const offset = Number(u.searchParams.get("offset") || 0);
    if (table === "menu_items" && offset > 0) return { ok: false, status: 503 };
    return { ok: true, headers: { get: () => "0-199/" + rows[table].length },
      json: async () => structuredClone(rows[table].slice(offset, offset + 200)) };
  } });
  try {
    await settle();
    assert(!p.doc.body.textContent.includes("Incomplete item"));
    assert(p.doc.querySelectorAll("#carteBody .mi").length > 0);
    assert.deepEqual(p.errors, []);
  } finally { p.window.close(); }
  const sandbox = {};
  runInNewContext(readFileSync("cms-client.js", "utf8"), sandbox);
  const client = { from() { return { select() { return {
    order() { return this; }, range() { return Promise.resolve({ data: [], count: 300, error: null }); }
  }; } }; } };
  await assert.rejects(sandbox.AROMATI_CMS.readAll(client, "audit_log", "id", "created_at", false), /stopped before all rows/);
});

await check("a history read restarts when rows shift between pages, and never repeats a row", async () => {
  const sandbox = {};
  runInNewContext(readFileSync("cms-client.js", "utf8"), sandbox);
  let rows = Array.from({ length: 450 }, (_, i) => ({ id: "r" + i }));
  let calls = 0, inserted = false, pages = [];
  const client = { from() { return { select() { return {
    order() { return this; },
    range(start, end) {
      calls += 1;
      /* Another editor saves while the second page is being asked for. */
      if (start > 0 && !inserted) { inserted = true; rows = [{ id: "new" }, ...rows]; }
      return Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null });
    }
  }; } }; } };
  const all = await sandbox.AROMATI_CMS.readAll(client, "audit_log", "id", "created_at", false,
    got => pages.push(got.length));
  assert.equal(all.length, 451);
  assert.equal(new Set(all.map(r => r.id)).size, 451);
  assert(calls > 3, "the read started again after the total changed");
  assert(pages.length > 0, "progress was reported while older pages loaded");

  /* Same total, shifted window: the boundary row comes back twice. */
  const base = Array.from({ length: 300 }, (_, i) => ({ id: "s" + i }));
  const shifted = { from() { return { select() { return {
    order() { return this; },
    range(start) {
      const data = start === 0 ? base.slice(0, 200) : [base[199], ...base.slice(200)];
      return Promise.resolve({ data, count: 300, error: null });
    }
  }; } }; } };
  const deduped = await sandbox.AROMATI_CMS.readAll(shifted, "audit_log", "id", "created_at", false);
  assert.equal(new Set(deduped.map(r => r.id)).size, deduped.length);
});

await check("public content restarts a paged read whose total changed partway", async () => {
  const rows = seedRows();
  const first = rows.menu_items[0];
  rows.menu_items = Array.from({ length: 300 }, (_, i) => ({ ...first, id: "paged-" + i, name: "Paged item " + i, sort_order: i }));
  let shifted = false;
  const p = boot("menu-food.html", { fetcher: async url => {
    const u = new URL(url), table = u.pathname.split("/").pop();
    const offset = Number(u.searchParams.get("offset") || 0);
    let list = rows[table];
    /* The first pass sees one extra row on page one, then the real total. */
    if (table === "menu_items" && !shifted) {
      if (offset === 0) list = [{ ...first, id: "ghost", name: "Paged item 0" }, ...list];
      else shifted = true;
    }
    return { ok: true, headers: { get: () => offset + "-" + (offset + 199) + "/" + list.length },
      json: async () => structuredClone(list.slice(offset, offset + 200)) };
  } });
  try {
    await settle();
    const names = Array.from(p.doc.querySelectorAll("#carteBody .mi"))
      .map(n => n.textContent).filter(text => /Paged item \d+/.test(text))
      .map(text => /Paged item \d+/.exec(text)[0]);
    assert.equal(names.length, 300);
    assert.equal(new Set(names).size, 300);
    assert.deepEqual(p.errors, []);
  } finally { p.window.close(); }
});

console.log("\n" + checks.length + " sweep regression checks passed");
