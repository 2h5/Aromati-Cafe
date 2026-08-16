# What the database allows, in plain words

This describes the numbered migrations in this folder — 12 public content and
system tables, 40 policies, including the isolated `menu_builder_options`
table. If a sentence here says something you did not intend, that is the
finding — the SQL is wrong, not this summary.

The migrations have been applied to the project identified by `config.js` and
replayed locally by `npm run test:sql`. The live project was also checked with
the Supabase MCP after the breakfast-builder migration; the local folder
remains the source of truth for a rebuild.

---

## The one-paragraph version

Everything on the site is readable by anyone, including people who are not
logged in — it is a public café website, and the menu being public is the
point. Nothing is writable by anyone except accounts on a hand-maintained
allowlist, and that allowlist cannot be edited through the website at all. If
the allowlist is empty, nobody can change anything. That is the state the
database starts in.

---

## Who can do what

There are three kinds of caller.

**Anyone at all (`anon`)** — a visitor, a search engine, or a stranger with the
API URL and the public key. They can **read every content table and write
nothing.** Not the menu, not the hours, not one word of copy. They cannot read
the allowlist, and they cannot even ask the database whether they are the
owner.

**A logged-in account (`authenticated`)** — someone who has an account on this
Supabase project. Being logged in **by itself grants nothing**. Every single
write rule asks a second question: is this account on the allowlist? An account
that exists but is not allowlisted can read the site exactly like a stranger
and change nothing.

**An allowlisted account — the owner.** Can change content, within the limits
in the next section.

That second and third distinction is the important one, and it is the reason
signups must be turned off *and* the allowlist must be kept short. They protect
against different things:

- If someone creates an account and signups were left on, RLS still stops them
  writing. They get a useless account.
- If someone is added to the allowlist by mistake, being logged out does not
  save you.

Neither control substitutes for the other. Both are required.

---

## What the owner can change, and what is fixed

Not every table is equally open, and the difference is deliberate. Some tables
hold **values** — the words in a slot the website already has. Others hold
**rows** the owner genuinely creates and destroys.

### Values only — the owner edits, never adds or removes

| Table | Why it is fixed |
|---|---|
| `site_settings` | The set of settings is whatever the site renders. A new one means new markup. |
| `business_hours` | There are seven weekdays. To close a day you tick *closed*; the row stays. |
| `site_copy` | One row per `data-copy` hook in the markup. |
| `photos` | One row per photo slot in the markup. Changing the picture is an edit; removing the slot is not. |

For these, the SQL grants `update` and **does not grant `insert` or `delete`**.
That is not an omission. With row level security switched on, anything without
an explicit rule is refused — so those operations fail closed, by default,
without anyone having to remember to forbid them.

`site_settings` and `site_copy` go one step further: a trigger silently
restores the field's label, help text and position on every update. Row-level
security can permit an update to a *row* but not to a *column*, so without this
an editor could rename "Phone number" to something else. The editor never
offers that; the trigger makes it impossible rather than merely unavailable.

### Rows too — the owner adds and removes freely

`hours_exceptions`, `menu_courses`, `menu_items`, `menu_item_pours`,
`menu_builder_options`, `menu_item_options`.

These are the things a café actually gains and loses: a dish, a section, a
holiday closure, a bottle that sold out.

### Reachable by nobody

`admin_users`, the allowlist itself. Row level security is on and **there are
no rules at all**, which means every read and every write through the API is
refused, for everyone, including the owner. It can only be changed from the
Supabase dashboard's SQL editor.

This is what stops an editor promoting a second account from inside the app. If
the owner's login were ever phished, the attacker gets the owner's content
access and no way to entrench.

---

## Rules that protect the owner from a broken page

Some constraints exist for correctness rather than security. They matter
because the failures they catch are **invisible** — they do not produce an
error, they produce a slightly wrong page that nobody notices for a month.

- **A menu item must have exactly one kind of price.** One flat price, or one
  price per size, or one price spanning the sizes, or explicitly no price.
  Never two, never none-by-accident.
