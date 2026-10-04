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
