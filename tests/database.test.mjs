import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

for (const suite of [
  {
    name: "inventory migration and database security regression suite",
    file: "inventory_security.sql",
  },
  {
    name: "two-user authorization: known IDs, owner read-back, denied writes and positive controls",
    file: "two_user_authorization.sql",
  },
  {
    name: "stock operations: semantics, authorization, atomicity and idempotent replay",
    file: "stock_operations.sql",
    stock: true,
  },
]) {
  test(suite.name, async () => {
    const db = new PGlite();
    try {
      // Minimal local auth fixture. Remote tests use real Supabase auth.uid()/auth.users.
      await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to public;
      -- Reproduce Supabase's permissive defaults to verify the migration revokes them.
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant execute on functions to anon, authenticated;
    `);
      const migration = await readFile(
        new URL(
          "../supabase/migrations/20261102180000_inventory_foundation.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(migration);
      if (suite.stock)
        await db.exec(
          await readFile(
            new URL(
              "../supabase/migrations/20261103090000_stock_operations.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
      await db.exec(await readFile(new URL(
        "../supabase/migrations/20261103193000_category_deletion.sql", import.meta.url), "utf8"));
      const checks = await readFile(
        new URL(`../supabase/tests/${suite.file}`, import.meta.url),
        "utf8",
      );
      const results = await db.exec(checks);
      assert.ok(
        results.some((result) =>
          result.rows.some((row) => row.test_result?.startsWith("PASS:")),
        ),
      );
      const users = await db.query(
        "select count(*)::integer as count from auth.users",
      );
      assert.equal(
        users.rows[0].count,
        0,
        "security suite must roll back its fixture users",
      );
      const products = await db.query(
        "select count(*)::integer as count from public.products",
      );
      assert.equal(
        products.rows[0].count,
        0,
        "security suite must roll back its fixture inventory",
      );
    } finally {
      await db.close();
    }
  });
}
