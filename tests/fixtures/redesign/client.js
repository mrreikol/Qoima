import { products, categories, movements } from "./data.js";

// Isolated review only. No network, real credentials, storage or remote writes.
export const supabaseConfigurationError = "";
export const authRedirectError = "";
export const authRedirectUrl = (path) =>
  new URL(path, "http://localhost:5318").toString();
export const supabase = {
  auth: {
    signInWithPassword: async () => ({ error: { code: "local-review" } }),
    signUp: async () => ({ data: { session: null }, error: null }),
    updateUser: async () => ({ error: null }),
  },
  from(table) {
    let rows = [
      ...({ products, categories, stock_movements: movements }[table] || []),
    ];
    let start = 0,
      end = Infinity;
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      gte(key, value) {
        rows = rows.filter((row) => new Date(row[key]) >= new Date(value));
        return query;
      },
      lt(key, value) {
        rows = rows.filter((row) => new Date(row[key]) < new Date(value));
        return query;
      },
      order() {
        return query;
      },
      range(from, to) {
        start = from;
        end = to;
        return query;
      },
      abortSignal() {
        return query;
      },
      or() {
        throw new Error(
          "Search queries are covered by local integration tests, not this visual fixture.",
        );
      },
      then(resolve, reject) {
        return Promise.resolve({
          data: rows.slice(start, end + 1),
          count: rows.length,
          error: null,
        }).then(resolve, reject);
      },
    };
    return query;
  },
};