- **Prices are text, not numbers.** `3.90` stored as a number renders as `3.9`,
  and `21` becomes `21.00`. The database rejects a number with a message saying
  so.
- **A per-size price list must match its section's size columns exactly.** Two
  sizes, two prices. A mismatch does not error when the page renders — it
  overflows the CSS grid and drops a price under the wrong item.
- **A section can have at most two size columns**, because the grid is built
  for two.
- **Opening hours must close after they open**, and a closed day must have no
  times at all. Overnight hours are rejected outright: the site's open/closed
  logic cannot express them, so accepting them into the database would just move
  the bug.
- **Copy with an odd number of `*` is rejected.** Asterisks mark italics in
  pairs; an unmatched one renders as a literal `*` on the page.
- **Copy can carry a length limit**, stored next to the text. The animated
  headlines break their layout past a certain length.
- **A photo must have alt text once it has an image**, and its width and height
  travel together or not at all.

Every one of these raises a message written for the owner, not for a developer.
For example:

> Item "Drip Coffee" has 3 prices but its section has 2 size columns
> (Small / Large). They must match one to one.

---

## One thing that is not what it looks like

**The public API key is public.** It ships in the website's JavaScript and is
meant to. It identifies the project, it does not authorise anything. Everything
above is what actually holds the door, which is why it is worth reading
carefully rather than trusting the key to be secret. It will not be.

---

## What this has not been checked for

Being straight about the limits, because the checks that exist are easy to
mistake for more than they are.

**The SQL has never been executed.** No Postgres, no Docker, no Supabase CLI on
this machine. It is not syntax-checked. A missing comma would not have been
caught. Assume the first real `supabase db push` finds something.

**`tools/check-policies.mjs` reads the SQL as text.** It proves seven
structural properties — every table has RLS on, no write reaches `anon`, every
write rule calls `is_owner()`, grants and rules agree, and the `security
definer` function pins its `search_path`. These are the mistakes that are
silent when made: a table left unprotected reads and writes perfectly from
every account, including no account at all, and nothing fails.

It cannot tell you the policy expresses the right *intent*. That is what this
document is for.

**`tools/test-policies.mjs` breaks each rule on purpose** and requires the
checker to catch it, naming which rule fired. The checker passed all seven of
its rules the first time it ran, against SQL written the same afternoon — which
is also exactly what a checker whose rules match nothing would do.

**Nothing here has been tested against a real logged-out request.** That is
Phase 3: the acceptance test is a `curl` with no credentials that can read the
menu and cannot write it.

---

## Since this was written

All four caveats above have been answered, and the answers belong next to the
claims rather than only in `memory.md`.

**The SQL has run.** Every migration is applied to the live project, and
`npm run test:sql` builds the whole schema in a real Postgres on every test
run, so it is now syntax-checked continuously rather than not at all.

**A logged-out request has been tried, over HTTP, against the real project.**
`tools/check-live-project.mjs` reads the menu with the publishable key and then
attempts six writes a defaced site would need — editing a headline, adding an
item, deleting the menu, closing the café, reading the owner allowlist, and
asking whether it is the owner. All six are refused. It opens with a read that
must *succeed*, because six refusals look identical to six requests that never
arrived.

**The three-actor check is real.** `tools/test-rls.mjs` runs every write three
times — as the allowlisted owner, as a signed-in stranger, and logged out. The
owner column is what proves the statement is executable at all; without it a
refusal proves nothing about the policy that refused.

**What this document describes is now what the editor does.** `admin.html` is
the only thing that writes, and it writes exactly what these rules allow: it
updates `site_settings` and `site_copy` values and never their labels or keys,
it never inserts or deletes a setting, a copy field or a weekday, and it has
full run of the menu and holidays. If a rule below reads wrong to
you, the editor is wrong too — say so.

---

## The photograph bucket

