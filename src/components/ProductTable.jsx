import { Link } from "react-router-dom";
import { Badge } from "./ui";
import ActionMenu from "./ActionMenu";
import { money } from "../data/inventory";

function StockActions({ product, disabled, onStock }) {
  if (product.is_archived)
    return <span className="product-readonly">Archived · Read only</span>;
  return (
    <div
      className="product-stock-actions"
      role="group"
      aria-label={`Stock changes for ${product.name}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStock(product, "IN")}
      >
        Stock in
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onStock(product, "OUT")}
      >
        Stock out
      </button>
      <button
        type="button"
        className="adjust-stock-action"
        disabled={disabled}
        onClick={() => onStock(product, "ADJUSTMENT")}
      >
        Adjust stock
      </button>
    </div>
  );
}
function OtherActions({ product, onEdit, onArchive }) {
  return (
    <ActionMenu accessibleLabel={`More actions for ${product.name}`}>
      {!product.is_archived && (
        <button type="button" onClick={() => onEdit(product)}>
          Edit details
        </button>
      )}
      <Link to={`/products/${product.id}`}>Product details</Link>
      <Link to={`/history?product=${product.id}`}>View history</Link>
      {!product.is_archived && (
        <button
          type="button"
          className="danger-action"
          onClick={() => onArchive(product)}
        >
          Archive product
        </button>
      )}
    </ActionMenu>
  );
}
export default function ProductTable({
  products,
  categories,
  onEdit,
  onArchive,
  onStock,
  stockDisabled = false,
  emptyState,
}) {
  if (!products.length)
    return <div className="products-table-empty">{emptyState}</div>;
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const identity = (product) => (
    <>
      <Link className="product-name" to={`/products/${product.id}`}>
        {product.name}
      </Link>
      <span className="product-sku">
        {product.sku} · {names.get(product.category_id) || "Uncategorized"}
        {product.is_archived && (
          <span className="product-archived-tag">Archived</span>
        )}
      </span>
    </>
  );
  return (
    <>
      <div
        className="products-table-scroll"
        role="region"
        aria-label="Products table, scroll horizontally for more columns"
        tabIndex={0}
      >
        <table className="products-table">
          <caption className="visually-hidden">
            Inventory products with quantities, prices, stock status, and
            separate stock changes and metadata actions
          </caption>
          <thead>
            <tr>
              <th scope="col">Product · details</th>
              <th scope="col" className="numeric-cell">
                On hand
              </th>
              <th scope="col" className="numeric-cell">
                Minimum
              </th>
              <th scope="col">Status</th>
              <th scope="col" className="numeric-cell">
                Cost price
              </th>
              <th scope="col" className="numeric-cell">
                Selling price
              </th>
              <th scope="col">Stock changes</th>
              <th scope="col">
                <span className="visually-hidden">Other actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <th scope="row" className="product-name-cell">
                  {identity(product)}
                </th>
                <td className="numeric-cell product-quantity">
                  {product.quantity.toLocaleString("en-US")}
                </td>
                <td className="numeric-cell">
                  {product.min_stock.toLocaleString("en-US")}
                </td>
                <td>
                  <Badge
                    quantity={product.quantity}
                    minStock={product.min_stock}
                  />
                </td>
                <td className="numeric-cell">{money(product.cost_price)}</td>
                <td className="numeric-cell">{money(product.selling_price)}</td>
                <td>
                  <StockActions
                    product={product}
                    disabled={stockDisabled}
                    onStock={onStock}
                  />
                </td>
                <td>
                  <OtherActions
                    product={product}
                    onEdit={onEdit}
                    onArchive={onArchive}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="products-mobile-list" aria-label="Products list">
        {products.map((product) => (
          <article className="mobile-product" key={product.id}>
            <div className="mobile-product-heading">
              <div>{identity(product)}</div>
              <OtherActions
                product={product}
                onEdit={onEdit}
                onArchive={onArchive}
              />
            </div>
            <div className="mobile-stock-balance">
              <span>
                <strong>{product.quantity.toLocaleString("en-US")}</strong> on
                hand · Minimum {product.min_stock.toLocaleString("en-US")}
              </span>
              <Badge quantity={product.quantity} minStock={product.min_stock} />
            </div>
            <StockActions
              product={product}
              disabled={stockDisabled}
              onStock={onStock}
            />
          </article>
        ))}
      </div>
    </>
  );
}
