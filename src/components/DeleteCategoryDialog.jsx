import { useEffect, useRef, useState } from "react";
import { Modal } from "./InventoryState";
import { Button, Field } from "./ui";
import { categoryDeletionPreview, categoryDeletionRefreshState } from "../data/categoryDeletion";

export default function DeleteCategoryDialog({ category, inventory, onClose, onComplete }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [destinationId, setDestination] = useState("");
  const [error, setError] = useState("");
  const [refreshRevision, setRefreshRevision] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const preview = categoryDeletionPreview(category.id, inventory.products);
  const currentCategory = inventory.categories.find(item => item.id === category.id) || category;
  const destinations = inventory.categories.filter(item => item.id !== category.id);
  const refreshing = refreshRevision !== null;
  const refreshState = categoryDeletionRefreshState(refreshRevision, inventory, category.id);
  const refreshCompleted = refreshState === "ready" || refreshState === "gone";

  // A failed/uncertain RPC never enables another deletion against old counts.
  useEffect(() => {
    if (refreshState === "gone") {
      onComplete("Category is no longer present. Inventory has been refreshed.");
      return;
    }
  }, [refreshState, onComplete]);

  function refresh() {
    setRefreshRevision(inventory.revision);
    inventory.refresh();
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current || refreshing || inventory.loading || inventory.error) return;
    const disposition = preview.count ? action : "empty";
    if (preview.count && (!action || (action === "move" && !destinationId))) {
      setError("Choose what happens to all affected products.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await inventory.deleteCategory({ categoryId: category.id, action: disposition, destinationId: action === "move" ? destinationId : null });
      onComplete(`Category deleted. ${result.affected_products} products reassigned; products and stock history were preserved.`);
    } catch (failure) {
      setError(failure.message);
      setReviewed(false);
      refresh();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <Modal title="Delete category" className="category-delete-dialog" busy={busy} onClose={onClose}>
    <form onSubmit={submit}>
      <p>Delete <strong>{currentCategory.name}</strong>?</p>
      {(refreshing && !refreshCompleted) || inventory.loading ? <p role="status">Refreshing current categories and products before another attempt...</p> :
        <p>{preview.count} affected products, including {preview.archived} archived. Products, quantities and stock history will be kept.</p>}
      <p className="muted">This count is a preview. The database processes the current products when you confirm.</p>
      {!refreshing && !inventory.loading && !inventory.error && <fieldset className="form-fieldset" disabled={busy}>
        {preview.count > 0 ? <>
          <Field label="What should happen to these products?">
            <select required value={action} onChange={event => setAction(event.target.value)}>
              <option value="">Choose an action</option>
              <option value="uncategorized">Leave products uncategorized</option>
              <option value="move" disabled={!destinations.length}>Move products to another category</option>
            </select>
          </Field>
          {action === "move" && <Field label="Destination category">
            <select required value={destinationId} onChange={event => setDestination(event.target.value)}>
              <option value="">Choose a category</option>
              {destinations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>}
          <p>{action === "uncategorized" ? "All affected products, including archived products, will have no category." : action === "move" ? "All affected products, including archived products, will move to the selected category." : "Choose an action to continue."}</p>
        </> : <p>Only the empty category will be deleted. If products are assigned before confirmation, deletion will stop and require a new choice.</p>}
      </fieldset>}
      {error && <p className="auth-message error" role="alert">{error}</p>}
      {reviewed && <p role="status">Inventory refreshed. Review the current count and confirm again.</p>}
      {refreshCompleted && <Button type="button" variant="secondary" onClick={() => {
        setRefreshRevision(null); setAction(""); setDestination(""); setReviewed(true); setError("");
      }}>Review refreshed category</Button>}
      {refreshing && inventory.error && <>
        <p role="alert">Refresh failed. Another deletion attempt is blocked until inventory loads successfully.</p>
        <Button type="button" variant="secondary" onClick={refresh}>Refresh inventory</Button>
      </>}
      <div className="modal-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={busy || refreshing || inventory.loading || !!inventory.error || (preview.count > 0 && (!action || (action === "move" && !destinationId)))}>
          {busy ? "Deleting category..." : "Delete category"}
        </Button>
      </div>
    </form>
  </Modal>;
}
