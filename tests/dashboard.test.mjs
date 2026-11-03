import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  inventoryTotals,
  moneyFromCents,
  getStatus,
  filterProducts,
} from "../src/data/inventory.js";
import { activityPeriod, bucketActivity } from "../src/data/dashboard.js";
import { createDashboardService } from "../src/services/dashboardService.js";
import { readAllRows } from "../src/services/readAllRows.js";
import { createLatestHistoryRequest } from "../src/inventory/latestHistoryRequest.js";

test("active totals use exact cents, include minimum equality and distinguish zero stock", () => {
  const products = [
    {
      id: "a",
      name: "A",
      sku: "A",
      quantity: 3,
      min_stock: 3,
      cost_price: "0.10",
      is_archived: false,
    },
    {
      id: "b",
      name: "B",
      sku: "B",
      quantity: 1,
      min_stock: 0,
      cost_price: "0.20",
      is_archived: false,
    },
    {
      id: "c",
      name: "C",
      sku: "C",
      quantity: 0,
      min_stock: 0,
      cost_price: "999.99",
      is_archived: false,
    },
    {
      id: "d",
      name: "D",
      sku: "D",
      quantity: 900,
      min_stock: 999,
      cost_price: "99.99",
      is_archived: true,
    },
  ];
  const totals = inventoryTotals(products);
  assert.equal(totals.count, 3);
  assert.equal(totals.quantity, 4);
  assert.equal(totals.costCents, 50n);
  assert.equal(moneyFromCents(totals.costCents), "$0.50");
  assert.deepEqual(
    totals.lowStock.map((p) => p.id),
    ["a", "c"],
  );
  assert.equal(getStatus(3, 3), "Low stock");
  assert.equal(getStatus(0, 0), "Out of stock");
  assert.deepEqual(
    filterProducts(products, { status: "attention" }).map((p) => p.id),
    ["a", "c"],
  );
  const huge = inventoryTotals([
    { quantity: 2147483647, cost_price: "9999999999.99", is_archived: false },
  ]);
  assert.equal(huge.costCents, 2147483647n * 999999999999n);
  assert.equal(
    moneyFromCents(huge.costCents),
    "$21,474,836,469,978,525,163.53",
  );
});

test("local periods include today, zero-fill, and bucket initial IN/OUT magnitudes and signed adjustment net", () => {
  const period = activityPeriod(7, new Date(2026, 10, 3, 15));
  assert.equal(period.dates.length, 7);
  assert.equal(period.dates.at(-1), "2026-11-03");
  const at = (day, hour = 12) => new Date(2026, 10, day, hour).toISOString();
  const movements = [
    {
      created_at: at(3),
      type: "IN",
      quantity_change: 9,
      note: "Initial stock",
    },
    { created_at: at(3), type: "OUT", quantity_change: -3 },
    { created_at: at(3), type: "ADJUSTMENT", quantity_change: 5 },
    { created_at: at(3), type: "ADJUSTMENT", quantity_change: -7 },
    { created_at: period.startUTC, type: "IN", quantity_change: 2 },
    { created_at: period.endExclusiveUTC, type: "IN", quantity_change: 999 },
    {
      created_at: new Date(
        new Date(period.startUTC).getTime() - 1,
      ).toISOString(),
      type: "IN",
      quantity_change: 999,
    },
  ];
  const rows = bucketActivity(movements, period);
  assert.deepEqual(rows.at(-1), {
    date: "2026-11-03",
    incoming: 9,
    outgoing: 3,
    adjustment: -2,
    adjustmentPositive: 5,
    adjustmentNegative: 7,
  });
  assert.equal(rows[0].incoming, 2);
  assert.deepEqual(rows[1], {
    date: period.dates[1],
    incoming: 0,
    outgoing: 0,
    adjustment: 0,
    adjustmentPositive: 0,
    adjustmentNegative: 0,
  });
  assert.equal(
    activityPeriod(30, new Date(2026, 10, 3)).dates[0],
    "2026-10-05",
  );
  assert.throws(() => activityPeriod(14), /period/);
});

test("chart UTC bounds follow browser-local days across Qyzylorda and DST transitions", () => {
  const url = new URL("../src/data/dashboard.js", import.meta.url).href;
  for (const [zone, date, start, end] of [
    [
      "Asia/Qyzylorda",
      "2026-11-03",
      "2026-10-27T19:00:00.000Z",
      "2026-11-03T19:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-03-08",
      "2026-03-02T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-11-01",
      "2026-10-26T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ],
  ]) {
    const script = `import {activityPeriod} from ${JSON.stringify(url)}; console.log(JSON.stringify(activityPeriod(7,new Date('${date}T12:00:00'))));`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: zone } },
    );
    assert.equal(child.status, 0);
    const result = JSON.parse(child.stdout);
    assert.equal(result.startUTC, start);
    assert.equal(result.endExclusiveUTC, end);
    assert.equal(result.dates.length, 7);
  }
});

