/* ═══════════════════════════════════════════════
   AROMATI — the site's public origin, in one place
   ═══════════════════════════════════════════════

   Every absolute URL the site shows a crawler — the canonical links, the
   og:url / og:image tags, the JSON-LD url, sitemap.xml and the Sitemap line
   in robots.txt — is built from SITE_URL below and nothing else. The HTML
   files carry the resolved URLs as plain text (a static site has no template
   layer to compute them at request time), so this file is the source of
   truth and tools/apply-site-url.mjs is what stamps it everywhere.

   ⛔ BEFORE LAUNCH — the one change this file exists for:
   SITE_URL below is the temporary Cloudflare Pages origin. When the client
   chooses the custom domain:

     1. set SITE_URL to it (https, no trailing slash)
     2. run:  npm run seo:url
     3. commit, deploy, then submit the sitemap in Search Console

   npm run check:seo verifies the tree matches this file without writing —
   it is part of npm test, so the site cannot drift from this value quietly.

   priceRange and geo are deliberately NOT in the homepage JSON-LD: neither
   a price range nor coordinates are recorded anywhere in this project, and
   schema markup must not invent facts. When the client confirms them, add
   them to index.html's CafeOrCoffeeShop block — they do not depend on the
   domain, so they are not here. */

export const SITE_URL = "https://aromati-cafe.pages.dev"; // ⛔ TEMPORARY — see above

export const SITE_NAME = "Aromati Café & Wine Bar";

/* The share-card image, at the site root. Kept out of assets/ on purpose:
   Vite rewrites anything it can see into a hashed name, and an og:image or
   JSON-LD image that 404s is a silent failure. vite.config.js copies this
   file to dist/ verbatim, so the URL below is stable. */
export const OG_IMAGE = "og-cover.jpg";

/* The public pages, as their canonical URLs spell them. Cloudflare Pages
   serves each file at its extensionless URL and 308s the .html spelling to
   it (the reason _headers carries rules for both /admin and /admin.html), so
   the canonical form has no .html. admin.html is NOT here and must never be:
   it stays noindexed. */
export const PUBLIC_PAGES = [
  { file: "index.html",       path: "/" },
  { file: "menu-food.html",   path: "/menu-food" },
  { file: "menu-drinks.html", path: "/menu-drinks" },
  { file: "menu-wine.html",   path: "/menu-wine" }
];
