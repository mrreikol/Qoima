// Count-based paging also handles API caps smaller than the requested page.
export async function readAllRows(makeQuery, signal) {
  const rows = [];
  for (;;) {
    signal?.throwIfAborted();
    let request = makeQuery().range(rows.length, rows.length + 499);
    if (signal) request = request.abortSignal(signal);
    const { data, count, error } = await request;
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0)
      throw new Error(
        "The response did not include a valid total. Please retry.",
      );
    rows.push(...data);
    if (rows.length >= count) return rows;
    if (!data.length)
      throw new Error("Data changed while loading. Please refresh and retry.");
  }
}
