import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { createInventoryService } from "../src/services/inventoryApi.js";
import { createStockHistoryService } from "../src/services/stockHistoryService.js";
import { createInventoryExportService } from "../src/services/inventoryExportService.js";
import { createDashboardService } from "../src/services/dashboardService.js";
import { inventoryTotals, getStatus } from "../src/data/inventory.js";
import { activityPeriod } from "../src/data/dashboard.js";
import {
  findOwnedProduct,
  productEmptyState,
} from "../src/data/productViews.js";
import {
  makeStockDraft,
  rememberStockDraft,
  readStockDraft,
  forgetStockDraft,
} from "../src/data/stockOperations.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("local workflow integrates real service requests, PostgreSQL permissions, recovery, totals, history and export", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to public;`);
    for (const name of [
      "20261102180000_inventory_foundation.sql",
      "20261103090000_stock_operations.sql",
      "20261103193000_category_deletion.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    await db.query("insert into auth.users values($1),($2)", [A, B]);
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`,
    );
    let loseNextStockResponse = true;
    const requests = [];
    // Offline adapter executes the actual migration under ordinary local roles.
    // It validates SDK request shape; it is not a remote PostgREST server.
    const client = createClient("https://offline.invalid", "offline-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input.url);
          const endpoint = url.pathname.split("/").at(-1),
            method = init?.method || "GET";
          const params = url.searchParams;
          requests.push({
            endpoint,
            method,
            offset: Number(params.get("offset") || 0),
          });
          try {
            let rows;
            if (url.pathname.includes("/rpc/")) {
              assert.ok(["create_product", "change_stock"].includes(endpoint));
              const payload = JSON.parse(init.body);
              const fields =
                endpoint === "create_product"
                  ? [
                      "p_name",
                      "p_sku",
                      "p_category_id",
                      "p_description",
                      "p_initial_quantity",
                      "p_min_stock",
                      "p_cost_price",
                      "p_selling_price",
                    ]
                  : [
                      "p_product_id",
                      "p_operation_id",
                      "p_type",
                      "p_quantity",
                      "p_note",
                    ];
              assert.deepEqual(Object.keys(payload).sort(), [...fields].sort());
              rows = (
                await db.query(
                  `select * from public.${endpoint}(${fields.map((field, index) => `${field} => $${index + 1}`).join(",")})`,
                  fields.map((field) => payload[field]),
                )
              ).rows;
              if (endpoint === "change_stock" && loseNextStockResponse) {
                loseNextStockResponse = false;
                return new Response(
                  JSON.stringify({
                    message: "Gateway response lost after local commit",
                  }),
                  { status: 503 },
                );
              }
              return Response.json(rows[0]);
            }
            assert.ok(
              ["products", "categories", "stock_movements"].includes(endpoint),
            );
            if (method === "POST") {
              assert.equal(endpoint, "categories");
              const payload = JSON.parse(init.body);
              assert.deepEqual(Object.keys(payload), ["name"]);
              rows = (
                await db.query(
                  "insert into public.categories(name) values($1) returning *",
                  [payload.name],
                )
              ).rows;
              return Response.json(rows[0]);
            }
            const values = [],
              where = [];
            const parameter = (value) => {
              values.push(value);
              return `$${values.length}`;
            };
            const joined =
              endpoint === "stock_movements" &&
              params.get("select")?.includes("product:");
            const prefix = joined ? "m." : "";
            for (const column of [
              "id",
              "user_id",
              "product_id",
              "type",
              "is_archived",
            ]) {
              if (!params.has(column)) continue;
              assert.ok(params.get(column).startsWith("eq."));
              where.push(
                `${prefix}${column} = ${parameter(params.get(column).slice(3))}`,
              );
            }
            for (const boundary of params.getAll("created_at")) {
              const op = boundary.startsWith("gte.")
                ? ">="
                : boundary.startsWith("lt.")
                  ? "<"
                  : null;
              assert.ok(op);
              where.push(
                `${prefix}created_at ${op} ${parameter(boundary.slice(boundary.indexOf(".") + 1))}::timestamptz`,
              );
            }
            assert.ok(
              params.has("user_id"),
              "Every ordinary table read/write includes owner filter",
            );
            if (method === "PATCH") {
              const payload = JSON.parse(init.body);
              const allowed = [
                "name",
                "sku",
                "category_id",
                "description",
                "min_stock",
                "cost_price",
                "selling_price",
                "is_archived",
              ];
              assert.ok(
                Object.keys(payload).every((key) => allowed.includes(key)),
              );
              const assignments = Object.entries(payload).map(
                ([key, value]) => `${key}=${parameter(value)}`,
              );
              rows = (
                await db.query(
                  `update public.${endpoint} set ${assignments.join(",")} where ${where.join(" and ")} returning *`,
                  values,
                )
              ).rows;
              if (!rows.length)
                return Response.json({ code: "PGRST116" }, { status: 406 });
              return Response.json(rows[0]);
            }
            assert.equal(method, "GET");
            const base = joined
              ? "from public.stock_movements m join public.products p on p.id=m.product_id and p.user_id=m.user_id"
              : `from public.${endpoint}`;
            const clause = `where ${where.join(" and ")}`;
            const count = (
              await db.query(
                `select count(*)::int as count ${base} ${clause}`,
                values,
              )
            ).rows[0].count;
            const order = params.get("order");
            assert.ok(["id.asc", "created_at.desc,id.desc"].includes(order));
            const ordering =
              order === "id.asc"
                ? `${prefix}id asc`
                : `${prefix}created_at desc,${prefix}id desc`;
            const offset = Number(params.get("offset") || 0),
              limit = Math.min(37, Number(params.get("limit") || 500));
            const select = joined
              ? "m.*,jsonb_build_object('id',p.id,'name',p.name,'sku',p.sku,'is_archived',p.is_archived) as product"
              : "*";
            rows = (
              await db.query(
                `select ${select} ${base} ${clause} order by ${ordering} offset $${values.length + 1} limit $${values.length + 2}`,
                [...values, offset, limit],
              )
            ).rows;
            return Response.json(rows, {
              headers: {
                "Content-Range": rows.length
                  ? `${offset}-${offset + rows.length - 1}/${count}`
                  : `*/${count}`,
              },
            });
          } catch (error) {
            return Response.json(
              { code: error.code || "adapter-error", message: error.message },
              { status: 400 },
            );
          }
        },
      },
    });
    const inventory = createInventoryService(client),
      history = createStockHistoryService(client);
    const exports = createInventoryExportService(client);
    const signal = new AbortController().signal;
    const category = await inventory.createCategory(" Office ");
    assert.equal(category.name, "Office");
    await inventory.renameCategory(category.id, "Office supplies", A);
    const fields = {
      name: "Notebook",
      sku: "FLOW-1",
      category_id: category.id,
      description: "Local fixture",
      min_stock: 8,
      cost_price: 0.1,
      selling_price: 0.2,
    };
    const created = await inventory.createProduct(fields, 10);
    const storageMap = new Map();
    const storage = {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, value) => storageMap.set(key, value),
      removeItem: (key) => storageMap.delete(key),
    };
    const draft = makeStockDraft(A, created, "IN", 5, "Delivery", randomUUID());
    rememberStockDraft(storage, A, draft);
    await assert.rejects(
      inventory.changeStock(draft),
      (error) => error.uncertain === true,
    );
    const saved = readStockDraft(storage, A);
    assert.equal(saved.operationId, draft.operationId);
    const replay = await inventory.changeStock(saved);
    assert.equal(replay.quantity_after, 15);
    const replayAgain = await inventory.changeStock(saved);
    assert.equal(replayAgain.id, replay.id);
    forgetStockDraft(storage, A, saved.operationId);
    assert.equal(readStockDraft(storage, A), null);
    await inventory.changeStock(
      makeStockDraft(A, created, "OUT", 3, "Order", randomUUID()),
    );
    await inventory.changeStock(
      makeStockDraft(
        A,
        created,
        "ADJUSTMENT",
        8,
        "Physical count",
        randomUUID(),
      ),
    );
    const edited = await inventory.updateProduct(
      created.id,
      { ...fields, name: "Edited notebook", quantity: 999, user_id: B },
      A,
    );
    assert.equal(edited.quantity, 8);
    assert.equal(edited.user_id, A);
    let data = await inventory.load(A, signal);
    assert.equal(data.categories[0].name, "Office supplies");
    assert.equal(inventoryTotals(data.products).costCents, 80n);
    assert.equal(inventoryTotals(data.products).lowStock.length, 1);
    assert.equal(getStatus(8, 8), "Low stock");
    assert.equal(
      findOwnedProduct(data.products, created.id).name,
      "Edited notebook",
    );
    assert.equal(findOwnedProduct(data.products, randomUUID()), null);
    const movements = await history.loadPage({
      userId: A,
      productId: created.id,
    });
    assert.equal(
      movements.count,
      4,
      "Initial stock, exactly one replayed IN, OUT, adjustment",
    );
    assert.deepEqual(
      movements.rows.map((row) => row.quantity_change).sort((a, b) => a - b),
      [-4, -3, 5, 10],
    );
    const activity = await createDashboardService(client).load({
      userId: A,
      period: activityPeriod(7),
    });
    assert.equal(
      activity.rows.reduce((sum, row) => sum + row.incoming, 0),
      15,
    );
    assert.equal(
      activity.rows.reduce((sum, row) => sum + row.outgoing, 0),
      3,
    );
    assert.equal(
      activity.rows.reduce((sum, row) => sum + row.adjustment, 0),
      -4,
    );
    assert.equal(
      (
        await exports.prepare(A, {
          status: "attention",
          category: category.id,
          query: "FLOW-1",
        })
      ).count,
      1,
    );
    await inventory.archiveProduct(created.id, A);
    data = await inventory.load(A, signal);
    assert.equal(inventoryTotals(data.products).count, 0);
    assert.equal(productEmptyState(data.products), "active");
    assert.equal((await exports.prepare(A, {})).count, 0);
    assert.equal((await exports.prepare(A, { archive: "archived" })).count, 1);
    const archivedHistory = await history.loadPage({
      userId: A,
      productId: created.id,
    });
    assert.equal(archivedHistory.count, 4);
    assert.ok(archivedHistory.rows.every((row) => row.product.is_archived));

    // More than one API page for the actual shared inventory loader, not just
    // its paging helper. Fixtures are inserted only into this local database.
    await db.exec("reset role");
    await db.query(
      `insert into public.products(user_id,name,sku,quantity,cost_price)
      select $1,'Bulk '||i,'BULK-'||lpad(i::text,4,'0'),1,0.10 from generate_series(1,1105) i`,
      [A],
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`,
    );
    data = await inventory.load(A, signal);
    assert.equal(data.products.length, 1106);
    assert.equal(inventoryTotals(data.products).count, 1105);
    assert.equal(inventoryTotals(data.products).costCents, 11050n);
    assert.equal(
      (await exports.prepare(A, { query: "BULK", sort: "sku" })).count,
      1105,
    );
    assert.ok(
      requests.some(
        (request) => request.endpoint === "products" && request.offset > 1000,
      ),
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
    const other = await inventory.load(B, signal);
    assert.deepEqual(other.products, []);
    assert.equal(findOwnedProduct(other.products, created.id), null);
    assert.equal(
      (await exports.prepare(A, { archive: "all" })).count,
      0,
      "Local RLS denies A's rows even with a known owner filter",
    );
  } finally {
    await db.close();
  }
});

test("empty inventory, archived-only inventory, filters and malformed detail IDs are distinct", () => {
  assert.equal(productEmptyState([]), "inventory");
  const archived = [{ id: randomUUID(), is_archived: true }];
  assert.equal(productEmptyState(archived), "active");
  assert.equal(productEmptyState(archived, { query: "missing" }), "matches");
  assert.equal(
    productEmptyState([{ is_archived: false }], { archive: "archived" }),
    "archived",
  );
  assert.equal(findOwnedProduct(archived, "bad-id"), null);
  assert.equal(findOwnedProduct(archived, archived[0].id), archived[0]);
});
