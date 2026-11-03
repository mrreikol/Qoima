import {
  INVENTORY_EXPORT_HEADERS,
  inventoryExportRows,
} from "./inventoryExportData.js";
export {
  INVENTORY_EXPORT_HEADERS as CSV_HEADERS,
  exportPrice as csvPrice,
} from "./inventoryExportData.js";

export function csvText(value) {
  let text = String(value ?? "");
  // CSV quoting alone cannot stop spreadsheet formulas. Guard leading controls
  // and whitespace too; prefix only the exported value, never the stored data.
  let first = 0;
  while (
    first < text.length &&
    (text.charCodeAt(first) <= 31 || /\s/u.test(text[first]))
  )
    first++;
  if (/^[=+\-@＝＋－＠]/u.test(text.slice(first)) || /^[\t\r\n]/u.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function serializeInventoryCsv(rows) {
  const records = rows.map((values) =>
    values
      .map((value, index) =>
        index >= 4 && index <= 7 ? value : csvText(value),
      )
      .join(","),
  );
  return {
    csv: `\ufeff${INVENTORY_EXPORT_HEADERS.join(",")}\r\n${records.length ? `${records.join("\r\n")}\r\n` : ""}`,
    count: rows.length,
  };
}
export function buildInventoryCsv(products, categories, filters) {
  return serializeInventoryCsv(
    inventoryExportRows(products, categories, filters),
  );
}
