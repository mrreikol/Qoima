export function categoryDeletionPreview(categoryId, products) {
  const affected = products.filter(product => product.category_id === categoryId);
  return { count: affected.length, archived: affected.filter(product => product.is_archived).length };
}

export function categoryDeletionError(error) {
  const messages = {
    PGRST202: "Category deletion migration required. Apply supabase/migrations/20261103193000_category_deletion.sql, then retry.",
    "42883": "Category deletion migration required. Apply supabase/migrations/20261103193000_category_deletion.sql, then retry.",
    "42501": "The source or destination category is unavailable for this account, or your session has expired.",
    "22023": "Category contents or options may have changed. Refresh inventory and choose where the products should go.",
    "22P02": "A category identifier is invalid. Refresh inventory and choose again.",
    "23503": "A category changed during this request. Refresh inventory and choose again.",
    "40P01": "Another inventory change interrupted deletion. No deletion was committed. Refresh before confirming again.",
    "40001": "Another inventory change interrupted deletion. No deletion was committed. Refresh before confirming again.",
  };
  const known = Object.hasOwn(messages, error?.code);
  const failure = new Error(known ? messages[error.code]
    : "Deletion could not be confirmed. Refresh inventory before attempting it again.");
  failure.uncertain = !known;
  return failure;
}

export function availableCategoryFilter(categoryId, categories) {
  return !categoryId || categoryId === "uncategorized" || categories.some(category => category.id === categoryId)
    ? categoryId : "";
}

export function categoryDeletionRefreshState(marker, inventory, categoryId) {
  if (marker === null) return null;
  if (inventory.revision <= marker || inventory.loading) return "waiting";
  if (inventory.error) return "failed";
  return inventory.categories.some(category => category.id === categoryId) ? "ready" : "gone";
}
