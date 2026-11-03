export const HISTORY_PAGE_SIZES = [25, 50, 100];
export const initialHistoryView = {
  query: "",
  productId: "",
  type: "",
  startDate: "",
  endDate: "",
  page: 1,
  pageSize: 25,
  attempt: 0,
};
export function historyViewReducer(state, action) {
  if (action.type === "filter")
    return { ...state, [action.name]: action.value, page: 1 };
  if (action.type === "page")
    return { ...state, page: Math.max(1, action.page) };
  if (action.type === "pageSize")
    return { ...state, pageSize: action.value, page: 1 };
  if (action.type === "clear")
    return {
      ...initialHistoryView,
      pageSize: state.pageSize,
      attempt: state.attempt + 1,
    };
  if (action.type === "refresh")
    return { ...state, page: 1, attempt: state.attempt + 1 };
  if (action.type === "retry") return { ...state, attempt: state.attempt + 1 };
  return state;
}
function calendarParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Enter dates in YYYY-MM-DD format.");
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(0, 0, 0, 0);
  if (
    year < 1 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new Error("Enter a valid calendar date.");
  return [year, month, day];
}
function localMidnight(value, nextDay = false) {
  const [year, month, day] = calendarParts(value);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day + (nextDay ? 1 : 0));
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
export function historyDateBounds(startDate = "", endDate = "") {
  const startUTC = startDate ? localMidnight(startDate) : null;
  const endExclusiveUTC = endDate ? localMidnight(endDate, true) : null;
  if (startDate && endDate && startDate > endDate)
    throw new Error("End date must be on or after the start date.");
  return { startUTC, endExclusiveUTC };
}
// Literal POSIX regex substring: %, _, *, quotes, commas and parentheses are data.
export function historySearchFilter(value) {
  const escaped = value.replace(/[\\.^$|?*+()[\]{}]/g, "\\$&");
  const quoted = `"${escaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `name.imatch.${quoted},sku.imatch.${quoted}`;
}
export function normalizeHistoryQuery({
  userId,
  query = "",
  productId = "",
  type = "",
  startDate = "",
  endDate = "",
  page = 1,
  pageSize = 25,
}) {
  if (!userId)
    throw new Error("An authenticated user is required to load history.");
  if (
    !HISTORY_PAGE_SIZES.includes(pageSize) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger((page - 1) * pageSize)
  )
    throw new Error("Choose a valid history page and page size.");
  if (type && !["IN", "OUT", "ADJUSTMENT"].includes(type))
    throw new Error("Choose a valid movement type.");
  if (
    productId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      productId,
    )
  )
    throw new Error("Choose a valid product.");
  if (typeof query !== "string" || query.length > 150)
    throw new Error("Search must contain at most 150 characters.");
  return {
    userId,
    productId,
    type,
    page,
    pageSize,
    query: query.trim(),
    offset: (page - 1) * pageSize,
    ...historyDateBounds(startDate, endDate),
  };
}
export function formatHistoryTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
