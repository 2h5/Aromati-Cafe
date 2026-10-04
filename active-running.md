# Active repo fixes

Started: 2026-10-03. This is the running checklist for the read-only sweep findings and subsequent fixes.

Status meanings: `PENDING`, `IN PROGRESS`, `VERIFIED LOCALLY`, `PENDING LIVE`. Local verification does not establish deployed behavior. No commit, push, deployment, or live data change is authorized by this checklist.

## Behavior bugs

| ID | Issue and acceptance condition | Status |
| --- | --- | --- |
| B1 | Edits made during Save are falsely marked saved. Confirmed snapshots must represent the request actually sent; later edits must remain unsaved. | VERIFIED LOCALLY |
| B2 | Photo retries collide after uploads succeed and metadata fails. Retry must reuse confirmed uploads without overwriting another object. | VERIFIED LOCALLY |
| B3 | Live breakfast choices change without updating the ticket. Prices, selections, hints, bagel disclosure, and total must agree after refresh. | VERIFIED LOCALLY |
| B4 | Breakfast prices accept `$6` and produce `NaN`. CMS and database must require a nonnegative decimal; public rendering must safely handle legacy invalid values. | VERIFIED LOCALLY; PENDING LIVE migration |
| B5 | Blocked storage causes the hours pill to use seeds while the table uses live hours. Current content must remain available in memory independently of storage. | VERIFIED LOCALLY |

## Additional risks

| ID | Issue and acceptance condition | Status |
| --- | --- | --- |
| R1 | Concurrent editors overwrite each other; zero-row updates are accepted as saved. Existing-row writes must check a revision and confirm the row returned, preserving unsaved work on conflict. | VERIFIED LOCALLY |
| R2 | Unload audit logging retains an expired access token. Session changes must keep the token current and clear it on sign-out. | VERIFIED LOCALLY |
| R3 | Audit history silently stops at 1,000 entries. Filters must access older records without silently presenting partial history as complete. | VERIFIED LOCALLY |
| R4 | Public and CMS reads silently truncate at the API row limit. Reads must paginate with stable ordering and keep fallback/failure handling. | VERIFIED LOCALLY |
| R5 | Vite 5.4.21 is affected by the Windows alternate-path file-access advisory when the development server is exposed to the network. Move to a patched compatible version and verify build behavior. | VERIFIED LOCALLY |
| R6 | Node >=18 is advertised despite newer dependency requirements. Align package engines with the installed dependency requirements and deployment runtime. | VERIFIED LOCALLY |
| R7 | Architecture documentation incorrectly describes audit history as undeletable and lists 16 rather than 18 migrations. Reconcile the current contract and keep the count accurate after new migrations. | VERIFIED LOCALLY |

## Evidence and work log

- Initial sweep: 59 JavaScript syntax checks, 23 read-only checks, 188 local asset/link references, migration replay, and 89 authorization checks passed. Five behavior bugs were separately reproduced with in-memory simulations.
- Work is local until explicitly deployed. New database constraints, if needed, will be forward migrations with live application marked separately.
- Dependency advisory: https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff (patched Vite 6.4.3 and newer supported branches).

### 2026-10-03 local implementation

- B1 / R1: panels are inert during saves; snapshots retain sent values rather than later draft values. Updates and deletes match the loaded `updated_at` and require one returned row. Conflicts leave remaining changes unsaved. The regression tests also stage a pending input event during an in-flight save and confirm a second save sends it.
- B2: each confirmed upload is remembered independently. A retry after the metadata write fails skips both already-confirmed objects while retaining `upsert: false`.
- B3: refresh retains available selections and runs the existing ticket renderer again, updating prices, hints, disclosure, and total.
- B4: editor validation requires nonnegative decimal prices with at most two decimal places. The public reader/rendering path rejects legacy invalid choices. `20261003000000_breakfast_numeric_prices.sql` adds the same syntax constraint for new database writes, using `NOT VALID` to avoid blocking deployment over legacy rows.
- B5: the latest successful response remains in memory even if cache reads or writes fail.
- R2: auth state changes refresh or clear the token used by unload logging.
- R3 / R4: `cms-client.js` handles shared SDK pagination for CMS/history. Public REST queries paginate using the exact response count and stable ordering. Failed or incomplete later pages do not publish partial content. Audit-viewer search was checked against a change older than 1,000 sessions.
- R5 / R6: installed and locked Vite 6.4.3 (esbuild 0.25.12). Node engines and README now require Node 22.13+ in the 22 branch or Node 24+. `.nvmrc` retains the existing Node 22 branch.
- R7: architecture and project handoff documentation now describe cleanup policies, save confirmation, token refresh, pagination, and the 19 migrations. `architecture.md` is intentionally Git-ignored in this checkout and was updated on disk; ignore rules were not changed.