Added in Phase 6. It is the only thing in the project that stores a *file*
rather than a row, and it sits behind a different service with its own rules —
so "the tables are locked down" says nothing about it, and it is worth its own
section.

**`site-photos`, and nothing else.** One bucket per feature. Sharing one means
some future feature's tidy-up decides the fate of these files.

**Anyone can fetch a photograph; only the owner can put one there.** The bucket
is public, which is what lets a visitor — who is not logged in — see the
pictures. Writing, replacing and deleting all ask the same `is_owner()` question
as every content table, so there is one answer to "who may change this site" and
it is stored in one place.

**Public is not the same as listable.** Every individual photograph's URL works
for anybody. Asking the bucket *what is in it* is a separate permission, and it
is the owner's alone. Granting it to strangers would turn every file, including
ones no longer used on the site, into something that can be enumerated.

**The size and type limits are on the bucket, not in the editor.** 3 MB, and
only JPEG, PNG and WebP. The editor checks too, but that is a courtesy so the
owner finds out before waiting for an upload — it is not the control. Anyone
holding the owner's password can post straight at the storage API and never load
the editor at all.

**SVG is not allowed and must never be added.** It is the one image format that
can contain a script, and this bucket is served from the site's own web address
— so a script inside one would run as if the site had written it. A test fails
if it appears in the list.

**A picked photograph is not an uploaded photograph.** Nothing is sent until
*Save changes*. Choosing a file resizes it, turns it the right way up and shows
it to you; discarding throws it away and the bucket never hears about it. When a
save does happen, the file goes first and the row that names it second — a row
pointing at a file that is not there yet is a broken picture on the live site.
The photograph that was replaced is deleted afterwards, once everything else has
landed.

**The photographs the site shipped with cannot be lost this way.** They are in
the site's own files, not in the bucket, and "no photograph uploaded" is the
state every slot starts in. Putting the original back is always available and is
just another edit.

---

## Why the live migration list is longer than this folder

`list_migrations` on the live project returns fourteen entries.
`supabase/migrations/` holds ten. The live history includes the entries that
were applied through the dashboard/MCP and then folded into the numbered
source migrations or content; the next person comparing the lists should read
this before spending an hour on it.

The live-only entries are:

| Live-only version | What it did | Where it lives now |
| --- | --- | --- |
| `advisor_fixes_revoke_from_public` | Revoked a grant the linter flagged | `20260801000300_advisor_fixes.sql`, at the revoke near the end of the file |
| `fix_hero_sub_nbsp` | Corrected a non-breaking space in one headline | The regenerated `site_copy` seed — `test:live` passing is the proof that live and the seed files agree on it |
| `photos_allow_png_originals` | Added PNG to the bucket's allowed types | `20260801000400_photos.sql`, in the bucket's MIME list |
| `resync_menu_to_printed_sheets` | Replaced menu rows with the current printed sheets | The current `menu` seed and `test:live` |
| `breakfast_builder_options` | Added the CMS-backed Base, bagel and add-on choices | `20260812000100_breakfast_builder.sql` |
| `menu_course_hidden` | Added the whole-section hide flag for menu courses | `20260812000200_menu_course_hidden.sql` |

These changes were folded back into the numbered files rather than kept as separate
steps, because the numbered files are what a rebuild from scratch runs and a
rebuild has to produce the schema that is actually live. That is the trade this
project made: **the folder is the source of truth for what the schema should be,
and the live version list is a history of how it got there.** They are not
supposed to match, and making them match would mean either replaying fixes the
numbered files already contain, or leaving the numbered files wrong.

What keeps this honest is not the two lists agreeing. It is
`tools/check-live-project.mjs`, which compares the live *content* against the
seed files through `data.js`'s own comparison function, and `npm run test:sql`,
which applies this folder to a real Postgres and checks the result. If those
pass, the folder rebuilds what is live regardless of how the version numbers
line up.

Add a new change as a **new numbered file here first**, then apply it. The one
exception is a hotfix applied live under pressure — and that one is not finished
until it has been folded into a numbered file and added to the table above.
