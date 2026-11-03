import { Link } from "react-router-dom";
import { Package, Search, Pencil, Archive } from "lucide-react";
import { getStatus, money } from "../data/inventory";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Card({ children, className = "", ...props }) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Badge({ quantity, minStock, children }) {
  const status =
    quantity === undefined ? children : getStatus(quantity, minStock);
  return (
    <span
      className={`badge ${["In stock", "IN"].includes(status) ? "success" : ["Low stock", "ADJUSTMENT"].includes(status) ? "warning" : "danger"}`}
    >
      <span />
      {status}
    </span>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ProductIcon() {
  return (
    <span className="product-icon blue">
      <Package size={21} strokeWidth={1.6} />
    </span>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search products...",
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}
export function PageHeading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Table({ children }) {
  return (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  );
}
export function ProductsTable({
  products,
  categories = [],
  onEdit,
  onArchive,
  emptyState,
}) {
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const actions = !!onEdit;
  return (
    <Table>
      <thead>
        <tr>
          <th>Product name</th>
          <th>SKU</th>
          <th>Category</th>
          <th>Stock level</th>
          <th>Cost / sale price</th>
          <th>Status</th>
          {actions && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <tr key={product.id}>
            <td>
              <div className="product-cell">
                <ProductIcon />
                <span>
                  <Link to={`/products/${encodeURIComponent(product.id)}`}>
                    {product.name}
                  </Link>
                  {product.is_archived && (
                    <small className="archived-label">Archived</small>
                  )}
                </span>
              </div>
            </td>
            <td className="muted mono">{product.sku}</td>
            <td className="muted">
              {categoryNames.get(product.category_id) || "Uncategorized"}
            </td>
            <td>
              <strong>{product.quantity}</strong>
              <span className="muted"> units</span>
              <small className="stock-minimum">
                Minimum: {product.min_stock}
              </small>
            </td>
            <td>
              {money(product.cost_price)}
              <span className="muted"> / {money(product.selling_price)}</span>
            </td>
            <td>
              <Badge quantity={product.quantity} minStock={product.min_stock} />
            </td>
            {actions && (
              <td>
                {!product.is_archived ? (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${product.name}`}
                      onClick={() => onEdit(product)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Archive ${product.name}`}
                      onClick={() => onArchive(product)}
                    >
                      <Archive size={16} />
                    </button>
                  </div>
                ) : (
                  <span className="muted">Read only</span>
                )}
              </td>
            )}
          </tr>
        ))}
        {!products.length && (
          <tr>
            <td colSpan={actions ? 7 : 6} className="empty-state">
              {emptyState ||
                "No products to show. Add a product or adjust your filters."}
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}
export function StatCard({ label, value, note }) {
  return (
    <Card className="stat-card">
      <div className="stat-top">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </Card>
  );
}
