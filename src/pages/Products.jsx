import { useCompactLayout } from "../components/useCompactLayout";
import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { Button, Card } from "../components/ui";
import { InventoryState, Modal } from "../components/InventoryState";
import ProductDetails from "../components/ProductDetails";
import { findOwnedProduct, productEmptyState } from "../data/productViews";
import InventoryExport from "../components/InventoryExport";
import ProductForm from "../components/ProductForm";
import ProductTable from "../components/ProductTable";
import StockDialog from "../components/StockDialog";
import {
  readStockDraft,
  rememberStockDraft,
  forgetStockDraft,
  stockLabels,
} from "../data/stockOperations";
import { filterProducts } from "../data/inventory";
import { availableCategoryFilter } from "../data/categoryDeletion";

export default function Products({ inventory, detailMode = false }) {
  const { id } = useParams();
  const compact = useCompactLayout();
  const archivePending = useRef(false);
  function loadSavedStock() {
    try {
      return {
        request: readStockDraft(window.sessionStorage, inventory.userId),
        error: "",
      };
    } catch {
      return {
        request: null,
        error:
          "Stock recovery is unavailable. Check browser session storage or verify the saved operation before clearing it. Do not start a replacement operation.",
      };
    }
  }
  const [journal, setJournal] = useState(loadSavedStock);
  const [stock, setStock] = useState(null);
  function rememberStock(request) {
    try {
      rememberStockDraft(window.sessionStorage, inventory.userId, request);
    } catch {
      throw new Error(
        "Cannot save the operation recovery record. No request was sent. Check browser session storage and retry.",
      );
    }
    setJournal({ request, error: "" });
  }
  function resolveStock(operationId) {
    forgetStockDraft(window.sessionStorage, inventory.userId, operationId);
    setJournal({ request: null, error: "" });
  }
  const [params] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedCategory, setCategory] = useState("");
  const category = inventory.loading || inventory.error ? selectedCategory
    : availableCategoryFilter(selectedCategory, inventory.categories);
  const [status, setStatus] = useState(
    params.get("status") === "attention" ? "attention" : "",
  );
  const [archive, setArchive] = useState(
    params.get("archive") === "archived" ? "archived" : "active",
  );
  const [sort, setSort] = useState("name");
  const [form, setForm] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const filters = { query, category, status, archive, sort };
  const filtered = filterProducts(inventory.products, filters);
  const activeCount = inventory.products.filter(
    (product) => !product.is_archived,
  ).length;
  const archivedCount = inventory.products.length - activeCount;
  const hasFilters = !!(query || category || status || archive !== "active");
  const categoryName =
    category === "uncategorized"
      ? "Uncategorized"
      : inventory.categories.find((item) => item.id === category)?.name;
  function clearFilters() {
    setQuery("");
    setCategory("");
    setStatus("");
    setArchive("active");
  }
  async function archiveProduct() {
    if (archivePending.current) return;
    archivePending.current = true;
    setBusy(true);
    setError("");
    try {
      await inventory.archiveProduct(archiving.id);
      setArchiving(null);
      setSuccess("Product archived. Its stock history has been preserved.");
    } catch (error) {
      setError(error.message);
    } finally {
      archivePending.current = false;
      setBusy(false);
    }
  }
  const emptyKind = productEmptyState(inventory.products, filters);
  const noInventory = emptyKind === "inventory";
  const noActive = emptyKind === "active";
  const emptyArchived = emptyKind === "archived";
  const emptyState = (
    <div className="products-empty">
      <h2>
        {noInventory
          ? "No products yet"
          : noActive
            ? "No active products"
            : emptyArchived
              ? "No archived products"
              : "No matching products"}
      </h2>
      <p>
        {noInventory
          ? "Add a product, then record stock in or stock out."
          : noActive
            ? "All your products are archived. View them or add a new product."
            : emptyArchived
              ? "Products you archive stay here, with their stock history intact."
              : "Change your search or clear the filters."}
      </p>
      {(noInventory || noActive) && (
        <Button onClick={() => setForm({})}>Add product</Button>
      )}
      {(noActive || emptyArchived) && (
        <button
          type="button"
          className="products-text-button"
          onClick={() => setArchive(noActive ? "archived" : "active")}
        >
          {noActive ? "View archived products" : "View active products"}
        </button>
      )}
      {!noInventory && !emptyArchived && !noActive && (
        <button
          type="button"
          className="products-text-button"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  );
  const scopeCount =
    archive === "active"
      ? activeCount
      : archive === "archived"
        ? archivedCount
        : inventory.products.length;
  const attentionCount = filterProducts(inventory.products, {
    query,
    category,
    status: "attention",
    archive: "active",
  }).length;
  const narrowed = !!(query || category || status);
  const actions = {
    onStock: (product, type) => {
      setSuccess("");
      setStock({ product, type });
    },
    onEdit: (product) => {
      setSuccess("");
      setForm(product);
    },
    onArchive: (product) => {
      setError("");
      setArchiving(product);
    },
  };
  const searchControl = (
    <label className="field products-search-control">
      Search products
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Name or SKU"
      />
    </label>
  );
  return (
    <section className="products-page" aria-labelledby="products-title">
      {detailMode && (
        <Link className="text-link" to="/products">
          Back to products
        </Link>
      )}
      <div className="products-heading">
        <h1 id="products-title" tabIndex={-1}>
          {detailMode ? "Product details" : "Products"}
        </h1>
        <div className="products-heading-actions">
          {(!compact || detailMode) && (
            <Button
              variant="secondary"
              disabled={inventory.loading}
              onClick={inventory.refresh}
            >
              Refresh
            </Button>
          )}
          {!detailMode && !compact && (
            <InventoryExport
              inventory={inventory}
              filters={filters}
              matchingCount={filtered.length}
            />
          )}
          {!detailMode && (
            <Button
              disabled={inventory.loading || !!inventory.error}
              onClick={() => {
                setSuccess("");
                setForm({});
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Add product
            </Button>
          )}
        </div>
      </div>
      {success && (
        <div role="status" className="products-success">
          <span>{success}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setSuccess("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {journal.error && (
        <div role="alert" className="auth-message error">
          {journal.error}
          <button
            type="button"
            className="products-text-button"
            onClick={() => setJournal(loadSavedStock())}
          >
            Retry recovery lookup
          </button>
        </div>
      )}
      {journal.request && !stock && (
        <div className="stock-pending-banner" role="status">
          <div>
            <strong>Stock operation not confirmed</strong>
            <p>
              {journal.request.product.name} ·{" "}
              {stockLabels[journal.request.type]} · {journal.request.quantity}{" "}
              units. Resume the saved request before starting another stock
              change.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              setStock({
                product: journal.request.product,
                type: journal.request.type,
              })
            }
          >
            Resume saved operation
          </Button>
        </div>
      )}
      <InventoryState inventory={inventory}>
        {detailMode ? (
          <ProductDetails
            product={findOwnedProduct(inventory.products, id)}
            categories={inventory.categories}
            stockDisabled={!!journal.request || !!journal.error}
            {...actions}
          />
        ) : (
          <Card className="products-panel">
            {compact && (
              <div className="products-mobile-search">{searchControl}</div>
            )}
            <div
              className="products-views"
              role="group"
              aria-label="Product visibility"
            >
              {[
                { value: "active", label: "Active", count: activeCount },
                { value: "archived", label: "Archived", count: archivedCount },
                {
                  value: "all",
                  label: "All",
                  count: inventory.products.length,
                },
              ].map((view) => (
                <button
                  type="button"
                  key={view.value}
                  aria-pressed={archive === view.value}
                  onClick={() => setArchive(view.value)}
                >
                  {view.label}
                  <span>{view.count}</span>
                </button>
              ))}
            </div>
            <div className="products-toolbar">
              {!compact && searchControl}
              <label className="field products-category-control">
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">All categories</option>
                  <option value="uncategorized">Uncategorized</option>
                  {inventory.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field products-status-control">
                Stock status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option>In stock</option>
                  <option>Low stock</option>
                  <option>Out of stock</option>
                  <option value="attention">Needs attention</option>
                </select>
              </label>
              <label className="field products-sort-control">
                Sort by
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="name">Name A–Z</option>
                  <option value="sku">SKU A–Z</option>
                  <option value="quantity">Quantity: low to high</option>
                  <option value="newest">Newest first</option>
                </select>
              </label>
            </div>
            {hasFilters && (
              <div
                className="products-active-filters"
                aria-label="Active filters"
              >
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Remove search filter"
                  >
                    Search: {query}
                    <X size={12} />
                  </button>
                )}
                {category && (
                  <button
                    type="button"
                    onClick={() => setCategory("")}
                    aria-label="Remove category filter"
                  >
                    Category: {categoryName || "Selected category"}
                    <X size={12} />
                  </button>
                )}
                {status && (
                  <button
                    type="button"
                    onClick={() => setStatus("")}
                    aria-label="Remove stock status filter"
                  >
                    {status === "attention" ? "Needs attention" : status}
                    <X size={12} />
                  </button>
                )}
                {archive !== "active" && (
                  <button
                    type="button"
                    onClick={() => setArchive("active")}
                    aria-label="Reset to active products"
                  >
                    {archive === "archived" ? "Archived" : "All products"}
                    <X size={12} />
                  </button>
                )}
                <button
                  type="button"
                  className="products-text-button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            )}
            <div className="products-result-line">
              {selectedCategory && !category && <span role="status">The selected category was removed. Showing all categories.</span>}
              <div className="products-result-summary">
                <span role="status">
                  {narrowed
                    ? `${filtered.length} of ${scopeCount}`
                    : scopeCount}{" "}
                  {archive === "all" ? "total" : archive}{" "}
                  {scopeCount === 1 ? "product" : "products"}
                </span>
                {archive !== "archived" && (
                  <button
                    type="button"
                    className="products-text-button"
                    onClick={() => {
                      setArchive("active");
                      setStatus("attention");
                    }}
                  >
                    {attentionCount} need attention
                  </button>
                )}
              </div>
              {compact && (
                <InventoryExport
                  inventory={inventory}
                  filters={filters}
                  matchingCount={filtered.length}
                />
              )}
            </div>
            <ProductTable
              products={filtered}
              categories={inventory.categories}
              emptyState={emptyState}
              stockDisabled={!!journal.request || !!journal.error}
              {...actions}
            />
            <div className="products-table-footer">
              Prices in USD
              {compact && (
                <button
                  type="button"
                  className="products-text-button"
                  onClick={inventory.refresh}
                >
                  Refresh
                </button>
              )}
            </div>
          </Card>
        )}
      </InventoryState>
      {form && (
        <ProductForm
          product={form.id ? form : null}
          inventory={inventory}
          onClose={() => setForm(null)}
        />
      )}
      {stock && (
        <StockDialog
          product={stock.product}
          type={stock.type}
          savedRequest={journal.request}
          inventory={inventory}
          onRemember={rememberStock}
          onResolve={resolveStock}
          onClose={() => setStock(null)}
          onSuccess={(movement) => {
            setStock(null);
            setSuccess(
              `${stockLabels[movement.type]} recorded: ${movement.quantity_change > 0 ? "+" : ""}${movement.quantity_change} units. Recorded balance: ${movement.quantity_after} units. Inventory is refreshing.`,
            );
          }}
        />
      )}
      {archiving && (
        <Modal
          title="Archive product?"
          busy={busy}
          className="product-dialog product-archive-dialog"
          onClose={() => setArchiving(null)}
        >
          <p className="product-dialog-description">
            <strong>{archiving.name}</strong> will move out of active inventory.
            Its quantity and stock history will be preserved.
          </p>
          {error && (
            <p role="alert" className="auth-message error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setArchiving(null)}
            >
              Keep product
            </Button>
            <Button className="danger" disabled={busy} onClick={archiveProduct}>
              {busy ? "Archiving..." : "Archive product"}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
