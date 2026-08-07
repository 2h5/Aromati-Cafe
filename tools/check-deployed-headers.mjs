/* Do the headers in _headers actually reach the pages they were written for?
   node tools/check-deployed-headers.mjs [origin]

   tools/check-csp.mjs reads _headers out of the source tree. That is the right
   thing for what it checks — that the policy is spelled correctly and allows
   what the site needs — and it is structurally incapable of noticing the thing
   that went wrong on 2026-08-07:

     _headers had a rule for /admin.html. Cloudflare Pages serves that file at
     /admin and 308s /admin.html to it, so the rule matched a redirect with no
     body and never the page. The editor ran under the /* rule for months —
     framable by the portfolio, indexable, referrer leaking, no blob: for the
     upload preview. Four deliberate lines, none of them in force.

   Every check here reads the deployment. A rule that is correct in the file and
   absent from the response is exactly the failure, so nothing in this file may
   consult _headers to decide what to expect: the expectations are written out
   again below, by hand, on purpose. Two copies that must agree is the point —
   if someone changes the policy they have to change it here too, and if they
   do not, this fails and says so.

   Networked, so it is not part of `npm test`. Run it after a deploy, and when
   changing anything in _headers. */

const ORIGIN = (process.argv[2] || "https://aromati-cafe.pages.dev").replace(/\/$/, "");

let failures = 0;
const fail = (what, detail) => {
  failures++;
  console.log(`  FAIL ${what}`);
  if (detail) console.log(`         ${detail}`);
};
const pass = (what) => console.log(`  ok   ${what}`);

/* redirect:"follow" is deliberate and is the whole lesson of this file. The
   first attempt at diagnosing the bug read the 308 rather than the page and
   concluded the deploy had not landed. What a visitor gets is what is at the
   end of the redirect chain, so that is what is asked for. */
async function headersOf(path) {
  const res = await fetch(ORIGIN + path, { redirect: "follow" });
  return { res, url: res.url, get: (h) => res.headers.get(h) };
}

function has(where, header, needle, why) {
  const value = where.get(header);
  if (!value) return fail(`${where.url} — no ${header}`, why);
  if (!value.includes(needle)) {
    return fail(`${where.url} — ${header} is missing ${JSON.stringify(needle)}`, value);
  }
  pass(`${header.toLowerCase()} carries ${JSON.stringify(needle)}`);
}

console.log(`\nreading the deployment at ${ORIGIN}\n`);

/* ── the editor ────────────────────────────────────────────────────────────
   It holds the owner's session token, so every one of these is load-bearing
   and every one of them was silently absent. */
console.log("the editor, at whatever URL it actually answers on");
{
  const admin = await headersOf("/admin.html");

  if (!/\/admin(\.html)?$/.test(new URL(admin.url).pathname)) {
    fail(`/admin.html led to ${admin.url}, which is not the editor`);
  } else {
    pass(`/admin.html resolves to ${new URL(admin.url).pathname}`);
  }

  has(admin, "content-security-policy", "frame-ancestors 'none'",
      "the editor must not be framable — the portfolio is allowed to frame the site, not this");
  has(admin, "content-security-policy", "blob:",
      "the upload preview draws from a blob: URL before the file exists on the server");
  has(admin, "x-robots-tag", "noindex",
      "the sign-in page must not be in search results");
  has(admin, "referrer-policy", "no-referrer",
      "a token in the URL bar must not travel to anywhere the editor links");

  /* One header, not two. A duplicate is intersected by the browser rather than
     replaced, so a second policy that differs by one directive quietly forbids
     whatever the two do not have in common. */
  const all = [...admin.res.headers].filter(([k]) => k.toLowerCase() === "content-security-policy");
  if (all.length === 1) pass("exactly one Content-Security-Policy, not two intersected ones");
  else fail(`${all.length} Content-Security-Policy headers on the editor`);
}

/* ── a public page ─────────────────────────────────────────────────────────
   The /* rule, which was never in doubt — it is here so that a future change
   that fixes the editor by loosening everything else cannot pass. */
console.log("\na public page, which must NOT have the editor's policy");
{
  const page = await headersOf("/menu-food.html");
  const csp = page.get("content-security-policy") || "";
  if (csp.includes("frame-ancestors 'none'")) {
    fail(`${page.url} — the editor's frame-ancestors leaked onto a public page`, csp);
  } else if (!csp) {
    fail(`${page.url} — no Content-Security-Policy at all`);
  } else {
    pass("carries the site policy, not the editor's");
  }
  if ((page.get("x-robots-tag") || "").includes("noindex")) {
    fail(`${page.url} — noindex leaked onto a public page, which would delist the site`);
  } else {
    pass("not marked noindex");
  }
}

console.log(failures
  ? `\n${failures} check${failures === 1 ? "" : "s"} failed — the deployment does not match what _headers intends\n`
  : "\nwhat _headers intends is what the deployment sends\n");
process.exit(failures ? 1 : 0);
