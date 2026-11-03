import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "devextreme-exceljs-fork";
import { createClient } from "@supabase/supabase-js";
import {
  INVENTORY_EXPORT_HEADERS,
  inventoryExportRows,
} from "../src/data/inventoryExportData.js";
import { serializeInventoryCsv } from "../src/data/inventoryCsv.js";
import { createInventoryExportService } from "../src/services/inventoryExportService.js";
import {
  createInventoryWorkbook,
  buildInventoryXlsx,
} from "../src/data/inventoryXlsx.js";
import { downloadInventoryFile } from "../src/data/downloadCsv.js";

const product = (values = {}) => ({
  sku: "0000123",
  name: "Café 東京 🛒",
  description: 'First line\r\nSecond, "quoted" line',
  category_id: "c",
  quantity: 5,
  min_stock: 5,
  cost_price: "0.10",
  selling_price: "1234.50",
  is_archived: false,
  ...values,
});
async function roundTrip(rows) {
  const buffer = await buildInventoryXlsx(rows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return {
    buffer: Buffer.from(buffer),
    sheet: workbook.getWorksheet("Inventory"),
  };
}
// Independent ZIP reader for inspecting the actual generated worksheet XML.
function zipEntry(buffer, path) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  let cursor = buffer.readUInt32LE(end + 16);
  while (buffer.readUInt32LE(cursor) === 0x02014b50) {
    const size = buffer.readUInt32LE(cursor + 20),
      nameLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (name === path) {
      const local = buffer.readUInt32LE(cursor + 42);
      const start =
        local +
        30 +
        buffer.readUInt16LE(local + 26) +
        buffer.readUInt16LE(local + 28);
      const bytes = buffer.subarray(start, start + size);
      return (
        buffer.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(bytes) : bytes
      ).toString("utf8");
    }
    cursor +=
      46 +
      nameLength +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
  throw new Error(`ZIP entry not found: ${path}`);
}

test("XLSX round-trip preserves explicit strings, leading-zero SKU, Unicode, multiline text and numeric values", async () => {
  const source = product();
  const rows = inventoryExportRows([source], [{ id: "c", name: "Office" }], {});
  const { sheet } = await roundTrip(rows);
  assert.deepEqual(sheet.getRow(1).values.slice(1), INVENTORY_EXPORT_HEADERS);
  assert.equal(sheet.getCell("A2").value, "0000123");
  assert.equal(sheet.getCell("B2").value, source.name);
  assert.equal(
    sheet.getCell("C2").value,
    source.description.replace(/\r\n?/g, "\n"),
  );
  for (const column of ["A", "B", "C", "D", "I", "J"]) {
    assert.equal(sheet.getCell(`${column}2`).type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell(`${column}2`).numFmt, "@");
  }
  for (const [column, value] of [
    ["E", 5],
    ["F", 5],
    ["G", 0.1],
    ["H", 1234.5],
  ]) {
    assert.equal(sheet.getCell(`${column}2`).type, ExcelJS.ValueType.Number);
    assert.equal(sheet.getCell(`${column}2`).value, value);
  }
  assert.equal(sheet.getCell("G2").numFmt, "0.00");
  assert.equal(sheet.getCell("H2").numFmt, "0.00");
  assert.equal(sheet.getCell("C2").alignment.wrapText, true);
});
test("formula-like user text remains literal and the serialized sheet contains no formula elements", async () => {
  const texts = [
    '=HYPERLINK("https://example.invalid","text")',
    "+1+1",
    "-1+1",
    "@SUM(A1)",
    " \t=1",
    "＝1",
    "00123",
  ];
  const products = texts.map((text) =>
    product({ sku: text, name: text, description: text }),
  );
  const rows = inventoryExportRows(products, [{ id: "c", name: "=1+1" }], {
    archive: "all",
    sort: "sku",
  });
  const { buffer, sheet } = await roundTrip(rows);
  rows.forEach((values, index) => {
    for (const column of [0, 1, 2, 3]) {
      const cell = sheet.getRow(index + 2).getCell(column + 1);
      assert.equal(cell.type, ExcelJS.ValueType.String);
      assert.equal(cell.value, values[column]);
      assert.equal(cell.formula, undefined);
    }
  });
  const xml = zipEntry(buffer, "xl/worksheets/sheet1.xml");
  assert.doesNotMatch(xml, /<f(?:\s|>)/);
  assert.match(xml, /<c r="A2"[^>]*t="s"/);
  assert.ok(
    serializeInventoryCsv(rows).csv.includes("'=1+1"),
    "CSV still adds its protective apostrophe",
  );
});
test("XLSX stores bold headers, widths, frozen first row and a complete autofilter range", async () => {
  const rows = inventoryExportRows(
    [product(), product({ sku: "999", is_archived: true })],
    [],
    { archive: "all" },
  );
  const { sheet, buffer } = await roundTrip(rows);
  assert.equal(sheet.getRow(1).font.bold, true);
  assert.equal(sheet.getColumn(3).width, 60);
  assert.equal(sheet.getColumn(1).width, 20);
  assert.equal(sheet.views[0].state, "frozen");
  assert.equal(sheet.views[0].ySplit, 1);
  assert.equal(sheet.autoFilter, "A1:J3");
  assert.match(
    zipEntry(buffer, "xl/worksheets/sheet1.xml"),
    /<autoFilter ref="A1:J3"/,
  );
  assert.equal((await roundTrip([])).sheet.rowCount, 1);
  assert.throws(
    () => createInventoryWorkbook({ length: 1048576 }),
    /Too many products/,
  );
});
test("Excel and CSV share the full authorized multipage selection, combined filters and sorting", async () => {
  const fixtures = Array.from({ length: 1205 }, (_, id) => ({
    ...product(),
    description: "Scope fixture",
    id,
    user_id: "A",
    sku: String(id).padStart(6, "0"),
    name: id % 2 ? "Other" : "Widget",
    category_id: id % 4 ? "c" : "other",
    quantity: id % 3 ? 1 : 9,
    min_stock: 2,
    is_archived: id % 7 === 0,
  }));
  const expected = fixtures
    .filter(
      (row) =>
        row.name === "Widget" && row.category_id === "c" && row.quantity <= 2,
    )
    .map((row) => row.sku)
    .sort();
  let lastOffset = 0;
  const client = createClient("https://offline.invalid", "offline-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input);
        assert.equal(url.searchParams.get("user_id"), "eq.A");
        const categories = url.pathname.endsWith("categories");
        const source = categories ? [{ id: "c", name: "Supplies" }] : fixtures;
        const offset = Number(url.searchParams.get("offset"));
        if (!categories) lastOffset = Math.max(lastOffset, offset);
        const page = source.slice(
          offset,
          offset + Math.min(47, Number(url.searchParams.get("limit"))),
        );
        return Response.json(page, {
          headers: {
            "Content-Range": `${offset}-${offset + page.length - 1}/${source.length}`,
          },
        });
      },
    },
  });
  const result = await createInventoryExportService(client).load("A", {
    query: "widget",
    category: "c",
    status: "attention",
    archive: "all",
    sort: "sku",
  });
  assert.ok(lastOffset > 1000);
  assert.equal(result.count, expected.length);
  const { sheet } = await roundTrip(result.rows);
  const xlsxSkus = [];
  sheet.eachRow((row, number) => {
    if (number > 1) xlsxSkus.push(row.getCell(1).value);
  });
  assert.deepEqual(xlsxSkus, expected);
  const csv = serializeInventoryCsv(result.rows);
  const csvSkus = csv.csv
    .split("\r\n")
    .slice(1, -1)
    .map((line) => line.split(",")[0].slice(1, -1));
  assert.deepEqual(csvSkus, xlsxSkus);
  assert.ok(result.rows.some((row) => row[9] === "Yes"));
  assert.ok(result.rows.some((row) => row[9] === "No"));
});
test("Excel download uses XLSX filename, binary bytes and MIME type", async () => {
  let blob, anchor, release;
  const browser = {
    Blob,
    URL: {
      createObjectURL(value) {
        blob = value;
        return "blob:xlsx";
      },
      revokeObjectURL() {},
    },
    document: {
      createElement() {
        anchor = { click() {}, remove() {} };
        return anchor;
      },
      body: { appendChild() {} },
    },
    setTimeout(fn) {
      release = fn;
    },
  };
  const bytes = await buildInventoryXlsx(
    inventoryExportRows([product()], [], {}),
  );
  downloadInventoryFile(bytes, "xlsx", browser);
  assert.match(anchor.download, /^qoima-products-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(
    blob.type,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.deepEqual(
    [...new Uint8Array(await blob.arrayBuffer()).slice(0, 2)],
    [0x50, 0x4b],
  );
  release();
});
