import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  historyDateBounds,
  historySearchFilter,
  historyViewReducer,
  initialHistoryView,
  normalizeHistoryQuery,
} from "../src/data/stockHistory.js";
import { createLatestHistoryRequest } from "../src/inventory/latestHistoryRequest.js";

test("history filters/page size/clear reset pagination while page navigation preserves filters", () => {
  const page = {
    ...initialHistoryView,
    page: 4,
    query: "keyboard",
    type: "OUT",
  };
  for (const name of ["query", "productId", "type", "startDate", "endDate"])
    assert.equal(
      historyViewReducer(page, { type: "filter", name, value: "changed" }).page,
      1,
    );
  assert.equal(
    historyViewReducer(page, { type: "pageSize", value: 50 }).page,
    1,
  );
  assert.equal(historyViewReducer(page, { type: "clear" }).query, "");
  assert.equal(historyViewReducer(page, { type: "clear" }).page, 1);
  assert.equal(
    historyViewReducer(page, { type: "page", page: 5 }).query,
    "keyboard",
  );
  assert.equal(historyViewReducer(page, { type: "refresh" }).page, 1);
});
test("date validation rejects invalid/reversed ranges and allows open-ended filters", () => {
  for (const date of ["2026-02-30", "2026-13-01", "0000-01-01", "2026-2-1"])
    assert.throws(() => historyDateBounds(date, ""), /date/i);
  assert.throws(
    () => historyDateBounds("2026-11-03", "2026-11-02"),
    /End date/,
  );
  assert.equal(historyDateBounds("", "2026-11-03").startUTC, null);
  assert.equal(historyDateBounds("2024-02-29", "").endExclusiveUTC, null);
  assert.deepEqual(historyDateBounds("", ""), {
    startUTC: null,
    endExclusiveUTC: null,
  });
});
test("local date boundaries convert to UTC and follow 23/25-hour DST days, not fixed 24-hour arithmetic", () => {
  const moduleUrl = new URL("../src/data/stockHistory.js", import.meta.url)
    .href;
  const cases = [
    [
      "Asia/Qyzylorda",
      "2026-11-03",
      "2026-11-02T19:00:00.000Z",
      "2026-11-03T19:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-03-08",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-11-01",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ],
  ];
  for (const [timezone, day, startUTC, endExclusiveUTC] of cases) {
    const script = `import {historyDateBounds} from ${JSON.stringify(moduleUrl)};process.stdout.write(JSON.stringify(historyDateBounds(${JSON.stringify(day)},${JSON.stringify(day)})));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", env: { ...process.env, TZ: timezone } },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { startUTC, endExclusiveUTC });
  }
});
test("history query validation and quoted literal search do not admit raw filter grammar", () => {
  assert.throws(() => normalizeHistoryQuery({ userId: "A", page: -1 }), /page/);
  assert.throws(
    () => normalizeHistoryQuery({ userId: "A", pageSize: 500 }),
    /page/,
  );
  assert.throws(
    () => normalizeHistoryQuery({ userId: "A", type: "INVALID" }),
    /type/,
  );
  const filter = historySearchFilter('A.*(B),"_%\\');
  assert.ok(filter.startsWith('name.imatch."'));
  assert.ok(filter.includes('sku.imatch."'));
  assert.ok(filter.includes("\\\\*"));
  assert.equal(normalizeHistoryQuery({ userId: "A", page: 6 }).offset, 125);
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
test("newer history results win even if the previous transport ignores abort", async () => {
  const old = deferred(),
    latest = deferred(),
    events = [],
    signals = [];
  const runner = createLatestHistoryRequest(
    (options, signal) => {
      signals.push(signal);
      return options.page === 1 ? old.promise : latest.promise;
    },
    (value) => events.push(value),
  );
  const first = runner.run({ page: 1 }, "old-filter-page");
  const second = runner.run({ page: 2 }, "new-filter-page");
  assert.equal(signals[0].aborted, true);
  latest.resolve({ rows: [{ id: "new" }], count: 1 });
  await second;
  old.resolve({ rows: [{ id: "old" }], count: 99 });
  await first;
  assert.equal(events.length, 1);
  assert.equal(events[0].key, "new-filter-page");
});
test("late errors and responses after owner change/unmount cannot clear or publish newer data", async () => {
  const old = deferred(),
    latest = deferred(),
    events = [];
  const runner = createLatestHistoryRequest(
    (options) => (options.owner === "A" ? old.promise : latest.promise),
    (value) => events.push(value),
  );
  const first = runner.run({ owner: "A" }, "A");
  const second = runner.run({ owner: "B" }, "B");
  latest.resolve({ rows: [{ id: "B-only" }], count: 1 });
  await second;
  old.reject(new Error("Late failure"));
  await first;
  assert.equal(events.length, 1);
  assert.equal(events[0].key, "B");
  const pending = deferred();
  const canceled = createLatestHistoryRequest(
    () => pending.promise,
    (value) => events.push(value),
  );
  const third = canceled.run({}, "unmounted");
  canceled.cancel();
  pending.resolve({ rows: [{ id: "discard" }], count: 1 });
  await third;
  assert.equal(events.length, 1);
});
test("current errors publish an empty retryable state and a later retry replaces the error", async () => {
  const events = [];
  const runner = createLatestHistoryRequest(
    async (options) => {
      if (!options.retry) throw new Error("Connection unavailable");
      return { rows: [{ id: "recovered" }], count: 1 };
    },
    (value) => events.push(value),
  );
  await runner.run({}, "failed");
  assert.deepEqual(events[0].rows, []);
  assert.equal(events[0].error, "Connection unavailable");
  await runner.run({ retry: true }, "retried");
  assert.equal(events[1].error, "");
  assert.equal(events[1].rows[0].id, "recovered");
});
