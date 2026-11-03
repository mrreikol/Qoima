# Stock operation verification and recovery

## Migration and semantics

For an existing Stage 3 database, apply `supabase/migrations/20261103090000_stock_operations.sql` once, manually, after reviewing it. Do not rerun or modify `20261102180000_inventory_foundation.sql`. The current implementation task does not apply remote migrations or execute remote mutation checks.

`change_stock` uses normal authenticated execution privileges, derives its user ID, and locks the owned product with `FOR UPDATE` before calculating quantities. It does not grant direct quantity, ownership, history, or idempotency-table writes to clients. IN/OUT use positive amounts; ADJUSTMENT takes a nonnegative actual target with a meaningful reason. One successful new UUID produces exactly one signed movement. Exceptions roll back the quantity, movement, and operation record together.

The per-user UUID guard also handles simultaneous reuse across different products via its unique key. Successful repeated inputs return the immutable original movement. Different product/type/amount/note inputs conflict. An already completed receipt can be replayed after archival, but no new stock change is accepted for an archived product. Only committed successful operations consume an idempotency key; rejected attempts roll back their guard row too.

## Checks executable locally without network

```sh
npm test
npm run lint
npm run build
```

The stock SQL suite applies the real foundation and new migration inside a fresh local PGlite database with minimal Auth fixtures. All requests under test use the `authenticated` or `anon` role, with owner access used only for setup and fault-injection triggers. Assertions cover:

- IN, OUT, adjustments up/down/to zero, exact signed deltas, final balances, and one movement per successful operation.
- Nulls, invalid types, zero IN/OUT, negative/fractional/nonfinite/out-of-range inputs, notes, insufficient stock, no-change adjustment, and overflow.
- Owner checks, missing authentication, anonymous execution denial, private operation records, and unchanged direct-write restrictions.
- Identical sequential replay, every conflicting input field, per-user UUID namespaces, replay after an intervening movement/archival, and no writes on rejected requests.
- Forced failures at movement insertion and at the final operation-receipt link, both after the quantity update. Product rows, history, and operation counts must all roll back.

Client tests validate preview/target semantics and recovery persistence independently of React/Supabase. An isolated browser component fixture was also used during implementation: a stub committed once and simulated a lost response; the UI preserved the UUID across Keep for later and reload, retried the identical request once, and displayed a single applied operation. It also verified locked retry inputs, Actual quantity with a zero minimum and required reason, and no stock actions for archived rows. That temporary fixture was removed. This is client-workflow evidence, not a remote database or concurrency test. Guard tests invoke remote tools only in disabled mode. No local test reads credentials or calls the real project.

**PGlite has one connection here. Parallel promises on it would be a queue, not two concurrent PostgreSQL sessions. No local locking/concurrency PASS is claimed.** No `psql`, Docker PostgreSQL, or Supabase CLI server was available in the implementation environment.

## Manual UI checks after a later migration application

Use isolated newly created test products, never existing business inventory.

1. With quantity 5, stock in 3: final 8 and one +3 IN movement. Stock out 2: final 6 and one -2 OUT movement.
2. Adjust actual quantity to 10, then 4, then 0, with meaningful reasons. Verify +4, -6, -4 adjustments and correct recorded balances.
3. Check missing/fractional/zero/negative inputs, short adjustment reasons, insufficient OUT, no-change adjustment, and overflow using a separate maximum-quantity test product. Rejections must not change quantity or create history.
4. Confirm the pending button is disabled, Escape/Tab/focus handling is accessible, metadata editing has no quantity input, and archived rows have no stock actions.
5. Simulate a lost response **after** a request might reach the server. The request must remain locked with the same operation ID. Use Keep for later, navigate/reload, resume, and retry. Confirm one stock change and one movement, even if the first request committed.
6. Change another tab's stock before submitting a preview. Verify the server uses the locked latest balance; the preview warning remains visible. An OUT can fail despite an earlier sufficient snapshot.
7. Check refreshed Products, Dashboard cost totals/low-stock warnings, and Stock History. A returned replay balance is the original recorded balance, while refreshed inventory can show a newer balance.
8. As account B, try account A's product UUID and operation UUID. No row/change/receipt may leak. A and B may independently use the same operation UUID on their own products.

Do not simulate ambiguous errors by changing a request's UUID or payload. The server key must remain identical on a retry.

## Resolving an uncertain request

Keep the tab and its per-user sessionStorage recovery record. Resume the saved request and use Retry same operation. Do not manually enter a second operation, clear browser storage, or edit the saved JSON. The idempotent RPC either returns the original committed movement or safely applies the previously uncommitted request once.

