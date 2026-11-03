# Qoima — Digital Warehouse

Qoima is an inventory web application for small businesses and individual stock owners. Manage products, record receipts and removals, reconcile counted quantities, and review the history of every stock change. Each signed-in account owns its inventory.

## Features

- Email/password authentication, email confirmation, persistent sessions, sign-out and password recovery; protected inventory routes.
- Products with SKU, description, category, minimum stock, cost/selling prices, detail views and archival. Metadata editing never changes quantity.
- Categories with creation, rename and confirmed deletion: move all affected active/archived products to another owned category or leave them uncategorized. Products and history are retained.
- Clearly separated Stock in, Stock out and Adjust stock operations with validation, previews, atomic database writes and uncertain-request recovery.
- Current active-product dashboard totals, inventory cost value, low-stock warnings and real 7/30-day movement charts. Zero stock is distinguished from positive low stock; the attention threshold is quantity <= minimum stock.
- Server-paginated history with full product-name/SKU search, product/type/date filters and archived-product visibility. Reporting uses browser-local calendar days converted to UTC query boundaries.
- Searchable/filterable/sortable products and complete matching CSV/Excel exports.
- Account email, password-reset email, sign-out and browser-local Light / Dark / System appearance in Settings. System is the default and follows OS changes; initialization runs before first paint.

## Stack

React 19, JavaScript, Vite 8, React Router, Tailwind CSS 4, Lucide React and Supabase Auth/PostgreSQL. The activity chart uses local SVG code. Excel generation uses a lazily loaded DevExtreme ExcelJS browser bundle. Tests use Node's test runner and isolated PGlite databases.

## Local setup

Use Node.js 22.21.1 or newer supported LTS and npm. This project was checked with Node 24.21.0 and npm 11.19.0.

For a fresh checkout:

```powershell
npm ci
Copy-Item .env.example .env.local
```

Populate the root `.env.local` locally:

| Variable | Required value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key beginning with `sb_publishable_` |

Never use a Supabase secret/service-role key. Local environment files are ignored; `.env.example` contains only the empty variable assignments. Vite deliberately includes the public URL/publishable key in browser code; isolation is enforced by database permissions and RLS. Missing configuration shows a setup screen, never demo authentication.

Enable email/password authentication in your Supabase project. For local development, set the Site URL to `http://localhost:5173` and allow these redirect URLs:

- `http://localhost:5173/dashboard` — registration/email confirmation.
- `http://localhost:5173/reset-password` — password recovery.

If the origin or port differs, configure its matching URLs. Then apply the pending migrations below and start the app:

```powershell
npm run dev
```

Use the URL printed by Vite. Restart Vite after editing environment values. Do not overwrite an existing `.env.local` when updating an existing checkout.

## Database setup

Review and run complete pending files once, in this order, in your intended project's Supabase SQL Editor:

1. [Inventory foundation](supabase/migrations/20261102180000_inventory_foundation.sql): tables, ownership constraints, RLS/grants and `create_product`.
2. [Stock operations](supabase/migrations/20261103090000_stock_operations.sql): `change_stock` and user-scoped idempotency records.
3. [Category deletion](supabase/migrations/20261103193000_category_deletion.sql): transactional reassignment and `delete_category`.

The application and tests do not apply remote migrations. Do not rerun or edit applied migrations; use a new versioned migration for later changes. The project owner has confirmed all three applied and category deletion working in the existing development project.

### Transactions and user isolation

All inventory tables use RLS. Ownership is derived from `auth.uid()` in privileged RPCs; composite ownership constraints prevent foreign-category assignment. Client grants prohibit direct quantity/ownership changes, movement writes and category deletion. RPCs use qualified objects, a safe search path and authenticated-only execution.

Product creation atomically records an initial receipt when quantity is positive. Stock operations lock the product before calculating: IN adds a positive amount; OUT subtracts a positive amount and rejects insufficient stock; ADJUSTMENT sets an Actual quantity (including zero), requires a meaningful note, and records the signed difference. Archived products reject new stock operations. Balance, movement and operation receipt commit together or roll back together.

