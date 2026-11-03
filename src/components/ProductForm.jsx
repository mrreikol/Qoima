import { useRef, useState } from "react";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { Button, Field } from "./ui";
import { Modal } from "./InventoryState";
import { productFields } from "../data/inventory";

export default function ProductForm({ product, inventory, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = !!product;
  const submitting = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const form = new FormData(event.currentTarget);
    let fields, quantity;
    try {
      fields = productFields(form);
      if (!editing) {
        quantity = Number(form.get("initial_quantity"));
        if (
          !Number.isInteger(quantity) ||
          quantity < 0 ||
          quantity > 2147483647
        )
          throw new Error(
            "Initial quantity must be a nonnegative whole number.",
          );
      }
    } catch (error) {
      setError(error.message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (editing) await inventory.updateProduct(product.id, fields);
      else await inventory.createProduct(fields, quantity);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={editing ? "Edit details" : "Add product"}
      busy={busy}
      onClose={onClose}
      className="product-dialog"
    >
      <p className="product-dialog-description">
        {editing
          ? "Update product details. Quantity cannot be changed here."
          : "Initial stock is recorded once with an opening stock movement."}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="form-fieldset">
          <div className="product-form-details">
            <p className="product-form-section-label">Product details</p>
            <Field label="Product name">
              <input
                name="name"
                required
                autoFocus
                maxLength={150}
                placeholder="e.g. Wireless keyboard"
                defaultValue={product?.name || ""}
              />
            </Field>
            <div className="form-grid product-identity-grid">
              <Field label="SKU">
                <input
                  name="sku"
                  required
                  maxLength={64}
                  placeholder="e.g. ELC-001"
                  defaultValue={product?.sku || ""}
                />
              </Field>
              <Field label="Category">
                <select
                  name="category_id"
                  defaultValue={product?.category_id || ""}
                >
                  <option value="">Uncategorized</option>
                  {inventory.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea
                name="description"
                maxLength={2000}
                rows={3}
                placeholder="Optional product details"
                defaultValue={product?.description || ""}
              />
            </Field>
          </div>
          <p className="product-form-section-label">Stock & pricing</p>
          <div className="form-grid">
            {editing && (
              <div className="product-readonly-quantity">
                <span>Current quantity</span>
                <strong>
                  {product.quantity} units <LockKeyhole size={14} />
                </strong>
              </div>
            )}
            {!editing && (
              <Field label="Initial quantity">
                <input
                  name="initial_quantity"
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  defaultValue="0"
                />
              </Field>
            )}
            <Field label="Minimum stock">
              <input
                name="min_stock"
                type="number"
                required
                min="0"
                max="2147483647"
                step="1"
                defaultValue={product?.min_stock ?? 0}
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Cost price (USD)">
              <input
                name="cost_price"
                type="number"
                required
                min="0"
                max="9999999999.99"
                step="0.01"
                defaultValue={product?.cost_price ?? 0}
              />
            </Field>
            <Field label="Selling price (USD)">
              <input
                name="selling_price"
                type="number"
                required
                min="0"
                max="9999999999.99"
                step="0.01"
                defaultValue={product?.selling_price ?? 0}
              />
            </Field>
          </div>
          {editing && (
            <p className="product-quantity-note">
              <LockKeyhole size={15} />
              <span>
                Quantity is read only. This form only updates product details
                and pricing.
              </span>
            </p>
          )}
          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions product-form-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {busy && <LoaderCircle size={16} className="spinner" />}
              {busy ? "Saving..." : editing ? "Save changes" : "Create product"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