### Verification

- All 30 existing checks were exercised. The initial `npm test` run stopped at the documentation checker because the new tool/migration were not yet indexed. That checker passed after the handoff update, and all remaining suite checks passed in a focused continuation.
- `npm run test:sweep`: eight regression checks passed, including the real audit-viewer script with mocked data. Additional save-race, conflict, upload-retry, token-refresh, and invalid-price checks passed in `test:admin`; new invalid-price database cases passed in `test:sql`.
- Real headless-browser font-layout and menu-replay checks passed.
- `npm run build:files`: Vite 6.4.3 built all six pages. Every classic script referenced by the built pages exists, including `cms-client.js`. The normal classic-script warnings are expected; the existing copy plugin supplies those files.
- `git diff --check` passed. No styling overhaul or change to photo publishing, allowlists, RLS ownership, or deployment triggers was made.

### Pending live / release work

- The user authorized commit and push on 2026-10-03. Source fixes and this tracker are included in that release; push confirmation is recorded in chat. The Cloudflare build and deployed behavior remain unverified. No manual deployment, deploy-hook call, or live database mutation was performed.
- Apply `supabase/migrations/20261003000000_breakfast_numeric_prices.sql` in the hosted database as part of an explicitly authorized release. Existing invalid prices, if any, need correction before separately validating `menu_builder_price_decimal`.
- Hosted auth, PostgREST revision matching/pagination, real photo storage retries, and the deployed admin UI remain unverified live. Local tests use mocks and PGlite; they do not establish those hosted behaviors.
- Visual acceptance of the editor and public pages remains available to the user; browser automation checks were limited to the repository's existing layout/replay harnesses.

## Post-push review of 3dcd6af (2026-10-03)

Read the full diff and re-ran the targeted checks: `test:sweep`, `test:admin`, `test:sql`, `test:resilience`, `test:hourslive`, `test:live`, `test:photos`, `test:rls`, `test:copy`, `test:hostile`, `test:guards`, `test:dbguards`, `test:policies`, `check:csp`, `check:vendor`, and `check:memory`. All passed on Node 24.11.1 with Vite 6.4.3. No build, deploy, or live data access was run.

- B1–B5 and R1–R6: each issue existed in the parent commit, and the fix is present in the code. Revision checks are sound against the schema: every table the editor writes has `id`, `updated_at`, and a `touch_updated_at` trigger, no trigger writes other rows, and every editor table has an open SELECT policy, so `update…select` / `delete…select` return the row. Deletes run children-first, so cascades do not cause false conflicts. Status stays VERIFIED LOCALLY / PENDING LIVE as recorded above.
- R7: fixed on disk only. `architecture.md` is ignored by `.gitignore` (`ARCHITECTURE.md`), so this part of the fix is not in the push. See N3.

## Additional findings (post-push sweep)