Each stock request has a client-generated UUID. Identical retries return the original receipt; conflicting reuse fails. An uncertain outcome retains the original UUID and inputs in per-account browser session storage. Refresh/resume the recorded request instead of submitting a new operation. Browser-local recovery storage is not a server backup and can be lost if the tab/storage is discarded. See [stock verification and recovery](docs/stock-verification.md) and [authorization verification](docs/authorization-verification.md).

Category deletion locks categories in deterministic UUID order, processes current active/archived products and deletes the category in one transaction. Counts are previews. On a failed or uncertain result, the UI refreshes inventory before allowing another explicit confirmation. Stock quantities, movements and idempotency records are preserved.

## Export and appearance

Products > Export offers Excel (.xlsx) and standard CSV (.csv). Both fetch all products matching the current search, category, stock-status and active/archived filters, in the current sort order, through ordinary authenticated permissions. Export is a fresh read, not a transactional snapshot across concurrent edits. No internal user IDs or recovery data are exported.

CSV uses comma delimiters, UTF-8 BOM, correct quoting/newlines and two-decimal prices, with formula-injection protection for user text. If regional Excel opens CSV in one column, use Excel export or Data > From Text/CSV with UTF-8 and comma selected; import SKU as Text to preserve leading zeros. XLSX stores SKU/text as string cells, never formulas, and quantities/prices as numeric cells. It includes two-decimal prices, bold headers, widths, frozen headers and autofilter. The writer loads only when Excel is requested.

Appearance is selected only in Settings and persists on this browser, including signed-out screens. The self-hosted Inter font and its [SIL OFL license](src/assets/fonts/Inter-OFL.txt) are included; no external font request is needed. A project-wide open-source license has not been selected; no additional reuse permission is implied.

## Checks

```powershell
npm run build
node scripts/report-build.mjs after
npm test
npm run lint
npm run check:release-files
npm run check:release-files -- --staged
npm audit
npm audit --omit=dev
npm run preview
```

The build report is metadata only; it supplies the production chunk-graph regression test. Regenerate `after` after source/build changes. The committed `before.json` is the archived optimization baseline. `npm test` uses isolated local fixtures and does not contact or mutate remote Supabase. Remote verification scripts are disabled by default and require a separate explicit fixture-mutation decision; never run them against business inventory.

The release-file checker prints paths and finding categories, never values. Staged mode reads the Git index, not potentially different working-tree contents. It is a heuristic check, not a complete or historical secret audit. Do not commit local credentials, browser sessions, verification manifests or private screenshots. See the [release checklist](docs/release-checklist.md) for executed checks and outstanding verification.

## Deploying to Vercel later

No deployment or live demo is provided by this repository. When you decide to deploy:

1. Publish the reviewed repository yourself and import it into Vercel. Use the repository root, Vite framework, install command `npm ci`, build command `npm run build` and output directory `dist`.
2. Configure the two public `VITE_SUPABASE_*` variables in the intended Vercel environment before building. Never upload `.env.local` or configure a privileged key.
3. Review [vercel.json](vercel.json): real static files are served first, missing `/assets/*` return 404, and application routes fall back to `index.html`. HTML/appearance initialization assets revalidate.
4. Configure the eventual production Site URL and exact confirmation/recovery redirect URLs in Supabase, including `/dashboard` and `/reset-password` on that origin. Treat preview origins separately; do not assume localhost settings cover production.
5. Perform the hosted checks in the release checklist, including direct product-detail/reset URLs, refresh, email links and missing-chunk recovery.

## Known limitations

- One account owns each inventory; shared workspaces, staff roles, permanent product deletion and archived-product restoration are not implemented.
- The optional XLSX chunk still exceeds Vite's size warning threshold. Routes/chart code are lazy; warning thresholds have not been raised.
- A moderate minimatch advisory remains in installed dependency paths with no verified compatible parent update. Browser export does not use the affected Node streaming/glob path; lint uses trusted local patterns. See the dated [dependency review](docs/dependency-review.md). Audit results are not a security guarantee.
- Real multi-page History, authenticated production-preview/mobile checks and a genuine uncertain-request recovery UI pass remain outstanding. PGlite's single connection does not prove concurrent PostgreSQL locking; the category isolation-test specification remains unexecuted.
- No hosted routing, production email flow or live deployment is claimed. Previous real Supabase checks are identified as user-reported, separately from local automated tests.
