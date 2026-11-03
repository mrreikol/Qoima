// This entire module (including the library) is imported only for Excel export.
// Vite's modern browser target already supplies the features of the legacy polyfills.
import ExcelJS from "devextreme-exceljs-fork/dist/dx-exceljs-fork.bare.min.js";
import { INVENTORY_EXPORT_HEADERS } from "./inventoryExportData.js";

export function createInventoryWorkbook(rows) {
  if (rows.length > 1048575)
    throw new Error(
      "Too many products for a single Excel sheet. Narrow your filters.",
    );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const widths = [20, 32, 60, 24, 12, 16, 16, 16, 18, 12];
  sheet.columns = INVENTORY_EXPORT_HEADERS.map((header, index) => ({
    header,
    width: widths[index],
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 22;
  for (const values of rows) {
    const row = sheet.addRow([]);
    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      if (index >= 4 && index <= 7) {
        cell.value = Number(value);
        if (!Number.isFinite(cell.value))
          throw new Error("Invalid numeric export value.");
        cell.numFmt = index >= 6 ? "0.00" : "0";
      } else {
        // A string value, including =... or +..., is never a formula object.
        cell.value = String(value ?? "");
        cell.numFmt = "@";
      }
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: 10 },
  };
  return workbook;
}
export async function buildInventoryXlsx(rows) {
  return createInventoryWorkbook(rows).xlsx.writeBuffer();
}
