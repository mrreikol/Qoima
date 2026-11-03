export const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export const getStatus = (quantity, minStock = 0) =>
  quantity === 0
    ? "Out of stock"
    : quantity <= minStock
      ? "Low stock"
      : "In stock";
export const isLowStock = (product) => product.quantity <= product.min_stock;
// Database prices have two decimal places. Accumulate integer cents exactly.
export function priceCents(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}
export function moneyFromCents(cents) {
  const whole = cents / 100n;
  return `$${whole.toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
}
export function inventoryTotals(products) {
  const active = products.filter((product) => !product.is_archived);
  const costCents = active.reduce(
    (sum, product) =>
      sum + BigInt(product.quantity) * priceCents(product.cost_price),
    0n,
  );
  return {
    costCents,
    count: active.length,
    quantity: active.reduce((sum, product) => sum + product.quantity, 0),
    costValue: Number(costCents) / 100,
    lowStock: active.filter(isLowStock),
  };
}
export function filterProducts(
  products,
  {
    query = "",
    category = "",
    status = "",
    archive = "active",
    sort = "name",
  } = {},
) {
  const filtered = products.filter(
    (product) =>
      (archive === "all" || product.is_archived === (archive === "archived")) &&
      `${product.name} ${product.sku}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (!category ||
        (category === "uncategorized"
          ? !product.category_id
          : product.category_id === category)) &&
      (!status ||
        (status === "attention"
          ? isLowStock(product)
          : getStatus(product.quantity, product.min_stock) === status)),
  );
  return filtered.sort((a, b) =>
    sort === "quantity"
      ? a.quantity - b.quantity || a.name.localeCompare(b.name)
      : sort === "newest"
        ? b.created_at.localeCompare(a.created_at)
        : sort === "sku"
          ? a.sku.localeCompare(b.sku)
          : a.name.localeCompare(b.name),
  );
}
export function productFields(form) {
  const fields = {
    name: form.get("name").trim(),
    sku: form.get("sku").trim(),
    category_id: form.get("category_id") || null,
    description: form.get("description").trim(),
    min_stock: Number(form.get("min_stock")),
    cost_price: Number(form.get("cost_price")),
    selling_price: Number(form.get("selling_price")),
  };
  if (!fields.name || !fields.sku)
    throw new Error("Enter a product name and SKU.");
  if (
    !Number.isInteger(fields.min_stock) ||
    fields.min_stock < 0 ||
    fields.min_stock > 2147483647
  )
    throw new Error("Minimum stock must be a nonnegative whole number.");
  for (const price of [fields.cost_price, fields.selling_price]) {
    if (!Number.isFinite(price) || price < 0 || price > 9999999999.99)
      throw new Error("Enter valid nonnegative prices.");
  }
  return fields;
}
