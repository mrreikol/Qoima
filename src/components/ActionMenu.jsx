import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// A disclosure with normal Tab navigation, not an incomplete ARIA menu.
export default function ActionMenu({
  label = "More",
  accessibleLabel,
  children,
}) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const [position, setPosition] = useState({});
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.showPopover?.();
    const outside = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const closeForLayoutChange = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", closeForLayoutChange);
    window.addEventListener("scroll", closeForLayoutChange, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", closeForLayoutChange);
      window.removeEventListener("scroll", closeForLayoutChange, true);
    };
  }, [open]);
  return (
    <div
      className="action-disclosure"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className="more-trigger"
        ref={trigger}
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          const bounds = trigger.current.getBoundingClientRect();
          setPosition({
            left: Math.max(
              8,
              Math.min(bounds.right - 190, window.innerWidth - 198),
            ),
            top:
              bounds.bottom + 208 > window.innerHeight
                ? Math.max(8, bounds.top - 208)
                : bounds.bottom + 4,
          });
          setOpen((value) => !value);
        }}
      >
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="action-options"
          ref={panel}
          popover="manual"
          style={position}
          id={id}
          role="group"
          aria-label={accessibleLabel || label}
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
