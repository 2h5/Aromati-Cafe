# Aromati Café & Wine Bar

Marketing site and owner CMS for Aromati Café & Wine Bar, 103 E 34th Street,
Murray Hill, New York.

**Status:** handed over. Further work is maintenance and fixes only.

## What is here

This is a plain HTML, CSS, and JavaScript site. Vite provides the local server
and creates the production artifact; the source pages also work directly from
`file://` using the committed fallback data.

- Public pages: `index.html`, `menu-food.html`, `menu-drinks.html`, and
  `menu-wine.html`.
- Owner editor: `admin.html` (`/admin`). It manages copy, hours, contact
  details, menus, and photographs through Supabase.
- Shared admin history: `audit-log.html` (`/audit-log`). It records sessions,
  saves, publishes, and unsaved work for allowlisted admins.
- `data.js` loads the localStorage cache or seed files first; after first paint
  it checks Supabase and refreshes only when live content differs.
- `render.js` turns the shared content shape into public-page DOM, while
  `script.js` owns navigation, scrolling, reveals, menus, and other behavior.
- `data/seed-*.js` is the offline fallback. Live CMS edits do not rewrite it.
- `supabase/migrations/` and `supabase/POLICIES.md` contain the database
  schema, constraints, RLS, storage rules, and permission contract.
- `vite.config.js`, `site.config.mjs`, `_headers`, and `robots.txt` control the
  multi-page build, canonical URLs, security headers, and indexing behavior.

The public site remains usable if Supabase is unavailable: the fallback is the
site committed in Git. Uploaded photographs are stored in the Supabase bucket;
they are baked into `dist/` during a build and reach visitors after Publish.

## Local development

Node 22 is pinned in `.nvmrc`.

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # creates dist/ for deployment
npm run preview   # serves the built dist/
```

`admin.html` and `audit-log.html` need HTTP, so use `npm run dev` or a deployed
site. The public pages can also be opened directly from disk.

## Checks

```sh
npm test
npm run check:headers                 # check the deployed response
npm run check:headers -- https://…    # check a preview deployment
```

`npm test` runs 30 harnesses covering the public pages, CMS behavior, content
and security rules, migrations/RLS, build output, resilience, and browser
checks. The live-project checker is separate because it needs the real
Supabase project:

```sh
node tools/check-live-project.mjs
```

## Publishing

Cloudflare Pages is connected to this repository:

- production branch: `main`
- build command: `npm run build`
- output directory: `dist`
- project root: repository root

Pushing to `main` creates the production deployment; other branches create
previews. Do not manually upload a locally built `dist/` directory.

The editor's **Publish** button calls the protected
`supabase/functions/publish-site` Edge Function, which requests a Cloudflare
build through a server-side deploy hook. Publish acceptance means the rebuild
was requested, not that the Pages build has finished.

`site.config.mjs` is the source of truth for `SITE_URL` and public canonical
URLs. Update it and run `npm run seo:url` if the production domain changes.

## Rules for maintenance

- Keep the fallback order and first-paint behavior intact.
- Never put a service-role, secret, or deploy-hook value in browser code or Git;
  the public Supabase anon/publishable key is the only key allowed in `config.js`.
- Treat database constraints and RLS as the security boundary. Client-side
  validation is only for friendly feedback.
- Insert owner-entered values as text, never as HTML, and never hand-edit
  generated SQL.
- Keep the hand-written Build Your Own Breakfast interaction and the Reserve a
  Table placeholder stable unless a change is explicitly required.
- Back up uploaded photographs separately; their files are not stored in Git.

For detailed architecture and decisions, see `architecture.md` and `memory.md`.
Read `PHOTOGRAPHS.md` before changing the photo pipeline and
`supabase/POLICIES.md` before changing database behavior.
