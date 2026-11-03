import {
  historySearchFilter,
  normalizeHistoryQuery,
} from "../data/stockHistory.js";

function historyError(error) {
  if (["42P01", "PGRST205", "PGRST200", "PGRST201"].includes(error?.code))
    return new Error(
      "Stock history is unavailable. Check that the inventory foundation migration and its product relationship are available in Supabase, then retry.",
    );
  if (error?.code === "42501")
    return new Error(
      "History access was denied. Check your session and existing database permissions.",
    );
  return new Error(
    "Unable to load stock history. Check your connection and session, then retry.",
  );
}
// Injectable client permits offline query tests without loading browser credentials.
export function createStockHistoryService(client) {
  return {
    async loadPage(options, signal) {
      const params = normalizeHistoryQuery(options);
      const rows = [];
      let count;
      do {
        const offset = params.offset + rows.length;
        let request = client
          .from("stock_movements")
          .select(
            "id,product_id,type,quantity_change,quantity_after,note,created_at,product:products!stock_movements_product_owner_fkey!inner(id,name,sku,is_archived)",
            { count: "exact" },
          )
          .eq("user_id", params.userId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (params.productId)
          request = request.eq("product_id", params.productId);
        if (params.type) request = request.eq("type", params.type);
        if (params.startUTC)
          request = request.gte("created_at", params.startUTC);
        if (params.endExclusiveUTC)
          request = request.lt("created_at", params.endExclusiveUTC);
        if (params.query)
          request = request.or(historySearchFilter(params.query), {
            referencedTable: "product",
          });
        request = request.range(offset, params.offset + params.pageSize - 1);
        if (signal) request = request.abortSignal(signal);
        let response;
        try {
          response = await request;
        } catch {
          throw historyError(null);
        }
        if (response.error) throw historyError(response.error);
        if (
          !Number.isSafeInteger(response.count) ||
          !Array.isArray(response.data)
        )
          throw new Error(
            "The history response did not include a valid total. Retry the request.",
          );
        count = response.count;
        rows.push(...response.data);
        if (!response.data.length && params.offset + rows.length < count)
          throw new Error("History changed while loading. Refresh and retry.");
        // Fetch the rest of this page if the project API cap is below pageSize.
      } while (
        rows.length < params.pageSize &&
        params.offset + rows.length < count
      );
      return { rows, count };
    },
  };
}
