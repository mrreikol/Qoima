import { useEffect, useId, useRef } from "react";
import { X, LoaderCircle } from "lucide-react";
import { Button, Card } from "./ui";
import { trapDialogFocus } from "./dialogFocus";

export function InventoryState({ inventory, children }) {
  if (inventory.loading)
    return (
      <Card className="empty-state" role="status">
        <LoaderCircle size={23} className="spinner state-icon" />
        <p>Loading your inventory...</p>
      </Card>
    );
  if (inventory.error)
    return (
      <Card className="empty-state">
        <h2>Inventory unavailable</h2>
        <p className="auth-message error" role="alert">
          {inventory.error}
        </p>
        <Button onClick={inventory.refresh}>Retry</Button>
      </Card>
    );
  return children;
}
export function Modal({ title, busy, onClose, children, className = "" }) {
  const dialog = useRef(null);
  const titleId = useId();
  const returnFocus = useRef(document.activeElement);
  useEffect(() => {
    const element = dialog.current;
    const trigger = returnFocus.current;
    const overflow = document.body.style.overflow;
    element.showModal();
    const initialControl =
      element.querySelector(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      ) || element.querySelector("button:not(:disabled)");
    initialControl?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else
        document
          .querySelector("main h1[tabindex='-1']")
          ?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal native-modal ${className}`}
      aria-labelledby={titleId}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
