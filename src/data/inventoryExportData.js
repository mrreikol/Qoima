import { filterProducts, getStatus, priceCents } from "./inventory.js";

export const INVENTORY_EXPORT_HEADERS = [
  "SKU",
  "Name",
  "Description",
  "Category",
  "Quantity",
  "Minimum Stock",
  "Cost Price",
  "Selling Price",
  "Stock Status",
  "Archived",
];
export function exportPrice(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value)))
    throw new Error(
      "A product has an invalid price. Refresh your inventory and retry.",
    );
  const cents = priceCents(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
// Canonical, allowlisted export values. Prices stay exact decimal strings until
// a format writer chooses their representation; no IDs or recovery data enter it.
export function inventoryExportRows(products, categories, filters) {
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  return filterProducts(products, filters).map((product) => {
    if (
      ![product.quantity, product.min_stock].every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    )
      throw new Error(
        "A product has an invalid stock quantity. Refresh your inventory and retry.",
      );
    return [
      String(product.sku ?? ""),
      String(product.name ?? ""),
      String(product.description ?? ""),
      String(
        product.category_id
          ? names.get(product.category_id) || "Unavailable category"
          : "Uncategorized",
      ),
      product.quantity,
      product.min_stock,
      exportPrice(product.cost_price),
      exportPrice(product.selling_price),
      getStatus(product.quantity, product.min_stock),
      product.is_archived ? "Yes" : "No",
    ];
  });
}
