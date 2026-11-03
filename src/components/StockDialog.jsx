import { useRef, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button, Field } from "./ui";
import { Modal } from "./InventoryState";
import {
  makeStockDraft,
  stockLabels,
  stockPreview,
  MAX_STOCK,
} from "../data/stockOperations";

export default function StockDialog({
  product,
  type,
  savedRequest,
  inventory,
  onRemember,
  onResolve,
  onClose,
  onSuccess,
}) {
  const [value, setValue] = useState(
    savedRequest ? String(savedRequest.quantity) : "",
  );
  const [note, setNote] = useState(savedRequest?.note || "");
  const [request, setRequest] = useState(savedRequest || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const preview = stockPreview(product.quantity, type, value);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    let draft;
    try {
      draft =
        request ||
        makeStockDraft(inventory.userId, product, type, value, note.trim());
      // Persist BEFORE sending: navigation, reload, or a lost response must not lose the UUID.
      onRemember(draft);
    } catch (error) {
      setError(
        error.message ||
          "Cannot store the recovery record. No request was sent.",
      );
      return;
    }
    setRequest(draft);
    setNote(draft.note);
    setValue(String(draft.quantity));
    setBusy(true);
    submitting.current = true;
    try {
      const movement = await inventory.changeStock(draft);
      onResolve(draft.operationId);
      onSuccess(movement);
    } catch (error) {
      if (error.uncertain === false) {
        try {
          onResolve(draft.operationId);
          setRequest(null);
        } catch {
          setError(
            "The recovery record could not be cleared. Keep the saved operation and retry with the same ID.",
          );
          return;
        }
      }
      setError(
        error.message ||
          "The result is uncertain. Retry the same saved operation.",
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <Modal
      title={stockLabels[type]}
      busy={busy}
      onClose={onClose}
      className="product-dialog stock-dialog"
    >
      <p className="product-dialog-description">
        <strong>{product.name}</strong>
        <br />
        {product.sku}
      </p>
      <div className="stock-balance">
        <span>
          {request
            ? "Quantity when request was prepared"
            : "Current quantity (snapshot)"}
        </span>
        <strong>{product.quantity.toLocaleString("en-US")} units</strong>
      </div>
      {request && !busy && (
        <p className="stock-recovery-note">
          This saved request is locked for safe replay. Retry it with the same
          inputs and operation ID, or keep it for later.
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset className="form-fieldset" disabled={busy}>
          <Field
            label={
              type === "ADJUSTMENT"
                ? "Actual quantity"
                : type === "IN"
                  ? "Units received"
                  : "Units removed"
            }
          >
            <input
              name="stock_quantity"
              type="number"
              autoFocus
              required
              min={type === "ADJUSTMENT" ? 0 : 1}
              max={MAX_STOCK}
              step="1"
              value={value}
              readOnly={!!request}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Field
            label={
              type === "ADJUSTMENT"
                ? "Reason for adjustment"
                : "Note (optional)"
            }
          >
            <textarea
              name="stock_note"
              rows={3}
              maxLength={2000}
              required={type === "ADJUSTMENT"}
              value={note}
              readOnly={!!request}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                type === "ADJUSTMENT"
                  ? "e.g. Physical count after stocktake"
                  : "e.g. Delivery reference or order number"
              }
            />
          </Field>
          <div className="stock-preview" aria-live="polite">
            <span>Resulting quantity (preview)</span>
            <strong>
              {product.quantity.toLocaleString("en-US")}
              <ArrowRight size={15} />
              {preview === null ? "—" : preview.toLocaleString("en-US")} units
            </strong>
          </div>
          <p className="stock-preview-note">
            The preview may change before submission. The recorded balance is
            authoritative.{" "}
            {preview !== null && (preview < 0 || preview > MAX_STOCK)
              ? "This preview is outside the allowed stock range; the server will check current stock."
              : ""}
          </p>
          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              {request ? "Keep for later" : "Cancel"}
            </Button>
            <Button type="submit">
              {busy && <LoaderCircle size={16} className="spinner" />}
              {busy
                ? "Recording..."
                : request
                  ? "Retry same operation"
                  : type === "ADJUSTMENT"
                    ? "Record adjustment"
                    : type === "IN"
                      ? "Record stock in"
                      : "Record stock out"}
            </Button>
          </div>
          {request && (
            <details className="stock-request-details">
              <summary>Saved request details</summary>
              <p className="stock-operation-id">
                Operation ID: {request.operationId}
              </p>
            </details>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
