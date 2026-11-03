import assert from "node:assert/strict";
import test from "node:test";
import {
  filterProducts,
  getStatus,
  inventoryTotals,
  productFields,
} from "../src/data/inventory.js";
const products = [
  {
    id: "a",
    name: "Monitor",
    sku: "EL-01",
    category_id: "c",
    quantity: 5,
    min_stock: 5,
    cost_price: "20.50",
    selling_price: "999",
    is_archived: false,
    created_at: "2026-01-01",
  },
  {
    id: "b",
    name: "Cable",
    sku: "EL-02",
    category_id: null,
    quantity: 0,
    min_stock: 0,
    cost_price: "5",
    selling_price: "10",
    is_archived: false,
    created_at: "2026-01-02",
  },
  {
    id: "c",
    name: "Old item",
    sku: "OLD",
    quantity: 100,
    min_stock: 200,
    cost_price: "100",
    is_archived: true,
    created_at: "2025-01-01",
  },
];
test("dashboard excludes archives and values inventory at cost, including threshold equality", () => {
  const totals = inventoryTotals(products);
  assert.equal(totals.count, 2);
  assert.equal(totals.quantity, 5);
  assert.equal(totals.costValue, 102.5);
  assert.deepEqual(
    totals.lowStock.map((product) => product.id),
    ["a", "b"],
  );
  assert.equal(getStatus(5, 5), "Low stock");
  assert.equal(getStatus(0, 0), "Out of stock");
});
test("combined filters, archive views and sorting use real fields without mutating input", () => {
  assert.deepEqual(
    filterProducts(products, {
      category: "c",
      status: "attention",
      query: "el-01",
    }).map((product) => product.id),
    ["a"],
  );
  assert.deepEqual(
    filterProducts(products, { archive: "archived" }).map(
      (product) => product.id,
    ),
    ["c"],
  );
  assert.deepEqual(
    filterProducts(products, { sort: "quantity" }).map((product) => product.id),
    ["b", "a"],
  );
  assert.equal(products[0].id, "a");
});
test("ordinary product form cannot include quantity or ownership and rejects invalid amounts", () => {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    name: " Item ",
    sku: " A-1 ",
    category_id: "",
    description: "",
    min_stock: "0",
    cost_price: "1.25",
    selling_price: "2",
    quantity: "999",
    user_id: "other",
  }))
    form.set(name, value);
  const fields = productFields(form);
  assert.equal(fields.name, "Item");
  assert.equal(fields.category_id, null);
  assert.equal("quantity" in fields, false);
  assert.equal("user_id" in fields, false);
  form.set("min_stock", "1.5");
  assert.throws(() => productFields(form), /whole number/);
  form.set("min_stock", "0");
  form.set("cost_price", "-1");
  assert.throws(() => productFields(form), /prices/);
});
