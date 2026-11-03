import { readAllRows } from "./readAllRows.js";
import { bucketActivity } from "../data/dashboard.js";

export function createDashboardService(client) {
  return {
    async load({ userId, period }, signal) {
      if (!userId) throw new Error("Sign in to load stock activity.");
      try {
        const movements = await readAllRows(
          () =>
            client
              .from("stock_movements")
              .select("id,type,quantity_change,created_at", { count: "exact" })
              .eq("user_id", userId)
              .gte("created_at", period.startUTC)
              .lt("created_at", period.endExclusiveUTC)
              .order("created_at", { ascending: false })
              .order("id", { ascending: false }),
          signal,
        );
        return {
          rows: bucketActivity(movements, period),
          count: movements.length,
        };
      } catch (error) {
        if (["42P01", "PGRST205"].includes(error?.code))
          throw new Error(
            "Stock activity requires the inventory foundation migration. Apply it and retry.",
            { cause: error },
          );
        throw new Error(
          "Unable to load all stock activity. Check your connection and session, then retry.",
          { cause: error },
        );
      }
    },
  };
}
