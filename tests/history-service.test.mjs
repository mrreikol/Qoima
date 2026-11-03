import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { createStockHistoryService } from "../src/services/stockHistoryService.js";
import { historyDateBounds } from "../src/data/stockHistory.js";

const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const activeId = "11111111-1111-4111-8111-111111111111",
  archivedId = "22222222-2222-4222-8222-222222222222";
const fixtureId = (index) =>
  `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

test("history service: real SDK requests against offline PostgreSQL fixtures (not remote PostgREST)", async (t) => {
  const db = new PGlite();
  let cap = 1000;
  const requests = [];
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to public;
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261102180000_inventory_foundation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users(id) values($1),($2)", [
      userA,
      userB,
    ]);
    await db.query(
      `insert into public.products(id,user_id,name,sku,is_archived) values
      ($1,$3,'Current Keyboard','A-001',false),($2,$3,$4,'LEGACY-002',true),
      ('33333333-3333-4333-8333-333333333333',$5,$4,'LEGACY-B',false)`,
      [activeId, archivedId, userA, 'Legacy (100%_*) "Dock", \\ Kit', userB],
    );
    await db.query(
      `insert into public.stock_movements(id,product_id,user_id,type,quantity_change,quantity_after,note,created_at)
      select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
        case when i%2=0 then $1::uuid else $2::uuid end,$3::uuid,
        case i%3 when 0 then 'IN' when 1 then 'OUT' else 'ADJUSTMENT' end,
        case when i%3=1 then -1 else 1 end,i,'Fixture note',
        '2026-11-03T00:00:00Z'::timestamptz-((i-1)/3)*interval '1 hour' from generate_series(1,130) i`,
      [archivedId, activeId, userA],
    );
    await db.query(
      `insert into public.stock_movements(product_id,user_id,type,quantity_change,quantity_after,created_at) values('33333333-3333-4333-8333-333333333333',$1,'IN',1,1,'2026-11-04T00:00:00Z')`,
      [userB],
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false)`,
    );

    // This adapter tests generated SDK filters and executes equivalent parameterized
    // SELECTs in local PostgreSQL. It is NOT an implementation of remote PostgREST.
    async function offlineFetch(input, init) {
      const url = new URL(typeof input === "string" ? input : input.url);
      assert.equal(url.pathname, "/rest/v1/stock_movements");
      const params = url.searchParams;
      requests.push(new URL(url));
      assert.equal(params.get("order"), "created_at.desc,id.desc");
      assert.match(
        params.get("select"),
        /product:products!stock_movements_product_owner_fkey!inner/,
      );
      assert.match(new Headers(init?.headers).get("prefer"), /count=exact/);
      const values = [];
      const where = [];
      const parameter = (value) => {
        values.push(value);
        return `$${values.length}`;
      };
      for (const [key, column] of [
        ["user_id", "m.user_id"],
        ["product_id", "m.product_id"],
        ["type", "m.type"],
      ]) {
        if (params.has(key)) {
          assert.ok(params.get(key).startsWith("eq."));
          where.push(`${column}=${parameter(params.get(key).slice(3))}`);
        }
      }
      for (const value of params.getAll("created_at")) {
        const op = value.startsWith("gte.")
          ? ">="
          : value.startsWith("lt.")
            ? "<"
            : null;
        assert.ok(op);
        where.push(
          `m.created_at ${op} ${parameter(value.slice(value.indexOf(".") + 1))}::timestamptz`,
        );
      }
      if (params.has("product.or")) {
        const match = params
          .get("product.or")
          .match(
            /^\(name\.imatch\.("(?:\\.|[^"\\])*"),sku\.imatch\.("(?:\\.|[^"\\])*")\)$/s,
          );
        assert.ok(
          match,
          "product search must be a quoted OR over two product fields",
        );
        const unquote = (value) =>
          value.slice(1, -1).replace(/\\(["\\])/g, "$1");
        assert.equal(unquote(match[1]), unquote(match[2]));
        const placeholder = parameter(unquote(match[1]));
        where.push(`(p.name ~* ${placeholder} or p.sku ~* ${placeholder})`);
      }
      const offset = Number(params.get("offset") || 0),
        limit = Math.min(Number(params.get("limit")), cap);
      assert.ok(
        Number.isInteger(offset) &&
          offset >= 0 &&
          Number.isInteger(limit) &&
          limit > 0,
      );
      const base = `from public.stock_movements m join public.products p on p.id=m.product_id and p.user_id=m.user_id where ${where.join(" and ")}`;
      const count = (
        await db.query(`select count(*)::integer as count ${base}`, values)
      ).rows[0].count;
      const result = await db.query(
        `select m.id,m.product_id,m.type,m.quantity_change,m.quantity_after,m.note,m.created_at,
        jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'is_archived',p.is_archived) as product ${base}
        order by m.created_at desc,m.id desc offset $${values.length + 1} limit $${values.length + 2}`,
        [...values, offset, limit],
      );
      return new Response(JSON.stringify(result.rows), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": result.rows.length
            ? `${offset}-${offset + result.rows.length - 1}/${count}`
            : `*/${count}`,
        },
      });
    }
    const client = createClient(
      "https://stockmate-history.invalid",
      "sb_publishable_OFFLINE_TEST",
      {
        global: { fetch: offlineFetch },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const service = createStockHistoryService(client);
    const options = { userId: userA };
    await t.test(
      "all 130 records remain reachable in deterministic pages including timestamp ties",
      async () => {
        const ids = [];
        for (let page = 1; page <= 6; page++) {
          const result = await service.loadPage({
            ...options,
            page,
            pageSize: 25,
          });
          assert.equal(result.count, 130);
          assert.equal(result.rows.length, page === 6 ? 5 : 25);
          ids.push(...result.rows.map((row) => row.id));
        }
        assert.equal(new Set(ids).size, 130);
        assert.deepEqual(ids.slice(0, 3), [
          fixtureId(3),
          fixtureId(2),
          fixtureId(1),
        ]);
        assert.equal(ids.at(-1), fixtureId(130));
      },
    );
    await t.test(
      "SKU search spans the entire archived history, beyond the old newest-100 window",
      async () => {
        const result = await service.loadPage({
          ...options,
          query: "legacy-002",
          page: 3,
          pageSize: 25,
        });
        assert.equal(result.count, 65);
        assert.equal(result.rows.length, 15);
        assert.ok(
          result.rows.every(
            (row) =>
              row.product.is_archived && row.product.sku === "LEGACY-002",
          ),
        );
        assert.ok(result.rows.some((row) => row.id === fixtureId(130)));
      },
    );
    await t.test(
      "literal name search safely handles wildcard, regex and filter-grammar characters",
      async () => {
        const result = await service.loadPage({
          ...options,
          query: '(100%_*) "Dock", \\ Kit',
        });
        assert.equal(result.count, 65);
        assert.ok(result.rows.every((row) => row.product.is_archived));
        const none = await service.loadPage({
          ...options,
          query: '"),id.gt.0,(name.imatch.".*',
        });
        assert.equal(none.count, 0);
        assert.deepEqual(none.rows, []);
      },
    );
    await t.test(
      "product, movement type, date and name/SKU search combine before range/count",
      async () => {
        const result = await service.loadPage({
          ...options,
          query: "LEGACY",
          productId: archivedId,
          type: "ADJUSTMENT",
          startDate: "2026-11-02",
          endDate: "2026-11-02",
        });
        assert.ok(result.count > 0);
        assert.ok(result.rows.length > 0);
        for (const row of result.rows) {
          assert.equal(row.product_id, archivedId);
          assert.equal(row.type, "ADJUSTMENT");
          const date = new Date(row.created_at);
          assert.equal(date.getFullYear(), 2026);
          assert.equal(date.getMonth(), 10);
          assert.equal(date.getDate(), 2);
        }
      },
    );
    await t.test(
      "local-day range includes midnight and its final microsecond but excludes next midnight",
      async () => {
        const bounds = historyDateBounds("2026-11-03", "2026-11-03");
        // Owner connection is used ONLY to seed isolated local boundary fixtures.
        await db.exec("reset role; begin");
        await db.query(
          `insert into public.stock_movements(id,product_id,user_id,type,quantity_change,quantity_after,note,created_at) values
        ('90000000-0000-4000-8000-000000000001',$1,$2,'IN',1,1,'Boundary start',$3::timestamptz),
        ('90000000-0000-4000-8000-000000000002',$1,$2,'IN',1,1,'Boundary final microsecond',$4::timestamptz-interval '1 microsecond'),
        ('90000000-0000-4000-8000-000000000003',$1,$2,'IN',1,1,'Boundary excluded end',$4::timestamptz)`,
          [activeId, userA, bounds.startUTC, bounds.endExclusiveUTC],
        );
        await db.exec("set local role authenticated");
        const result = await service.loadPage({
          ...options,
          productId: activeId,
          startDate: "2026-11-03",
          endDate: "2026-11-03",
          pageSize: 100,
        });
        assert.ok(result.rows.some((row) => row.note === "Boundary start"));
        assert.ok(
          result.rows.some((row) => row.note === "Boundary final microsecond"),
        );
        assert.ok(
          !result.rows.some((row) => row.note === "Boundary excluded end"),
        );
        await db.exec("rollback; set role authenticated");
      },
    );
    await t.test(
      "a small project API row cap does not silently skip part of a history page",
      async () => {
        const expected = await service.loadPage({
          ...options,
          page: 2,
          pageSize: 25,
        });
        cap = 7;
        const before = requests.length;
        const result = await service.loadPage({
          ...options,
          page: 2,
          pageSize: 25,
        });
        cap = 1000;
        assert.equal(result.rows.length, 25);
        assert.deepEqual(
          result.rows.map((row) => row.id),
          expected.rows.map((row) => row.id),
        );
        assert.ok(requests.length - before > 1);
      },
    );
    await t.test(
      "ordinary-user local RLS prevents another owner filter from returning foreign fixtures",
      async () => {
        const result = await service.loadPage({ userId: userB });
        assert.equal(result.count, 0);
        assert.deepEqual(result.rows, []);
      },
    );
  } finally {
    await db.close();
  }
});
