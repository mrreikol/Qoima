import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activityPeriod, bucketActivity, summarizeActivity, movementAxis } from "../src/data/dashboard.js";
const period = activityPeriod(7, new Date(2026, 10, 3, 12));
const at = new Date(2026, 10, 3, 12).toISOString();
const move = (type, quantity_change) => ({ type, quantity_change, created_at: at });

test("period totals preserve opposing adjustments before daily netting and use receipt/removal magnitudes", () => {
  const rows = bucketActivity([move("IN", 12), move("OUT", -7), move("ADJUSTMENT", 9), move("ADJUSTMENT", -9), move("ADJUSTMENT", -2)], period);
  assert.deepEqual(summarizeActivity(rows), { received: 12, removed: 7, adjustmentPositive: 9, adjustmentNegative: 11 });
  assert.equal(rows.at(-1).adjustment, -2);
  assert.deepEqual(summarizeActivity(bucketActivity([], period)), { received: 0, removed: 0, adjustmentPositive: 0, adjustmentNegative: 0 });
});

test("nonnegative integer axis covers all daily receipts/removals without being distorted by adjustments", () => {
  for (const peak of [0, 1, 2, 7, 20, 101, 2147483647]) {
    const result = movementAxis([{ incoming: peak, outgoing: 0, adjustment: -9999999999 }]);
    assert.equal(result.ticks[0], 0);
    assert.ok(result.maximum >= Math.max(1, peak));
    assert.ok(result.ticks.length <= 6);
    assert.ok(result.ticks.every(Number.isInteger));
    assert.ok(result.ticks.every(value => value >= 0));
  }
  assert.equal(movementAxis([{ incoming: 12, outgoing: 7, adjustment: -9999999999 }]).maximum, 15);
});

test("real chart markup distinguishes empty/adjustment-only periods and never selects the first zero day by default", async () => {
  const server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, ws: false } });
  try {
    const { default: Chart } = await server.ssrLoadModule('/src/components/StockActivityChart.jsx');
    const render = (moves, days = 7, extra = {}) => renderToStaticMarkup(React.createElement(Chart, {
      days, onPeriodChange() {}, activity: { rows: bucketActivity(moves, activityPeriod(days, new Date(2026,10,3,12))), count: moves.length, loading: false, error: '', ...extra },
    }));
    const empty = render([]);
    assert.match(empty, /No stock movements in this period/);
    assert.doesNotMatch(empty, /<svg|role="tooltip"/);
    const adjustments = render([move('ADJUSTMENT', 6), move('ADJUSTMENT', -6)]);
    assert.match(adjustments, /Only adjustments in this period/);
    assert.match(adjustments, /\+6 \/ −6 units/);
    assert.doesNotMatch(adjustments, /No stock movements|<svg/);
    const normal = render([move('IN', 12), move('OUT', -7)]);
    assert.match(normal, /Stock movements/);
    assert.match(normal, /Received units/);
    assert.match(normal, /Removed units/);
    assert.match(normal, /Net adjustment units/);
    assert.match(normal, /Received: 0 units\. Removed: 0 units\. Net adjustment: 0 units/);
    assert.doesNotMatch(normal, /role="tooltip"|activity-chart-detail|below zero/);
    assert.equal((normal.match(/<g[^>]*role="button"/g) || []).length, 7);
    assert.equal((render([move('IN', 12)], 30).match(/<g[^>]*role="button"/g) || []).length, 30);
    const failed = render([], 7, { error: 'Read failed' });
    assert.match(failed, /Read failed/);
    assert.doesNotMatch(failed, /movement-totals|No stock movements/);
  } finally { await server.close(); }
});
