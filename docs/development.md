# Development guide

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

1. [Inventory foundation](../supabase/migrations/20261102180000_inventory_foundation.sql): tables, ownership constraints, RLS/grants and `create_product`.
2. [Stock operations](../supabase/migrations/20261103090000_stock_operations.sql): `change_stock` and user-scoped idempotency records.
3. [Category deletion](../supabase/migrations/20261103193000_category_deletion.sql): transactional reassignment and `delete_category`.

The application and tests do not apply remote migrations. Do not rerun or edit applied migrations; use a new versioned migration for later changes. The project owner has confirmed all three applied and category deletion working in the existing development project.

### Transactions and user isolation

All inventory tables use RLS. Ownership is derived from `auth.uid()` in privileged RPCs; composite ownership constraints prevent foreign-category assignment. Client grants prohibit direct quantity/ownership changes, movement writes and category deletion. RPCs use qualified objects, a safe search path and authenticated-only execution.

Product creation atomically records an initial receipt when quantity is positive. Stock operations lock the product before calculating: IN adds a positive amount; OUT subtracts a positive amount and rejects insufficient stock; ADJUSTMENT sets an Actual quantity (including zero), requires a meaningful note, and records the signed difference. Archived products reject new stock operations. Balance, movement and operation receipt commit together or roll back together.

Each stock request has a client-generated UUID. Identical retries return the original receipt; conflicting reuse fails. An uncertain outcome retains the original UUID and inputs in per-account browser session storage. Refresh/resume the recorded request instead of submitting a new operation. Browser-local recovery storage is not a server backup and can be lost if the tab/storage is discarded. See [stock verification and recovery](stock-verification.md) and [authorization verification](authorization-verification.md).

Category deletion locks categories in deterministic UUID order, processes current active/archived products and deletes the category in one transaction. Counts are previews. On a failed or uncertain result, the UI refreshes inventory before allowing another explicit confirmation. Stock quantities, movements and idempotency records are preserved.

## Export and appearance

Products > Export offers Excel (.xlsx) and standard CSV (.csv). Both fetch all products matching the current search, category, stock-status and active/archived filters, in the current sort order, through ordinary authenticated permissions. Export is a fresh read, not a transactional snapshot across concurrent edits. No internal user IDs or recovery data are exported.

CSV uses comma delimiters, UTF-8 BOM, correct quoting/newlines and two-decimal prices, with formula-injection protection for user text. If regional Excel opens CSV in one column, use Excel export or Data > From Text/CSV with UTF-8 and comma selected; import SKU as Text to preserve leading zeros. XLSX stores SKU/text as string cells, never formulas, and quantities/prices as numeric cells. It includes two-decimal prices, bold headers, widths, frozen headers and autofilter. The writer loads only when Excel is requested.

Appearance is selected only in Settings and persists on this browser, including signed-out screens. The self-hosted Inter font and its [SIL OFL license](../src/assets/fonts/Inter-OFL.txt) are included; no external font request is needed. A project-wide open-source license has not been selected; no additional reuse permission is implied.

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

The release-file checker prints paths and finding categories, never values. Staged mode reads the Git index, not potentially different working-tree contents. It is a heuristic check, not a complete or historical secret audit. Do not commit local credentials, browser sessions, verification manifests or private screenshots. See the [release checklist](release-checklist.md) for executed checks and outstanding verification.

## Vercel deployment

The project owner provides the [live demo](https://qoima-nine.vercel.app) and [GitHub repository](https://github.com/mrreikol/Qoima). Their presence does not mark every hosted verification item complete. No deployment or Supabase setting change was performed while preparing these screenshots.

For a new deployment or another environment:

1. Import the repository into Vercel using its root directory, Vite framework, install command `npm ci`, build command `npm run build` and output directory `dist`.
2. Set the two public `VITE_SUPABASE_*` variables before building. Never upload `.env.local` or configure a privileged browser key.
3. Review [vercel.json](../vercel.json): static files are served first, missing `/assets/*` return 404, and application routes fall back to `index.html`. HTML/appearance assets revalidate.
4. Configure the intended Supabase Site URL and exact `/dashboard` and `/reset-password` redirects on that origin. Treat preview origins separately from localhost and production.
5. Complete the hosted checks in [release-checklist.md](release-checklist.md), including direct URLs, real email links, mobile behavior, exports and stale-chunk recovery.

## Verification and limitations

See the [release checklist](release-checklist.md) for completed local checks, user-reported real Supabase checks and remaining work. Real multi-page History, genuine uncertain-response UI recovery and authenticated production-preview/mobile checks remain outstanding. PGlite's single connection does not establish concurrent database locking; the [category concurrency procedure](category-verification.md) remains prepared, not executed.

The optional Excel chunk exceeds Vite's warning threshold. The dated [dependency review](dependency-review.md) documents the remaining minimatch advisory and current-path applicability; re-run audits for up-to-date results. No shared workspace/staff roles, permanent product deletion or archived-product restore feature is implemented. Public screenshots illustrate the interface with isolated fictional data and do not constitute hosted/authentication verification.