If it reports an ID/input conflict, investigate with the signed-in owner's ordinary client. An own-user SELECT of `stock_operations` filtered by the saved operation UUID reveals its product/type/requested quantity/note and movement ID. Read that movement and compare exact inputs. Do not use an elevated key or alter those rows. Resolve the mismatch before explicitly clearing any stale local record; never clear it merely to silence the warning. A missing or corrupt local request requires confirming its outcome before a replacement.

Closing a browser tab can remove sessionStorage; it is intentionally not a durable offline queue. The server keeps committed receipts without expiry, but the client needs the original UUID and inputs to replay them. If those are lost, inspect authoritative history first. Stock notes stored in sessionStorage are local recovery data, not auth secrets, and are scoped by user ID.

## Prepared opt-in real HTTP concurrency test (NOT executed)

The script below is disabled by default:

```sh
node scripts/verify-stock-concurrency.mjs
```

It loads no environment and makes no network requests without its explicit flag. After a separate authorization for remote fixture mutations, and after the new migration is manually applied to the intended development project:

```powershell
Set-Location C:\Projects\stockmate
node scripts/verify-stock-concurrency.mjs --run-remote-stock-fixtures
```

This is **not read-only**. It prompts for one existing test account's email/password with hidden input and establishes two independent ordinary authenticated Auth sessions for that account. No remote users, migrations, grants, or policies are created/changed. Only the existing public project URL and `sb_publishable_` key are read locally; passwords/tokens/environment values are never printed or written to disk. Do not share them in chat or pass them as arguments. Password-only authentication does not implement an MFA/SSO challenge; do not weaken security to run it.

The runner creates three unique `STK-<random UUID>` fixture products and then launches independent concurrent HTTP requests:

- Two OUT 4 requests from quantity 5: exactly one succeeds, one reports insufficient stock, final quantity is 1, and history has one OUT plus the initial IN.
- Simultaneous IN 3 requests sharing one UUID and identical inputs: both return the same movement; later replay keeps quantity 3, one movement, and one operation row.
- Two simultaneous requests sharing a UUID with different quantities: one succeeds, one conflicts; only the winner affects stock/history.
- One UUID reused concurrently across two different products: exactly one succeeds, the other conflicts, and the losing product remains unchanged.

Only newly returned fixture IDs are mutation targets. The runner archives those fixtures at completion and signs out only its own sessions; histories and operation records remain. It records a per-run ignored manifest under `artifacts/stock-verification/STK-....local`, with fixture IDs/SKUs but no credentials. Network loss or process interruption may leave active fixtures; inspect only that run's unique prefix/manifest. Do not broaden delete permissions for cleanup.

Concurrent HTTP outcomes are meaningful real API checks, but proxy/pool scheduling can serialize arrivals. A controlled row-lock wait needs the following independent database-session check too.

## Controlled PostgreSQL lock-wait check (prepared, NOT executed)

Use two independent `psql` connections to a disposable local/staging database that already has the migrations and an isolated product owned by an existing test account. Do not run this against business rows. This section tests locking under the ordinary database role using simulated claims; the HTTP runner above separately tests actual Auth sessions. No connection passwords or tokens belong in chat or commands saved to source control.

Replace the placeholder UUIDs locally. Use the same product with balance 5, two different operation UUIDs, and a note. In session 1:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'TEST_USER_UUID', true);
select set_config('request.jwt.claims', '{"sub":"TEST_USER_UUID","role":"authenticated"}', true);
select public.change_stock('TEST_PRODUCT_UUID', 'OPERATION_1_UUID', 'OUT', 4, 'Controlled concurrency test');
-- Keep the transaction open. Do not COMMIT yet.
```

In session 2, begin/set the same ordinary role and claims, then call:

```sql
select public.change_stock('TEST_PRODUCT_UUID', 'OPERATION_2_UUID', 'OUT', 4, 'Controlled concurrency test');
```

Session 2 must wait. Commit session 1. Session 2 must then reject with `P1002`; roll back its transaction. As the owner, verify quantity 1 and exactly one OUT movement. If session 1 instead rolls back, session 2 should proceed against the original balance.

Repeat on a fresh fixture with IN 3 and the **same** operation UUID/input in both sessions: session 2 waits, then returns session 1's same movement ID after commit, with one stock addition and one movement. Repeat with the same UUID but different quantities to expect `P1004`. A final fresh fixture with different operation UUIDs and successful IN/OUT requests should reflect both changes based on serial locked balances.

Do not report these controlled checks as passed until both real sessions, the observed wait, and the final row/history assertions have actually been executed. Never use parallel PGlite calls as a substitute.
