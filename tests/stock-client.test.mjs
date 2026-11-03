import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  validateStockInput,
  stockPreview,
  makeStockDraft,
  readStockDraft,
  rememberStockDraft,
  forgetStockDraft,
  stockRequestError,
  MAX_STOCK,
} from "../src/data/stockOperations.js";
function memoryStorage() {
  const records = new Map();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
}
const product = {
  id: randomUUID(),
  name: "Stock test",
  sku: "TEST",
  quantity: 10,
};
test("stock input validates positive amounts and actual adjustment targets including zero", () => {
  assert.equal(validateStockInput("IN", "3", ""), 3);
  assert.equal(validateStockInput("ADJUSTMENT", "0", "Physical count"), 0);
  for (const value of [
    "",
    " ",
    null,
    undefined,
    true,
    -1,
    0,
    1.5,
    Infinity,
    MAX_STOCK + 1,
  ])
    assert.throws(() => validateStockInput("OUT", value, ""));
  for (const note of ["", "  ", "ab", "!!!"])
    assert.throws(() => validateStockInput("ADJUSTMENT", 1, note));
  assert.throws(() => validateStockInput("toString", 1, ""));
  assert.throws(() => validateStockInput("IN", 1, "x".repeat(2001)));
});
test("preview treats adjustment as an actual quantity and exposes stale insufficient-stock estimates", () => {
  assert.equal(stockPreview(10, "IN", "3"), 13);
  assert.equal(stockPreview(10, "OUT", "12"), -2);
  assert.equal(stockPreview(10, "ADJUSTMENT", "0"), 0);
  assert.equal(stockPreview(10, "ADJUSTMENT", "20"), 20);
  assert.equal(stockPreview(10, "OUT", ""), null);
});
test("recovery journal preserves exact UUID/inputs across reload and blocks replacement after uncertainty", () => {
  const storage = memoryStorage();
  const request = makeStockDraft(
    "A",
    product,
    "OUT",
    "2",
    "Order test",
    randomUUID(),
  );
  rememberStockDraft(storage, "A", request);
  assert.deepEqual(readStockDraft(storage, "A"), request);
  rememberStockDraft(storage, "A", JSON.parse(JSON.stringify(request)));
  assert.throws(
    () =>
      rememberStockDraft(storage, "A", {
        ...request,
        operationId: randomUUID(),
      }),
    /Resolve/,
  );
  assert.throws(
    () => rememberStockDraft(storage, "A", { ...request, quantity: 3 }),
    /Resolve/,
  );
  assert.throws(
    () => forgetStockDraft(storage, "A", randomUUID()),
    /different/,
  );
  assert.equal(readStockDraft(storage, "B"), null);
  forgetStockDraft(storage, "A", request.operationId);
  assert.equal(readStockDraft(storage, "A"), null);
});
test("unreadable or unavailable recovery storage never silently starts a new operation", () => {
  const storage = memoryStorage();
  storage.setItem("stockmate:pending-stock:A", "broken");
  assert.throws(() => readStockDraft(storage, "A"), /Do not start/);
  assert.throws(
    () =>
      rememberStockDraft(
        storage,
        "A",
        makeStockDraft("A", product, "IN", 1, ""),
      ),
    /Do not start/,
  );
  assert.throws(() =>
    rememberStockDraft(
      {
        getItem() {
          throw new Error("blocked");
        },
      },
      "A",
      {},
    ),
  );
});
test("network/gateway/conflict failures preserve requests; confirmed rejections allow corrections", () => {
  for (const error of [
    null,
    { code: "" },
    { code: "P1004" },
    { code: "XX000" },
  ])
    assert.equal(stockRequestError(error).uncertain, true);
  for (const code of [
    "P1001",
    "P1002",
    "P1003",
    "22023",
    "22003",
    "42501",
    "PGRST202",
  ])
    assert.equal(stockRequestError({ code }).uncertain, false);
  assert.match(
    stockRequestError({ code: "PGRST202" }).message,
    /20261103090000/,
  );
});