test("real SDK offline HTTP paging reads every product and movement despite a small API cap", async () => {
  const period = activityPeriod(30, new Date(2026, 10, 3));
  const products = Array.from({ length: 1205 }, (_, id) => ({
    id,
    quantity: 2,
    cost_price: "0.10",
    min_stock: 2,
    is_archived: id < 5,
  }));
  const movements = Array.from({ length: 1307 }, (_, id) => ({
    id,
    type: id % 2 ? "OUT" : "IN",
    quantity_change: id % 2 ? -1 : 2,
    created_at: new Date(2026, 10, 3, 12).toISOString(),
    product_archived: id < 500,
  }));
  const calls = [];
  const client = createClient(
    "https://offline.invalid",
    "offline-publishable-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input) => {
          const url = new URL(input);
          const isMovements = url.pathname.endsWith("stock_movements");
          assert.equal(url.searchParams.get("user_id"), "eq.A");
          if (isMovements) {
            assert.deepEqual(url.searchParams.getAll("created_at"), [
              `gte.${period.startUTC}`,
              `lt.${period.endExclusiveUTC}`,
            ]);
            assert.equal(
              url.searchParams.get("order"),
              "created_at.desc,id.desc",
            );
            assert.equal(url.searchParams.has("is_archived"), false);
          } else assert.equal(url.searchParams.get("order"), "id.asc");
          const source = isMovements ? movements : products;
          const offset = Number(url.searchParams.get("offset"));
          const page = source.slice(
            offset,
            offset + Math.min(137, Number(url.searchParams.get("limit"))),
          );
          calls.push([isMovements, offset]);
          return new Response(JSON.stringify(page), {
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `${offset}-${offset + page.length - 1}/${source.length}`,
            },
          });
        },
      },
    },
  );
  const loaded = await readAllRows(() =>
    client
      .from("products")
      .select("*", { count: "exact" })
      .eq("user_id", "A")
      .order("id"),
  );
  assert.equal(loaded.length, 1205);
  const totals = inventoryTotals(loaded);
  assert.equal(totals.count, 1200);
  assert.equal(totals.quantity, 2400);
  assert.equal(totals.costCents, 24000n);
  const activity = await createDashboardService(client).load({
    userId: "A",
    period,
  });
  assert.equal(activity.count, 1307);
  assert.equal(activity.rows.length, 30);
  assert.equal(activity.rows.at(-1).incoming, 1308);
  assert.equal(activity.rows.at(-1).outgoing, 653);
  assert.ok(calls.some(([movement, offset]) => movement && offset > 1000));
  assert.ok(calls.some(([movement, offset]) => !movement && offset > 1000));
});

test("paging errors never publish partial totals and missing counts cannot silently truncate", async () => {
  let page = 0;
  const query = () => ({
    range: async () =>
      ++page === 1
        ? { data: [{ id: 1 }], count: 3 }
        : { error: { code: "network" } },
  });
  await assert.rejects(readAllRows(query));
  await assert.rejects(
    readAllRows(() => ({ range: async () => ({ data: [], count: null }) })),
    /valid total/,
  );
  await assert.rejects(
    readAllRows(() => ({ range: async () => ({ data: [], count: 2 }) })),
    /changed/,
  );
});

test("period/account changes ignore stale success/error; current error retries without stale data", async () => {
  const pending = [];
  const published = [];
  const loader = createLatestHistoryRequest(
    (options, signal) =>
      new Promise((resolve, reject) =>
        pending.push({ options, signal, resolve, reject }),
      ),
    (value) => published.push(value),
  );
  const seven = loader.run({ userId: "A", days: 7 }, "A7");
  const thirty = loader.run({ userId: "A", days: 30 }, "A30");
  pending[1].resolve({ rows: [{ incoming: 30 }], count: 1 });
  await thirty;
  pending[0].resolve({ rows: [{ incoming: 7 }], count: 1 });
  await seven;
  assert.equal(published.length, 1);
  assert.equal(published[0].key, "A30");
  assert.equal(pending[0].signal.aborted, true);
  const old = loader.run({ userId: "A", days: 7 }, "A7");
  const other = loader.run({ userId: "B", days: 7 }, "B7");
  pending[2].reject(new Error("Old session error"));
  pending[3].reject(new Error("Connection failed"));
  await Promise.all([old, other]);
  assert.equal(published.length, 2);
  assert.deepEqual(published[1].rows, []);
  assert.equal(published[1].key, "B7");
  const retry = loader.run({ userId: "B", days: 7 }, "B7retry");
  pending[4].resolve({ rows: [], count: 0 });
  await retry;
  assert.equal(published.at(-1).error, "");
  const unmounted = loader.run({ userId: "B" }, "unmounted");
  loader.cancel();
  pending[5].resolve({ rows: [{ incoming: 99 }], count: 1 });
  await unmounted;
  assert.equal(published.length, 3);
});
