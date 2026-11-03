# Category deletion verification

`supabase/migrations/20261103193000_category_deletion.sql` follows the unchanged foundation and stock migrations. The project owner reports that it is applied and deletion works in the real application. This publication task does not apply it or mutate remote inventory.

## Local automated evidence

`npm test` applies all migrations to isolated PGlite fixtures. Ordinary-user requests verify empty deletion, active/archived moves to another owned category or uncategorized, ownership/authentication rejection, invalid destinations, direct-delete denial and a stale empty-category preview. A failure injected after product reassignment proves transaction rollback. Product fields/quantities, movements and stock-operation receipts are compared before/after. Service, preview/filter, refresh-before-retry and dialog markup checks are separate local tests.

PGlite uses one connection in this suite. It does not prove concurrent lock scheduling. `supabase/tests/category_concurrency.spec` is prepared, but has not been executed or assigned a verified expected-output baseline.

## Independent-session procedure, not yet executed

Use only a dedicated disposable **local** PostgreSQL database with Supabase-compatible `auth.users`, `auth.uid()`, roles and all three migrations. Never point this fixture specification at remote or existing business inventory. Fixture setup/cleanup uses a control connection with setup permission; the two operation sessions switch explicitly to `authenticated` and set the fixture subject.

Build PostgreSQL's `isolationtester` from `src/test/isolation` following the official [runner instructions](https://github.com/postgres/postgres/blob/master/src/test/isolation/README). With local authentication configured, run from the project root in Windows Command Prompt:

```cmd
isolationtester "host=127.0.0.1 port=5432 dbname=qoima_category_disposable" < supabase\tests\category_concurrency.spec > category-concurrency.local
```

Use a local password file or appropriate local authentication, never a password in command arguments/chat. The specification uses fixed fixture IDs and eight scheduled permutations for creation, reassignment, moving out and reversed overlapping deletions. Review output: all assertions must complete without errors/hangs; product balances/history/operation receipts must remain intact. Do not treat an unexpected deadlock or aborted verification step as a pass.

The category RPC takes source/destination row locks in UUID order, which conflict with immediate FK key-share locks. Earlier committed assignments are included; later references to a deleted source fail. Ordinary metadata writes can still cause a deadlock/serialization abort; the complete deletion rolls back. The UI refreshes and requires another explicit confirmation rather than blindly replaying deletion.

## Remaining UI verification

With separately authorized isolated test inventory, check both nonempty choices (including archives), empty confirmation, cancellation, excluded source destination, deleted-filter reset and retained detail/history/export data. For genuine response loss, refresh first: if the category is gone, do not offer deletion again; if it remains, review the latest count and reconfirm only after a successful refresh. A failed refresh must keep retry blocked. This genuine lost-response flow and independent-session category concurrency remain unconfirmed; basic real-app deletion alone does not prove them.
