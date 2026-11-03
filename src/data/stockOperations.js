export const MAX_STOCK = 2147483647;
export const stockLabels = {
  IN: "Stock in",
  OUT: "Stock out",
  ADJUSTMENT: "Adjust stock",
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateStockInput(type, value, note) {
  if (!Object.hasOwn(stockLabels, type))
    throw new Error("Choose a valid stock operation.");
  if (
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "string" && !value.trim())
  )
    throw new Error("Enter a whole quantity.");
  const quantity = Number(value);
  if (
    !Number.isInteger(quantity) ||
    quantity < (type === "ADJUSTMENT" ? 0 : 1) ||
    quantity > MAX_STOCK
  ) {
    throw new Error(
      type === "ADJUSTMENT"
        ? "Actual quantity must be a whole number from 0 to 2,147,483,647."
        : "Amount must be a whole number from 1 to 2,147,483,647.",
    );
  }
  if (typeof note !== "string" || note.length > 2000)
    throw new Error("Note must contain at most 2000 characters.");
  if (
    type === "ADJUSTMENT" &&
    (note.replace(/\s/g, "").length < 3 || !/[\p{L}\p{N}]/u.test(note))
  ) {
    throw new Error(
      "Explain the adjustment with at least 3 non-whitespace characters and a letter or number.",
    );
  }
  return quantity;
}
export function stockPreview(current, type, value) {
  if (value === "" || !Number.isInteger(Number(value))) return null;
  const quantity = Number(value);
  if (quantity < (type === "ADJUSTMENT" ? 0 : 1) || quantity > MAX_STOCK)
    return null;
  return type === "ADJUSTMENT"
    ? quantity
    : current + (type === "OUT" ? -quantity : quantity);
}
export function makeStockDraft(
  userId,
  product,
  type,
  value,
  note,
  operationId = crypto.randomUUID(),
) {
  const quantity = validateStockInput(type, value, note);
  return {
    version: 1,
    userId,
    productId: product.id,
    operationId,
    type,
    quantity,
    note,
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: product.quantity,
    },
  };
}
const journalKey = (userId) => `stockmate:pending-stock:${userId}`;
export function readStockDraft(storage, userId) {
  const raw = storage.getItem(journalKey(userId));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (
      draft.version !== 1 ||
      draft.userId !== userId ||
      !uuidPattern.test(draft.operationId) ||
      !uuidPattern.test(draft.productId) ||
      draft.product?.id !== draft.productId ||
      typeof draft.product.name !== "string" ||
      !Number.isInteger(draft.product.quantity) ||
      draft.product.quantity < 0 ||
      draft.product.quantity > MAX_STOCK
    )
      throw new Error();
    validateStockInput(draft.type, draft.quantity, draft.note);
    return draft;
  } catch {
    throw new Error(
      "A saved stock operation could not be read. Do not start a replacement operation. Restore the saved request or verify its result before clearing session storage.",
    );
  }
}
export function rememberStockDraft(storage, userId, draft) {
  const previous = readStockDraft(storage, userId);
  if (previous && JSON.stringify(previous) !== JSON.stringify(draft))
    throw new Error(
      "Resolve the saved stock operation before starting another one.",
    );
  storage.setItem(journalKey(userId), JSON.stringify(draft));
}
export function forgetStockDraft(storage, userId, operationId) {
  const previous = readStockDraft(storage, userId);
  if (previous && previous.operationId !== operationId)
    throw new Error(
      "A different stock operation is pending. Its recovery record was preserved.",
    );
  storage.removeItem(journalKey(userId));
}
export function stockRequestError(error) {
  const code = error?.code || "";
  const messages = {
    P1001: "This product is archived. New stock operations are not allowed.",
    P1002:
      "Insufficient stock. Refresh the inventory and use a smaller amount.",
    P1003:
      "Actual quantity already matches the current stock. No adjustment is needed.",
    P1004:
      "This operation ID belongs to a different request. Its inputs must not be changed.",
    42501:
      "The product is unavailable for this account, or your session has expired.",
    22003: "The resulting quantity would exceed 2,147,483,647 units.",
    22023: "Check the type, whole quantity, and adjustment note.",
    "22P02": "The stock request contains an invalid identifier or quantity.",
    23514:
      "The database rejected this operation. No stock change was committed.",
    PGRST202:
      "Stock migration required. Apply supabase/migrations/20261103090000_stock_operations.sql, then retry.",
    PGRST205:
      "Inventory migrations are required. Apply the foundation and stock operations migrations in order.",
    "42P01":
      "Inventory migrations are required. Apply the foundation and stock operations migrations in order.",
  };
  const failure = new Error(
    Object.hasOwn(messages, code)
      ? messages[code]
      : "The result could not be confirmed. Retry the saved operation with the same ID; do not enter it again as a new operation.",
  );
  failure.code = code;
  // Unknown/network/gateway failures may happen after COMMIT. Never discard their UUID.
  failure.uncertain = !Object.hasOwn(messages, code) || code === "P1004";
  return failure;
}
