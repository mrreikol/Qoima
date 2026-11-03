import { Link, useSearchParams } from "react-router-dom";
import { useReducer } from "react";
import {
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Field,
  PageHeading,
  Table,
} from "../components/ui";
import {
  HISTORY_PAGE_SIZES,
  formatHistoryTimestamp,
  historyViewReducer,
  initialHistoryView,
} from "../data/stockHistory";
import { useStockHistory } from "../inventory/useStockHistory";

export default function StockHistory({ inventory }) {
  const [params] = useSearchParams();
  const [view, dispatch] = useReducer(historyViewReducer, {
    ...initialHistoryView,
    productId: params.get("product") || "",
  });
  const history = useStockHistory(inventory.userId, view, inventory.revision);
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "browser local time";
  const hasFilters = !!(
    view.query.trim() ||
    view.productId ||
    view.type ||
    view.startDate ||
    view.endDate
  );
  const change = (name, value) => dispatch({ type: "filter", name, value });
  const offset = (view.page - 1) * view.pageSize;
  const first = history.rows.length ? offset + 1 : 0;
  const last = history.rows.length ? offset + history.rows.length : 0;
  const canNext =
    !history.loading &&
    !history.error &&
    history.count !== null &&
    last > 0 &&
    last < history.count;
  return (
    <section className="history-page" aria-labelledby="history-title">
      <PageHeading title={<span id="history-title">History</span>}>
        <Button
          variant="secondary"
          onClick={() => {
            dispatch({ type: "refresh" });
            inventory.refresh();
          }}
        >
          <RefreshCw size={15} />
          Refresh
        </Button>
      </PageHeading>
      <Card>
        <div className="history-filters">
          <Field label="Search product name or SKU">
            <input
              type="search"
              name="history_search"
              value={view.query}
              maxLength={150}
              placeholder="Name or SKU"
              onChange={(event) => change("query", event.target.value)}
            />
          </Field>
          <Field label="Product">
            <select
              value={view.productId}
              disabled={inventory.loading || !!inventory.error}
              onChange={(event) => change("productId", event.target.value)}
            >
              <option value="">All products</option>
              {view.productId &&
                !inventory.products.some(
                  (product) => product.id === view.productId,
                ) && (
                  <option value={view.productId}>
                    Selected product (options unavailable)
                  </option>
                )}
              {inventory.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — {product.sku}
                  {product.is_archived ? " (Archived)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Movement type">
            <select
              value={view.type}
              onChange={(event) => change("type", event.target.value)}
            >
              <option value="">All movements</option>
              <option value="IN">Stock in</option>
              <option value="OUT">Stock out</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              value={view.startDate}
              onChange={(event) => change("startDate", event.target.value)}
            />
          </Field>
          <Field label="Through date (inclusive)">
            <input
              type="date"
              value={view.endDate}
              onChange={(event) => change("endDate", event.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={!hasFilters}
            onClick={() => dispatch({ type: "clear" })}
          >
            Clear filters
          </Button>
        </div>
        <p className="history-timezone">
          Dates and timestamps use your local timezone:{" "}
          <strong>{timezone}</strong>. The end date includes the whole local
          day.
        </p>
        {inventory.error && (
          <p className="history-options-error" role="status">
            Product filter options are unavailable. You can still search by name
            or SKU.{" "}
            <button
              type="button"
              className="products-text-button"
              onClick={inventory.refresh}
            >
              Retry product options
            </button>
          </p>
        )}
        <div aria-busy={history.loading}>
          <Table>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Type</th>
                <th scope="col" className="history-number">
                  Change
                </th>
                <th scope="col" className="history-number">
                  Quantity after
                </th>
                <th scope="col">Note</th>
                <th scope="col">Date & time</th>
              </tr>
            </thead>
            <tbody>
              {history.loading ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <div className="history-loading" role="status">
                      <LoaderCircle size={20} className="spinner" />
                      Loading stock history...
                    </div>
                  </td>
                </tr>
              ) : history.error ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <div role="alert">
                      <h2>History unavailable</h2>
                      <p>{history.error}</p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => dispatch({ type: "retry" })}
                    >
                      Retry
                    </Button>
                  </td>
                </tr>
              ) : history.rows.length ? (
                history.rows.map((movement) => (
                  <tr key={movement.id}>
                    <td className="history-product">
                      <strong>
                        <Link
                          to={`/products/${encodeURIComponent(movement.product_id)}`}
                        >
                          {movement.product.name}
                        </Link>
                      </strong>
                      <small className="stock-minimum">
                        {movement.product.sku}
                      </small>
                      {movement.product.is_archived && (
                        <span className="history-archived">Archived</span>
                      )}
                    </td>
                    <td>
                      <Badge>{movement.type}</Badge>
                    </td>
                    <td
                      className={`history-number ${movement.quantity_change > 0 ? "green-text" : "red-text"}`}
                    >
                      {movement.quantity_change > 0 ? "+" : ""}
                      {movement.quantity_change.toLocaleString("en-US")}
                    </td>
                    <td className="history-number">
                      {movement.quantity_after.toLocaleString("en-US")}
                    </td>
                    <td className="history-note">{movement.note || "—"}</td>
                    <td className="muted">
                      <time dateTime={movement.created_at}>
                        {formatHistoryTimestamp(movement.created_at)}
                      </time>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <h2>
                      {history.count > 0
                        ? "No movements on this page"
                        : hasFilters
                          ? "No matching stock movements"
                          : "No stock movements yet"}
                    </h2>
                    <p>
                      {history.count > 0
                        ? "History may have changed. Refresh to return to the first page."
                        : hasFilters
                          ? "Try a different search or date range, or clear the filters."
                          : "Record stock operations from Products to build your history."}
                    </p>
                    {hasFilters && (
                      <Button
                        variant="secondary"
                        onClick={() => dispatch({ type: "clear" })}
                      >
                        Clear filters
                      </Button>
                    )}
                    {!hasFilters && history.count === 0 && (
                      <Link className="text-link" to="/products">
                        Go to products
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
        <div className="table-footer history-pagination">
          <span role="status">
            {history.loading
              ? "Loading..."
              : history.error
                ? "History not loaded"
                : `${first}–${last} of ${history.count} matching movements`}
          </span>
          <div className="history-page-controls">
            <label>
              Rows per page
              <select
                aria-label="Rows per page"
                value={view.pageSize}
                onChange={(event) =>
                  dispatch({
                    type: "pageSize",
                    value: Number(event.target.value),
                  })
                }
              >
                {HISTORY_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={history.loading || !!history.error || view.page === 1}
              onClick={() => dispatch({ type: "page", page: view.page - 1 })}
            >
              <ChevronLeft size={15} />
              Previous
            </Button>
            <span>Page {view.page}</span>
            <Button
              variant="secondary"
              disabled={!canNext}
              onClick={() => dispatch({ type: "page", page: view.page + 1 })}
            >
              Next
              <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
