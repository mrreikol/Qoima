// Cancellation is an optimization; the generation check also rejects responses
// from transports that ignore AbortSignal, including errors arriving late.
export function createLatestHistoryRequest(load, publish) {
  let generation = 0;
  let controller;
  return {
    async run(options, key) {
      const version = ++generation;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const result = await load(options, current.signal);
        if (version === generation && !current.signal.aborted)
          publish({ key, ...result, error: "" });
      } catch (error) {
        if (version === generation && !current.signal.aborted)
          publish({
            key,
            rows: [],
            count: null,
            error:
              error.message || "Unable to load stock history. Please retry.",
          });
      }
    },
    cancel() {
      generation++;
      controller?.abort();
    },
  };
}
