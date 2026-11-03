# Supabase authorization verification

## What the local checks prove

Run `npm test`. No real Supabase requests or credentials are used.

- `tests/database.test.mjs` creates a fresh in-memory PostgreSQL instance with PGlite for each SQL suite, installs minimal local `auth.users` and `auth.uid()` fixtures, and applies the unchanged versioned migration.
- `supabase/tests/inventory_security.sql` covers RLS/grants, normalized identifiers, initial movement atomicity and rollback, archives, and authentication requirements.
- `supabase/tests/two_user_authorization.sql` adds two isolated fixture identities, A and B. Every operation being tested runs with `current_user = authenticated` and the corresponding transaction-local `auth.uid()`. The database owner is used only for schema/fixture setup, not the tested operations.
- Both accounts are tested for cross-account reads by known product/category/movement UUID and owner-filtered lists. Cross-account edit/archive must affect zero rows; the target is then read as its owner and compared with its complete previous row, including timestamps.
- Both accounts must be denied foreign category assignment through `create_product` and a direct metadata update, direct product quantity/ownership and category ownership updates, and direct movement INSERT/UPDATE/DELETE.
- Owner-side product/category/history snapshots are compared after denials. Both accounts must also successfully create a category/product/initial IN movement, rename their category, and edit allowed product metadata without changing quantity/history.
- Each SQL suite rolls back. No existing remote users or inventory are involved. A separate CLI guard test exercises only the prepared runner's disabled default mode.

**These are PostgreSQL authorization checks with simulated auth claims, not genuine Supabase Auth logins or remote HTTP requests.** They do not prove the deployed migration, grants, PostgREST behavior, schema cache, or real sessions are correct. Do not use the SQL fixture suites as a replacement for ordinary-user remote requests: they include database-owner fixture setup and create temporary auth rows.

## Prepared remote verification: not executed during this review

The executable procedure is `scripts/verify-authorization.mjs`. Merely reading it or running it without the opt-in flag does not load environment files, authenticate, contact Supabase, or mutate data:

```sh
node scripts/verify-authorization.mjs
```

The current review authorizes **no remote run**. Schedule the following steps only after a separate explicit decision to run fixture mutations against the selected development project.

### Before a later explicit run

1. Use a development Supabase project whose inventory migration has already been applied. This runner never applies migrations, changes grants/policies, or calls admin APIs.
2. Have two **existing**, distinct, email-confirmed test accounts with working email/password sign-in. The runner never registers or creates users. Keep credentials on your machine; do not send passwords or tokens in chat. This password-only runner does not implement an MFA/SSO challenge flow; do not weaken account security to use it.
3. Keep the existing `.env.local` configuration. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read. The key must begin with `sb_publishable_`; secret and service-role keys are not accepted. Do not put passwords or access/refresh tokens in that file, command arguments, scripts, or shell history.
4. Review the script, especially its fixture creation, `.eq('id', ...)` mutation filters, owner-side read-back assertions, and cleanup behavior. All mutation targets are newly created fixture IDs from this run; it does not accept an existing product/category/movement ID as input.
5. Understand the retained-data limit: normal authenticated clients cannot permanently delete products, movements or stock-operation records. This runner archives its fixture products and does not call the category-deletion RPC, retaining prefixed categories and movement history. It writes a per-run manifest with fixture UUIDs and a random `AUTHZ-...` namespace to `artifacts/authorization/AUTHZ-....local` (ignored by the existing `*.local` Git rule). The manifest has no credentials/tokens. Administrative cleanup, if desired, is a separate explicitly authorized task and must use only those recorded fixture IDs. Do not broaden DELETE grants for cleanup.

### Authenticate locally and run later

From an interactive terminal on your own machine:

```powershell
Set-Location C:\Projects\stockmate
node scripts/verify-authorization.mjs --run-remote-fixtures
```

The explicit flag authorizes creation of isolated category/product fixtures, prohibited-write attempts against only those fixtures, and fixture archival on completion. This is **not a read-only command**. Do not run it during a review that prohibits remote mutations.

The terminal prompts for A's email/password and then B's email/password. Input is hidden and retained only in process memory. Press Escape or Ctrl+C to cancel. Do not copy the credentials into chat or pass them as arguments. Two independent Supabase clients sign in with `persistSession: false`, `autoRefreshToken: false`, and `detectSessionInUrl: false`. `auth.getUser()` verifies each actual session, the JWT database role must be `authenticated`, and the identities must differ. No application browser session or elevated credential is reused.

The runner suppresses raw SDK diagnostics and prints fixed PASS/FAIL labels instead of response bodies, exception stacks, URLs, keys, auth payloads, tokens, or comparison diffs. At the end it signs out only its own newly established sessions using local scope; it does not deliberately sign out your other browser sessions.

### Assertions performed by the remote runner

1. Both accounts create their own uniquely prefixed category and product through normal authenticated requests, with positive initial stock and exactly one matching IN movement.
2. Both accounts rename their own category and edit allowed product metadata; owner reads verify actual values, quantity stability, and unchanged movement history.
3. Each account tries reading the other's three fixture rows by known UUID and an owner-filtered listing constrained to fixture IDs: results must be empty.
4. Each account attempts to edit and archive the other's fixture product. A permission denial or an error-free empty result is acceptable **only if the owner's complete product row remains exactly unchanged**. A no-error response on its own is never treated as evidence of a successful update or of security.
5. Foreign-category creation through `create_product` and direct assignment to an existing own product must both fail with `23503`. Failed creation must leave no product for its unique fixture SKU.
6. Direct quantity/product ownership and category ownership updates must fail with `42501`.
7. Direct movement INSERT/UPDATE/DELETE must fail with `42501`. Owner-side product/category/history snapshots must remain unchanged after all denied operations.

Only completion of these real HTTP assertions earns the remote PASS line. A syntax check, disabled-mode invocation, local SQL suite, or successful build is not remote proof.

### If a later run fails or is interrupted

- A FAIL label is a failed check, not permission to weaken security. Investigate the deployed migration/grants/policies and whether the intended project/schema was used.
- If connectivity fails before any fixtures, nothing needs inventory cleanup. If it fails after fixture creation, inspect the per-run local manifest and locate only that run's unique `AUTHZ-...` names/SKUs; a request might have committed before its response was lost.
- The finally block attempts to archive only tracked fixture products. It never deletes movements/categories/products or modifies existing inventory. Interrupted processes, network failures, or a real authorization regression may leave unarchived test fixtures. The manifest is retained for manual review.
- Do not rerun blindly using existing fixture IDs. Each explicit run creates a new namespace and manifest. Do not publish the terminal's session state or local credentials.

## Review status

The local SQL suites and disabled runner can be executed without remote access. The real Supabase project remains **unverified by this review** until a separately authorized, ordinary-user remote run completes. No remote migration, user creation, or inventory mutation is part of the present task.

## SDK references

[Supabase signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), and [auth client session configuration](https://supabase.com/docs/reference/javascript/auth).
