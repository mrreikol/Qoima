export function findOwnedProduct(products, id) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id || "",
    )
  )
    return null;
  // Only use the complete, RLS-scoped inventory; never search another account.
  return products.find((product) => product.id === id.toLowerCase()) || null;
}
export function productEmptyState(
  products,
  { archive = "active", query = "", category = "", status = "" } = {},
) {
  if (!products.length) return "inventory";
  if (query.trim() || category || status) return "matches";
  if (archive === "active" && !products.some((product) => !product.is_archived))
    return "active";
  if (archive === "archived") return "archived";
  return "matches";
}
