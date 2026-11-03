import { readAllRows } from "./readAllRows.js";
import { stockRequestError } from "../data/stockOperations.js";
import { categoryDeletionError } from "../data/categoryDeletion.js";

export function inventoryError(error, entity = "inventory") {
  if (
    ["42P01", "42883", "PGRST205", "PGRST202", "PGRST204"].includes(error?.code)
  ) {
    return new Error(
      "Inventory migration required. Apply supabase/migrations/20261102180000_inventory_foundation.sql in Supabase SQL Editor, then retry.",
    );
  }
  if (error?.code === "23505")
    return new Error(
      entity === "category"
        ? "A category with this name already exists (names ignore case and surrounding spaces)."
        : "This SKU already exists, including archived products. Use a unique SKU.",
    );
  if (error?.code === "23503")
    return new Error(
      "This category is unavailable. Refresh your categories and try again.",
    );
  if (error?.code === "42501")
    return new Error(
      "This action is not permitted. Check your session and database permissions.",
    );
  if (error?.code === "PGRST116")
    return new Error(
      "This item is no longer available. Refresh the inventory and try again.",
    );
  if (["22023", "23514", "22003", "22P02"].includes(error?.code))
    return new Error(
      "Check the form values: names and SKU are required; quantities and prices must be within their allowed ranges.",
    );
  return new Error(
    "Unable to access inventory. Check your connection and session, then try again.",
  );
}
async function result(request, entity) {
  const { data, error } = await request;
  if (error) throw inventoryError(error, entity);
  return data;
}
export function createInventoryService(client) {
  async function allRows(table, userId, signal) {
    try {
      return await readAllRows(
        () =>
          client
            .from(table)
            .select("*", { count: "exact" })
            .eq("user_id", userId)
            .order("id"),
        signal,
      );
    } catch (error) {
      throw inventoryError(error);
    }
  }
  return {
    async deleteCategory(request) {
      try {
        const { data, error } = await client.rpc("delete_category", {
          p_category_id: request.categoryId,
          p_action: request.action,
          p_destination_category_id: request.destinationId || null,
        }).abortSignal(AbortSignal.timeout(20000));
        if (error) throw categoryDeletionError(error);
        const row = Array.isArray(data) ? data[0] : null;
        const count = row?.affected_products;
        if (row?.deleted_category_id !== request.categoryId ||
            !["string", "number"].includes(typeof count) || !/^\d+$/.test(String(count)) ||
            !Number.isSafeInteger(Number(count)))
          throw categoryDeletionError(null);
        return row;
      } catch (error) {
        if (typeof error.uncertain === "boolean") throw error;
        throw categoryDeletionError(null);
      }
    },
    async changeStock(request) {
      try {
        const { data, error } = await client
          .rpc("change_stock", {
            p_product_id: request.productId,
            p_operation_id: request.operationId,
            p_type: request.type,
            p_quantity: request.quantity,
            p_note: request.note,
          })
          .abortSignal(AbortSignal.timeout(20000));
        if (error) throw stockRequestError(error);
        if (!data?.id || !Number.isInteger(data.quantity_after))
          throw stockRequestError(null);
        return data;
      } catch (error) {
        if (typeof error.uncertain === "boolean") throw error;
        throw stockRequestError(null);
      }
    },
    async load(userId, signal) {
      const [products, categories, recentMovements] = await Promise.all([
        allRows("products", userId, signal),
        allRows("categories", userId, signal),
        result(
          client
            .from("stock_movements")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(4)
            .abortSignal(signal),
        ),
      ]);
      return {
        products,
        categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
        recentMovements,
      };
    },
    createCategory(name) {
      return result(
        client
          .from("categories")
          .insert({ name: name.trim() })
          .select()
          .single(),
        "category",
      );
    },
    renameCategory(id, name, userId) {
      return result(
        client
          .from("categories")
          .update({ name: name.trim() })
          .eq("id", id)
          .eq("user_id", userId)
          .select()
          .single(),
        "category",
      );
    },
    createProduct(fields, quantity) {
      return result(
        client.rpc("create_product", {
          p_name: fields.name,
          p_sku: fields.sku,
          p_category_id: fields.category_id,
          p_description: fields.description,
          p_initial_quantity: quantity,
          p_min_stock: fields.min_stock,
          p_cost_price: fields.cost_price,
          p_selling_price: fields.selling_price,
        }),
        "product",
      );
    },
    updateProduct(id, fields, userId) {
      // Explicit allowlist: quantity, user_id, timestamps, and archive flags never enter this update.
      const {
        name,
        sku,
        category_id,
        description,
        min_stock,
        cost_price,
        selling_price,
      } = fields;
      return result(
        client
          .from("products")
          .update({
            name,
            sku,
            category_id,
            description,
            min_stock,
            cost_price,
            selling_price,
          })
          .eq("id", id)
          .eq("user_id", userId)
          .eq("is_archived", false)
          .select()
          .single(),
        "product",
      );
    },
    archiveProduct(id, userId) {
      return result(
        client
          .from("products")
          .update({ is_archived: true })
          .eq("id", id)
          .eq("user_id", userId)
          .eq("is_archived", false)
          .select()
          .single(),
        "product",
      );
    },
  };
}
