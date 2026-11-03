import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  CSV_HEADERS,
  csvText,
  csvPrice,
  buildInventoryCsv,
} from "../src/data/inventoryCsv.js";
import { createInventoryExportService } from "../src/services/inventoryExportService.js";

// Parse actual CSV fields, including embedded CRLF and escaped quotes.
function parseCsv(csv) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && char === "\r" && csv[i + 1] === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      i++;
    } else value += char;
  }
  assert.equal(quoted, false);
  return rows;
}
const product = (overrides = {}) => ({
  id: "p",
  user_id: "not-exported",
  sku: "A-1",
  name: "Notebook",
  description: "",
  category_id: "c",
  quantity: 5,
  min_stock: 5,
  cost_price: "0.10",
  selling_price: "12",
  is_archived: false,
  created_at: "2026-11-03",
  ...overrides,
});

test("CSV preserves Unicode, commas, quotes and multiline text with UTF-8 BOM and English headers", () => {
  const name = 'Café, "東京" 🛒';
  const description = 'First line\r\nSecond, "quoted" line\nThird';
  const result = buildInventoryCsv(
    [product({ name, description })],
    [{ id: "c", name: 'Paper, "A4"' }],
    {},
  );
  const bytes = new TextEncoder().encode(result.csv);
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
  assert.equal(
    new TextDecoder().decode(bytes).includes(name.replaceAll('"', '""')),
    true,
  );
  const rows = parseCsv(result.csv);
  assert.deepEqual(rows[0], CSV_HEADERS);
  assert.deepEqual(rows[1], [
    "A-1",
    name,
    description,
    'Paper, "A4"',
    "5",
    "5",
    "0.10",
    "12.00",
    "Low stock",
    "No",
  ]);
  assert.equal(rows[1].length, 10);
  assert.equal(result.csv.includes("not-exported"), false);
});
test("user-controlled text guards formulas even behind whitespace/controls and does not alter inventory", () => {
  for (const text of [
    "=1+1",
    "+SUM(A1)",
    "-1+1",
    "@SUM(A1)",
    "  =cmd()",
    "\t=1",
    "\r=1",
    "\n=1",
    "\ufeff=1",
    "\u0000 =1",
    "＝1",
  ])
    assert.ok(csvText(text).startsWith("\"'"), JSON.stringify(text));
  for (const text of ["Cable - USB", "123", "plain", "", "'already text"])
    assert.equal(csvText(text), `"${text}"`);
  const source = product({
    name: "=danger",
    sku: "+danger",
    description: "@danger",
  });
  const result = buildInventoryCsv(
    [source],
    [{ id: "c", name: "-danger" }],
    {},
  );
  const row = parseCsv(result.csv)[1];
  assert.deepEqual(row.slice(0, 4), [
    "'+danger",
    "'=danger",
    "'@danger",
    "'-danger",
  ]);
  assert.equal(source.name, "=danger");
});
test("prices use two decimal places without currency/grouping/rounding artifacts", () => {
  for (const [input, output] of [
    [0, "0.00"],
    [0.1, "0.10"],
    ["12.5", "12.50"],
    ["9999999999.99", "9999999999.99"],
  ])
    assert.equal(csvPrice(input), output);
  for (const input of [null, undefined, "1.234", -1, "NaN", "=1"])
    assert.throws(() => csvPrice(input), /invalid price/);
});
test("combined search/category/status/archive filters and current sort determine export scope", () => {
  const source = [
    product({ name: "Z pencil", sku: "Q-2" }),
    product({ name: "A pencil", sku: "Q-1", quantity: 0 }),
    product({ name: "B pencil", sku: "Q-3", is_archived: true }),
    product({ name: "C pencil", category_id: "other" }),
    product({ name: "D pencil", quantity: 6 }),
    product({ name: "Unrelated" }),
  ];
  const filters = {
    query: "pencil",
    category: "c",
    status: "attention",
    archive: "all",
    sort: "sku",
  };
  const result = buildInventoryCsv(
    source,
    [{ id: "c", name: "Stationery" }],
    filters,
  );
  assert.equal(result.count, 3);
  assert.deepEqual(
    parseCsv(result.csv)
      .slice(1)
      .map((row) => [row[0], row[8], row[9]]),
    [
      ["Q-1", "Out of stock", "No"],
      ["Q-2", "Low stock", "No"],
      ["Q-3", "Low stock", "Yes"],
    ],
  );
  assert.equal(
    buildInventoryCsv(source, [], { ...filters, archive: "active" }).count,
    2,
  );
  assert.equal(
    buildInventoryCsv(source, [], { ...filters, archive: "archived" }).count,
    1,
  );
  assert.deepEqual(
    parseCsv(
      buildInventoryCsv(source, [], { ...filters, sort: "quantity" }).csv,
    )
      .slice(1)
      .map((row) => row[4]),
    ["0", "5", "5"],
  );
  const empty = buildInventoryCsv(source, [], { query: "no match" });
  assert.equal(empty.count, 0);
  assert.deepEqual(parseCsv(empty.csv), [CSV_HEADERS]);
});
test("export reads all API pages with owner filters before selecting matches, without internal fields", async () => {
  const fixtures = Array.from({ length: 1205 }, (_, id) =>
    product({
      id,
      user_id: "A",
      name: `Item ${id}`,
      sku: `S-${String(id).padStart(4, "0")}`,
      quantity: id % 2 ? 1 : 9,
      min_stock: 2,
    }),
  );
  fixtures.push(product({ user_id: "B", sku: "B-private", quantity: 0 }));
  const offsets = [];
  const client = createClient("https://offline.invalid", "offline-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input);
        assert.equal(url.searchParams.get("user_id"), "eq.A");
        assert.equal(url.searchParams.get("order"), "id.asc");
        assert.equal(url.searchParams.get("select").includes("user_id"), false);
        const category = url.pathname.endsWith("categories");
        const source = category
          ? [{ id: "c", name: "Supplies" }]
          : fixtures.filter((row) => row.user_id === "A");
        const offset = Number(url.searchParams.get("offset"));
        if (!category) offsets.push(offset);
        const rows = source.slice(
          offset,
          offset + Math.min(83, Number(url.searchParams.get("limit"))),
        );
        return new Response(JSON.stringify(rows), {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `${offset}-${offset + rows.length - 1}/${source.length}`,
          },
        });
      },
    },
  });
  const filters = {
    status: "attention",
    category: "c",
    query: "Item",
    archive: "active",
    sort: "sku",
  };
  const service = createInventoryExportService(client);
  const result = await service.prepare("A", filters);
  assert.equal(result.count, 602);
  const rows = parseCsv(result.csv).slice(1);
  assert.equal(rows[0][0], "S-0001");
  assert.equal(rows.at(-1)[0], "S-1203");
  assert.ok(offsets.some((offset) => offset > 1000));
  assert.equal(result.csv.includes("B-private"), false);
  assert.ok(rows.every((row) => row.length === 10 && row[3] === "Supplies"));
  await assert.rejects(service.prepare("", filters), /Sign in/);
});
test("a failed export page or cancellation produces no partial CSV", async () => {
  const controller = new AbortController();
  controller.abort();
  const never = createInventoryExportService({
    from() {
      throw new Error("Must not request");
    },
  });
  await assert.rejects(
    never.prepare("A", {}, controller.signal),
    /Unable to export/,
  );
  const fail = createInventoryExportService({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          return { data: null, error: { code: "network" } };
        },
      };
    },
  });
  await assert.rejects(fail.prepare("A", {}), /Unable to export/);
  let productPages = 0;
  const partial = createInventoryExportService({
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          if (table === "categories") return { data: [], count: 0 };
          if (++productPages === 1) return { data: [product()], count: 2 };
          return { error: { code: "network" } };
        },
      };
    },
  });
  await assert.rejects(partial.prepare("A", {}), /Unable to export/);
  assert.equal(productPages, 2);
});
