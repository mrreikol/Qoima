import { historyDateBounds } from "./stockHistory.js";

export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function activityPeriod(days, now = new Date()) {
  if (![7, 30].includes(days)) throw new Error("Choose a 7 or 30 day period.");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dates.push(localDateKey(date));
  }
  return { dates, ...historyDateBounds(dates[0], dates.at(-1)) };
}
export function bucketActivity(movements, period) {
  const rows = period.dates.map((date) => ({
    date,
    incoming: 0,
    outgoing: 0,
    adjustment: 0,
    adjustmentPositive: 0,
    adjustmentNegative: 0,
  }));
  const byDate = new Map(rows.map((row) => [row.date, row]));
  for (const movement of movements) {
    // Compare instants before bucketing: the exclusive end is tomorrow locally.
    const instant = new Date(movement.created_at);
    if (
      instant < new Date(period.startUTC) ||
      instant >= new Date(period.endExclusiveUTC)
    )
      continue;
    const row = byDate.get(localDateKey(instant));
    if (!row) continue;
    if (movement.type === "IN")
      row.incoming += Math.abs(movement.quantity_change);
    if (movement.type === "OUT")
      row.outgoing += Math.abs(movement.quantity_change);
    if (movement.type === "ADJUSTMENT") {
      row.adjustment += movement.quantity_change;
      row.adjustmentPositive += Math.max(0, movement.quantity_change);
      row.adjustmentNegative += Math.max(0, -movement.quantity_change);
    }
  }
  return rows;
}


export function summarizeActivity(rows) {
  return rows.reduce((totals, row) => ({
    received: totals.received + row.incoming,
    removed: totals.removed + row.outgoing,
    adjustmentPositive: totals.adjustmentPositive + row.adjustmentPositive,
    adjustmentNegative: totals.adjustmentNegative + row.adjustmentNegative,
  }), { received: 0, removed: 0, adjustmentPositive: 0, adjustmentNegative: 0 });
}

export function movementAxis(rows) {
  const peak = Math.max(1, ...rows.flatMap(row => [row.incoming, row.outgoing]));
  const roughStep = peak / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= roughStep) * magnitude);
  const maximum = Math.ceil(peak / step) * step;
  return { maximum, ticks: Array.from({ length: maximum / step + 1 }, (_, index) => index * step) };
}
