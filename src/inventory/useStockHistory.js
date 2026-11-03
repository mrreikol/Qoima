import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { createStockHistoryService } from "../services/stockHistoryService";
import { normalizeHistoryQuery } from "../data/stockHistory";
import { createLatestHistoryRequest } from "./latestHistoryRequest";

const service = createStockHistoryService(supabase);
export function useStockHistory(userId, view, inventoryRevision) {
  const [result, setResult] = useState(null);
  const request = useMemo(
    () => createLatestHistoryRequest(service.loadPage, setResult),
    [],
  );
  const selection = useMemo(() => {
    const options = { userId, ...view };
    const key = JSON.stringify({ ...options, inventoryRevision });
    try {
      normalizeHistoryQuery(options);
      return { options, key, error: "" };
    } catch (error) {
      return { options, key, error: error.message };
    }
  }, [userId, view, inventoryRevision]);
  useEffect(() => {
    if (!selection.error) request.run(selection.options, selection.key);
    return () => request.cancel();
  }, [request, selection]);
  if (selection.error)
    return { rows: [], count: null, loading: false, error: selection.error };
  // Hide previous rows immediately when filters/user/page change, before effects run.
  if (result?.key !== selection.key)
    return { rows: [], count: null, loading: true, error: "" };
  return { ...result, loading: false };
}
