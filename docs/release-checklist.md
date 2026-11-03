# Release checklist

This checklist separates local execution from the project owner's real Supabase verification. Real-project checks below are **user-reported**, not re-executed during publication preparation. There is no published repository URL, live deployment or hosted verification claim.

## Completed automated checks

- [x] Local authorization/stock/deletion SQL suites use isolated PGlite fixtures with ordinary authenticated roles, owner read-back, rollback assertions and positive controls. No remote inventory is used.
- [x] Offline SDK/service tests cover complete multipage product/history/export reads, combined filters, local/DST date boundaries, stale requests, cents calculations and archived visibility.
- [x] Stock client tests preserve the original operation UUID and inputs across ambiguous outcomes; export tests preserve literal text, Unicode, leading-zero SKUs and numeric prices.
- [x] Appearance tests cover before-paint initialization, default System, saved modes, OS changes, unavailable storage and subscriptions.
- [x] Production graph checks verify no static cycles, no chart/Products/Excel in auth boot and no application boot dependency in the standalone writer. Route failure markup and SPA configuration are checked locally.
- [x] Publication tests verify Git ignore rules in disposable repositories, exact index reads despite different working-tree contents, private-artifact exclusions and secret-scan classification/redaction.
- [x] Local test, lint and production build results are recorded in the publication verification section below. The optional XLSX bundle warning remains visible; thresholds are unchanged.
- [x] Full and production-only npm audits completed. Remaining moderate finding applicability and the absence of a supported compatible fix are documented in [dependency-review.md](dependency-review.md). Audit does not pass with zero findings.

PGlite has one database connection here. None of these tests proves independent-session PostgreSQL lock scheduling or current hosted Supabase settings.

## Completed real Supabase checks — reported by the project owner

- [x] Registration, email confirmation, login/logout, persistent sessions, protected routes and password recovery.
- [x] Persistent products/categories, metadata editing, archival, stock operations, dashboard calculations, CSV/XLSX exports and Settings.
- [x] Two-account authorization: cross-user reads/known IDs, owner read-back after denied edits/archive, foreign-category denial, direct quantity/ownership/history restrictions and allowed own writes.
- [x] Real HTTP stock concurrency: no overselling, idempotent retries, conflicting UUID rejection and cross-product UUID protection. These HTTP results are distinct from a controlled database-session lock-wait test.
- [x] History search, combined filters, local dates and archived-product visibility.
- [x] Category-deletion migration applied and deletion works in the real application. Independent-session category races and genuine lost-response deletion recovery are not implied by this check.

## Completed local production-preview checks — previous optimization stage

- [x] Desktop signed-out login, forgot-password navigation, expired reset-link state and direct protected product URL redirect.
- [x] Deliberately missing AuthPage chunk displays Page unavailable; explicit Reload page restores sign-in when the chunk becomes available.
- [x] Actual production writer generates/downloads a fictional XLSX, independently read back for string SKU/Unicode/formula-like text and numeric quantities/prices.

These checks used local preview/static fixtures, not a deployed site. No new browser pass or real Supabase mutation is claimed for publication preparation. Historical local captures are deliberately excluded from the public repository.

## Remaining authenticated production-preview and mobile checks

- [ ] Sign in to the current optimized production preview and visit Dashboard, Products/details, Categories, History and Settings; check account switching, expiry and sign-out without stale inventory.
- [ ] Verify **real History pagination beyond one page**: visit later pages, compare complete counts/order, combine product/type/search/date filters, include archives, and reset filters. Existing offline multipage tests do not close this real-app gap.
- [ ] Exercise a **genuine uncertain stock response** after the server may have committed. Keep the recorded UUID/payload, reload/resume, retry identically and confirm exactly one balance change and movement. Do not create a new UUID to dismiss an uncertain request. Local SQL/client/HTTP retry tests are completed evidence, but this end-to-end UI scenario remains outstanding.
- [ ] On a later separately authorized isolated-data pass, verify category-deletion lost-response recovery: successful refresh before another attempt, closure if source is gone, refreshed explicit choice if present, and blocked retry after a failed refresh.
- [ ] At 390 px and on a physical mobile device, check login/registration/recovery, navigation, tables/menus, long forms and stock/category dialogs, scrolling, keyboard focus/Escape/return and accessible labels.
- [ ] Check Light/Dark/System on actual devices, including OS changes, cold reload and no first-paint flash. Previous fixture and automated checks are not a fresh mobile production pass.
- [ ] Recheck current-filter CSV/XLSX downloads from the optimized signed-in application, including multiple pages and regional Excel import. The isolated production writer check does not cover authenticated data loading in that browser pass.
- [ ] Run the prepared independent-session category test specification in a dedicated disposable local PostgreSQL environment; see [category-verification.md](category-verification.md). Do not claim a concurrency pass from queued PGlite promises.

Any future check requiring fixture mutations needs a separate explicit authorization and isolated test data; this checklist does not authorize remote mutations.

## Hosted checks — only after a future deployment

- [ ] Configure the intended environment's two public Vite variables and exact Supabase Site URL/confirmation/recovery allowlist for the actual origin. Do not use privileged browser keys or alter database permissions to resolve configuration errors.
- [ ] Open and refresh `/products/:id`, `/dashboard`, `/history` and `/reset-password` directly. Confirm signed-out redirects and signed-in deep links work through Vercel SPA routing.
- [ ] Verify real confirmation/reset email links, expired links, session persistence and account switching on the hosted origin.
- [ ] Check static assets/MIME types, real 404 for absent `/assets/*`, HTML/appearance revalidation and clear manual recovery for a stale chunk after a later deployment.
- [ ] Repeat mobile/keyboard/theme and download checks on the hosted origin; inspect console/network failures without exposing credentials.
- [ ] Re-run current audits and decide release acceptance/tracking for remaining findings. Confirm migration state rather than automatically reapplying files.

## Publication preparation verification

- November 3, 2026: **87 local tests passed**, `npm run lint` passed and `npm run build` passed. The regenerated production report matches emitted JS bytes/gzip. No dependency or application/database behavior change was made during this publication stage; changes are repository hygiene, documentation, metadata and release-check tooling/tests.
- Fresh repository initialized in the existing project with `main`; no repository/history existed in the project or parent directories. No previous local commits are assumed.
- Local environment/authentication data, fixture manifests, installed tools, generated builds, previews, private captures and workbooks are excluded without deleting local files. Only sanitized before/after bundle metadata is allowlisted under artifacts.
- `.env.example` contains the two expected empty assignments. The existing Git name/email are used without modification.
- Exact staged-index verification reviewed 132 intended paths (131 text files plus the licensed font binary), with no secret/private-file findings. The staged diff was reviewed; its two extra EOF blank lines were removed before the final whitespace check. Working-tree scanning was not used as a substitute for index verification.
- A new root commit has no earlier history to scan. Review the resulting committed tree too; no remote is added, pushed or deployed by this task.

The secret checker is heuristic. Passing it, passing tests or having RLS does not certify that the application or all dependencies are secure. The owner must also decide whether to add a project-wide license before offering reuse; the bundled font license is preserved.
