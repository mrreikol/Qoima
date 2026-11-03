import { inventoryExportRows } from "../data/inventoryExportData.js";
import { readAllRows } from "./readAllRows.js";
import { serializeInventoryCsv } from "../data/inventoryCsv.js";

export function createInventoryExportService(client) {
  async function load(userId, filters, signal) {
    if (!userId) throw new Error("Sign in before exporting inventory.");
    try {
      const read = (table, fields) =>
        readAllRows(
          () =>
            client
              .from(table)
              .select(fields, { count: "exact" })
              .eq("user_id", userId)
              .order("id"),
          signal,
        );
      const [products, categories] = await Promise.all([
        read(
          "products",
          "id,sku,name,description,category_id,quantity,min_stock,cost_price,selling_price,is_archived,created_at",
        ),
        read("categories", "id,name"),
      ]);
      signal?.throwIfAborted();
      const rows = inventoryExportRows(products, categories, filters);
      return { rows, count: rows.length };
    } catch (error) {
      throw new Error(
        "Unable to export inventory. Check your connection, refresh Products, and try again.",
        { cause: error },
      );
    }
  }
  return {
    load,
    async prepare(userId, filters, signal) {
      const { rows } = await load(userId, filters, signal);
      return serializeInventoryCsv(rows);
    },
  };
}
