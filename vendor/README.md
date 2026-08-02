# vendor/

Third-party code that ships with the site, checked into git rather than pulled
from a CDN at runtime.

There is exactly one file, and it is loaded by exactly one page.

| file | package | version | sha256 | why it is here |
|---|---|---|---|---|
| `supabase.js` | `@supabase/supabase-js` | 2.111.0 | `7396012594aa6d23bb373ebc25d1080bf3672fa847c3713f756520b40fd13453` | `admin.html` — sign-in and the authenticated REST calls |

Copied verbatim from `node_modules/@supabase/supabase-js/dist/umd/supabase.js`
on 2026-08-01. Not reformatted, not minified further, not annotated with a
banner — a vendored file that has been touched is no longer the published
artifact, and the whole point is that it is.

## Why not a CDN

`admin.html` is the page that holds the owner's session token. A `<script src>`
pointing at someone else's server on that page means that server can, at any
moment of its choosing, read the token and write to the database as the owner.
That is not a hypothetical failure mode — it is what a CDN compromise *is*.

Vendoring turns a live trust relationship into a one-time one: the code was
read into the repository on a known date, at a known version, and it cannot
change again without a commit. The Content-Security-Policy in `_headers` says
`script-src 'self'` for this reason, so a CDN tag on the admin page would not
merely be poor practice — it would be blocked, and the page would not work.

The public pages load no SDK at all. They speak to `/rest/v1/` with plain
`fetch` (see `data.js`), so this file is never served to a visitor.

## Refreshing it

```
npm install --save-dev @supabase/supabase-js@<version>
node tools/check-vendor.mjs --update
```

`tools/check-vendor.mjs` runs in `npm test`. It fails if `vendor/supabase.js`
and the installed package have drifted apart, which is the quiet failure this
directory otherwise invites: a file copied by hand once, edited by hand later,
and no longer the published artifact anybody audited. It checks three things
against each other — the bytes on disk, the digest recorded in the table above,
and the version in `package.json` — so that changing any one of them alone is
caught rather than propagated.

A refresh is a decision, not a chore. Read the release notes for anything
touching auth or storage, then run `npm test` and open the editor before
committing — the harness proves the file is the published one, not that the new
version still does what the editor asks of it.
