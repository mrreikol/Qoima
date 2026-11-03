import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { createDashboardService } from "../services/dashboardService";
import { activityPeriod, localDateKey } from "../data/dashboard";
import { createLatestHistoryRequest } from "./latestHistoryRequest";

const service = createDashboardService(supabase);
export function useDashboardActivity(userId, days, revision) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  // A dashboard left open overnight must advance to the new local day.
  useEffect(() => {
    const update = () => setToday(localDateKey(new Date()));
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const period = useMemo(
    () => activityPeriod(days, new Date(`${today}T12:00:00`)),
    [days, today],
  );
  const selection = useMemo(
    () => ({
      options: { userId, period },
      key: JSON.stringify({ userId, period, revision, attempt }),
    }),
    [userId, period, revision, attempt],
  );
  const request = useMemo(
    () => createLatestHistoryRequest(service.load, setResult),
    [],
  );
  useEffect(() => {
    request.run(selection.options, selection.key);
    return () => request.cancel();
  }, [request, selection]);
  return {
    ...(result?.key === selection.key
      ? { ...result, loading: false }
      : { rows: [], loading: true, error: "", count: null }),
    retry: () => setAttempt((value) => value + 1),
  };
}
