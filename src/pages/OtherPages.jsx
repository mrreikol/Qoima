import { useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card, PageHeading, Field, Button } from "../components/ui";
import { InventoryState, Modal } from "../components/InventoryState";
import { inventoryTotals, moneyFromCents } from "../data/inventory";
import DeleteCategoryDialog from "../components/DeleteCategoryDialog";
import "./categories.css";

export function Categories({ inventory }) {
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const name = new FormData(event.currentTarget).get("name").trim();
    if (!name) {
      setError("Enter a category name.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (editing.id) await inventory.renameCategory(editing.id, name);
      else await inventory.createCategory(name);
      setSuccess(editing.id ? "Category renamed." : "Category created.");
      setEditing(null);
    } catch (error) {
      setError(error.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function open(category) {
    setError("");
    setSuccess("");
    setEditing(category);
  }
  return (
    <>
      <PageHeading title="Categories">
        <Button
          disabled={inventory.loading || !!inventory.error}
          onClick={() => open({})}
        >
          <Plus size={17} />
          Add category
        </Button>
      </PageHeading>
      {success && (
        <p role="status" className="auth-message success">
          {success}
        </p>
      )}
      <InventoryState inventory={inventory}>
        {!inventory.categories.length ? (
          <Card className="empty-state">
            <h2>No categories yet</h2>
            <p>
              Create your first category to organize products. Products can also
              be uncategorized.
            </p>
          </Card>
        ) : (
          <div className="category-grid">
            {inventory.categories.map((category) => {
              const items = inventory.products.filter(
                (product) =>
                  product.category_id === category.id && !product.is_archived,
              );
              return (
                <Card className="category-card" key={category.id}>
                  <div>
                    <h2>{category.name}</h2>
                    <p>{items.length} active products</p>
                  </div>
                  <div className="category-summary">
                    <span>
                      {items
                        .reduce((sum, product) => sum + product.quantity, 0)
                        .toLocaleString("en-US")}{" "}
                      units
                    </span>
                    <strong>
                      {moneyFromCents(inventoryTotals(items).costCents)}
                    </strong>
                  </div>
                  <div className="category-row-actions"><Button
                    variant="secondary"
                    aria-label={`Rename ${category.name}`}
                    onClick={() => open(category)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Rename
                  </Button>
                  <Button variant="secondary" aria-label={`Delete category ${category.name}`} onClick={() => {
                    setSuccess(""); setDeleting(category);
                  }}>Delete category</Button></div>
                </Card>
              );
            })}
          </div>
        )}
      </InventoryState>
      {editing && (
        <Modal
          title={editing.id ? "Rename category" : "Add category"}
          busy={busy}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="form-fieldset">
              <Field label="Category name">
                <input
                  name="name"
                  autoFocus
                  required
                  maxLength={100}
                  defaultValue={editing.name || ""}
                />
              </Field>
              {error && (
                <p className="auth-message error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {busy ? "Saving..." : "Save category"}
                </Button>
              </div>
            </fieldset>
          </form>
        </Modal>
      )}
      {deleting && <DeleteCategoryDialog category={deleting} inventory={inventory}
        onClose={() => setDeleting(null)} onComplete={message => { setDeleting(null); setSuccess(message); }} />}
    </>
  );
}
