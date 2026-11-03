import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import StockActivityChart from "../components/StockActivityChart";
import { useDashboardActivity } from "../inventory/useDashboardActivity";
import { PageHeading, Badge, Button } from "../components/ui";
import { InventoryState } from "../components/InventoryState";
import { inventoryTotals, moneyFromCents, getStatus } from "../data/inventory";
import "./dashboard.css";

export default function Dashboard({ inventory }) {
  const [days, setDays] = useState(7);
  const activity = useDashboardActivity(inventory.userId, days, inventory.revision);
  const totals = inventoryTotals(inventory.products);
  const active = inventory.products.filter((product) => !product.is_archived);
  const productMap = new Map(inventory.products.map((product) => [product.id, product]));

  return (
    <div className="dashboard-overview">
      <PageHeading title="Dashboard">
        <Button variant="secondary" onClick={inventory.refresh} disabled={inventory.loading}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh dashboard
        </Button>
        <Link className="button primary" to="/products">
          Manage inventory <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </PageHeading>
      <InventoryState inventory={inventory}>
        <section className="dashboard-current" aria-labelledby="current-inventory-title">
          <div className="dashboard-section-heading">
            <h2 id="current-inventory-title">Current inventory</h2>
            <p>Active products · independent of the chart period</p>
          </div>
          <dl className="dashboard-metrics">
            <div><dt>Active products</dt><dd>{totals.count.toLocaleString()}</dd><span>Archived products excluded</span></div>
            <div><dt>Total stock</dt><dd>{totals.quantity.toLocaleString()}</dd><span>Units on hand</span></div>
            <div><dt>Inventory cost value</dt><dd>{moneyFromCents(totals.costCents)}</dd><span>Quantity × cost price</span></div>
            <div><dt>Low stock items</dt><dd>{totals.lowStock.length.toLocaleString()}</dd><span>At or below minimum stock</span></div>
          </dl>
        </section>
        <div className="dashboard-analysis-grid">
          <StockActivityChart activity={activity} days={days} onPeriodChange={setDays} />
          <section className="dashboard-attention" aria-labelledby="attention-title">
            <div className="dashboard-section-heading">
              <h2 id="attention-title">Needs attention</h2>
              <span className="dashboard-section-count">{totals.lowStock.length}</span>
            </div>
            <div className="dashboard-attention-list">
              {totals.lowStock.slice(0, 4).map((product) => (
                <div className="dashboard-attention-row" key={product.id}>
                  <div>
                    <Link to={`/products/${product.id}`}>{product.name}</Link>
                    <span className="product-sku">{product.sku}</span>
                  </div>
                  <div className="dashboard-attention-balance">
                    <strong>{product.quantity.toLocaleString()} units</strong>
                    <span className={product.quantity === 0 ? "red-text" : "orange-text"}>{getStatus(product.quantity, product.min_stock)}</span>
                    <span>Minimum {product.min_stock.toLocaleString()}</span>
                  </div>
                </div>
              ))}
              {!totals.lowStock.length && (
                <div className="empty-state"><p>
                  {active.length
                    ? "All active products are above their minimum stock."
                    : inventory.products.length
                      ? "No active products. Your archived products and their history are still available."
                      : "Add your first product to start tracking stock levels."}
                </p></div>
              )}
            </div>
            <Link className="dashboard-section-link" to="/products?status=attention">
              View products needing attention <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
        <section className="dashboard-recent" aria-labelledby="recent-activity-title">
          <div className="dashboard-section-heading">
            <h2 id="recent-activity-title">Recent stock activity</h2>
            <Link className="dashboard-section-link" to="/history">View stock history <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <ol className="dashboard-movement-list">
            {inventory.recentMovements.slice(0, 4).map((movement) => (
              <li key={movement.id}>
                <div className="dashboard-movement-product">
                  <Link to={`/history?product=${encodeURIComponent(movement.product_id)}`}>{productMap.get(movement.product_id)?.name || "Unavailable product"}</Link>
                  {productMap.get(movement.product_id)?.is_archived && <span className="archived-label">Archived product</span>}
                </div>
                <span className="dashboard-movement-type"><Badge>{movement.type}</Badge></span>
                <strong className={`dashboard-movement-change ${movement.quantity_change > 0 ? "green-text" : "red-text"}`}>
                  {movement.quantity_change > 0 ? "+" : ""}{movement.quantity_change.toLocaleString()} units
                </strong>
                <time dateTime={movement.created_at}>{new Date(movement.created_at).toLocaleString("en-US")}</time>
              </li>
            ))}
          </ol>
          {!inventory.recentMovements.length && <div className="empty-state"><h3>No stock activity yet</h3><p>Your first product with initial stock will create an IN movement.</p></div>}
        </section>
      </InventoryState>
    </div>
  );
}