| ID | Issue and acceptance condition | Status |
| --- | --- | --- |
| N1 | **A photo prepared during a save can be marked saved without being uploaded.** `save()` builds its upload steps at the start, but `step.sent` is copied from the live row only when each step runs. Photo preparation is async (`frameAndKeep` → `toBlob` → `sourceFor` → sets `row._upload` / `row.storage_path`, `admin.js:3343-3378`), and the framing dialog is appended to `body`, outside the inert `#panels`. Ctrl+S still fires while the dialog is open. If the photo row already has a planned update (for example, an edited alt text) and framing or compression finishes mid-save, the update writes the new `storage_path` with no upload planned. `snapshot()` then sees matching paths and calls `forgetUpload`, so the blob is discarded and the baseline reports it saved. After Publish, the slot references a missing object. Acceptance: snapshot each row's sent values when the plan is built, or block or defer photo preparation and the framer while `saving`. A test must cover framing that finishes mid-save. (Found by reading the code; not yet reproduced.) | VERIFIED LOCALLY |
| N2 | **The new regression suite is not part of `npm test`.** `test:sweep` is a separate script, and `check:memory` still checks for exactly 30 harnesses. The full suite therefore skips the storage-failure, breakfast-refresh, and pagination regressions. Acceptance: add `test:sweep` to `npm test` and update the counts in memory.md and README. | VERIFIED LOCALLY |
| N3 | **The canonical architecture doc is not version-controlled.** AGENTS.md makes `architecture.md` the canonical reference, but `.gitignore` excludes it, so R7's fix and the doc itself exist only on this machine. Acceptance: the user decides whether to track it, or AGENTS.md stops calling it canonical. | CLOSED: user decision 2026-10-03, `architecture.md` stays untracked |
| N4 | **Offset pagination can duplicate or skip rows under concurrent writes.** `cms-client.js` and `data.js` page with `offset` on a sort key. A row inserted or deleted between pages shifts the window, which is most likely for `audit_log` (newest-first, written by other editors during a load). The count check passes as long as the total matches. Content tables are currently under 200 rows (one page), so this mainly affects history. Acceptance: dedupe by `id`, or use keyset pagination (`created_at,id` cursor). | VERIFIED LOCALLY |
| N5 | **The audit viewer now downloads the whole history on every load.** R3 removed the 1,000-row cap, so each Refresh pulls every row, including the `detail` jsonb, 200 at a time, with `count=exact` on each page. Load time grows with history. Acceptance: load recent pages first and fetch older ones on demand when search or filters need them, or rely on and document the cleanup policies as the bound. | VERIFIED LOCALLY |
| N6 | **`npm audit` reports 2 high-severity advisories in dev-only dependencies:** `nanoid <3.3.18` (via Vite/PostCSS) and `undici 7.0.0–7.29.0` (via jsdom, test only). Neither ships to the site. Acceptance: `npm audit fix` within the locked ranges, then rerun the test harnesses that use jsdom. | VERIFIED LOCALLY |
| N7 | **"Put back" in the Changes drawer still works during a save.** The drawer is outside the inert `#panels`. Only the toggle is disabled, so `revertRow` can run mid-save. For a photo row this calls `forgetUpload` while the upload step is in flight, and the uploaded object is left orphaned in the bucket. Other tables just send the reverted values (harmless). Acceptance: make `#changes` inert as well, or have `revertRow` return early when `saving`. | VERIFIED LOCALLY |
| N8 | **`tools/bake-photos.mjs` still reads `photos` without pagination.** This is inconsistent with R4, but the table holds a fixed set of slots well under the row limit, so there is no practical impact. Acceptance: optional; reuse the paginated reader if the slot count could ever approach the API limit. | VERIFIED LOCALLY |

### 2026-10-03 post-push fixes (N1–N8)

- N1: what each row step sends is now fixed when the save is planned (`step.sent`), and later inserts rewrite temporary parent ids in those planned rows. A photograph whose framing or compression finishes during a save waits for the save to finish (`whenIdle`) before it changes the row. A reused original carries its `sourceUploaded` flag, so a retry does not upload it again into an `upsert: false` collision. Regression in `test:admin`: with an earlier step held, the old code wrote `hero.main/….webp` with 0 uploads and marked it saved. The new code sends the planned row, leaves the photograph pending, and the next save uploads both files before naming them.
- N2: `test:sweep` is part of `npm test`. memory.md and README now say 31 harnesses (`check:memory` passes).
- N4: `cms-client.js` dedupes by `id` and restarts the read (three tries) when the total changes between pages. `data.js` restarts on a changed `Content-Range` total. The public selects carry no `id`, so they cannot dedupe. Two new `test:sweep` checks cover this; the public one fails on the old code (a row doubled and a row missing).
- N5: the audit viewer shows the newest page right away and fills in older history underneath, with a "Loading older history…" message, via an `onPage` callback. Rows cleared during a load are not brought back by pages read before the clear. The full history is still fetched, now progressively; search covers everything once loading finishes.
- N6: `npm audit fix` changed only the lockfile: nanoid 3.3.19 and undici 7.30.0. `npm audit` reports 0 vulnerabilities.
- N7: `revertRow` returns early while saving, and `#changes` is inert during a save. Covered by a `test:admin` regression.
- N8: `tools/bake-photos.mjs` reads `photos` in ordered pages of 200, using the same end condition as `data.js`.
- N3: closed. On 2026-10-03 the user decided `architecture.md` stays untracked, and `.gitignore` is unchanged.
- Verification: full `npm test` (31 harnesses) passed, `vite build` passed with `cms-client.js` in `dist/`, `git diff --check` was clean, and `node --check` passed on the changed scripts. Nothing was committed, pushed, deployed, or written to live data. Visual QA of the audit viewer's progressive load is left to the user.
