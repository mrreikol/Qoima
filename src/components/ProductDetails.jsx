import { Link } from "react-router-dom";
import { Badge, Button, Card } from "./ui";
import { money } from "../data/inventory";
import { formatHistoryTimestamp } from "../data/stockHistory";

export default function ProductDetails({
  product,
  categories,
  onStock,
  onEdit,
  onArchive,
  stockDisabled,
}) {
  if (!product)
    return (
      <Card className="empty-state">
        <h2>Product unavailable</h2>
        <p>This product does not exist or is unavailable to this account.</p>
        <Link className="text-link" to="/products">
          Back to products
        </Link>
      </Card>
    );
  const category =
    categories.find((item) => item.id === product.category_id)?.name ||
    "Uncategorized";
  return (
    <Card className="product-details">
      <div className="card-heading">
        <div>
          <h2>{product.name}</h2>
          <p>{product.sku}</p>
        </div>
        <span>{product.is_archived ? "Archived · Read only" : "Active"}</span>
      </div>
      <div className="product-stock-summary">
        <div>
          <span>On hand</span>
          <strong>
            {product.quantity.toLocaleString("en-US")} <small>units</small>
          </strong>
          <span>Minimum stock: {product.min_stock.toLocaleString("en-US")}</span>
        </div>
        <Badge quantity={product.quantity} minStock={product.min_stock} />
        <Link
          className="text-link"
          to={`/history?product=${encodeURIComponent(product.id)}`}
        >
          View product history
        </Link>
      </div>
      <div className="product-detail-actions">
        {!product.is_archived && (
          <>
            <Button
              disabled={stockDisabled}
              onClick={() => onStock(product, "IN")}
            >
              Stock in
            </Button>
            <Button
              variant="secondary"
              disabled={stockDisabled}
              onClick={() => onStock(product, "OUT")}
            >
              Stock out
            </Button>
            <Button
              variant="secondary"
              disabled={stockDisabled}
              onClick={() => onStock(product, "ADJUSTMENT")}
            >
              Adjust stock
            </Button>
            <Button
              className="detail-metadata-edit"
              variant="secondary"
              onClick={() => onEdit(product)}
            >
              Edit product
            </Button>
            <Button variant="secondary" onClick={() => onArchive(product)}>
              Archive product
            </Button>
          </>
        )}
      </div>
      <dl className="product-details-grid">
        <div>
          <dt>Category</dt>
          <dd>{category}</dd>
        </div>
        <div>
          <dt>Cost price</dt>
          <dd>{money(product.cost_price)}</dd>
        </div>
        <div>
          <dt>Selling price</dt>
          <dd>{money(product.selling_price)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatHistoryTimestamp(product.created_at)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatHistoryTimestamp(product.updated_at)}</dd>
        </div>
        <div className="product-details-description">
          <dt>Description</dt>
          <dd>{product.description || "No description provided."}</dd>
        </div>
      </dl>
    </Card>
  );
}
