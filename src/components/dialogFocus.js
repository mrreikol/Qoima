// Keep keyboard navigation inside an open native modal, including reverse Tab.
export function trapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ).filter(
    (control) =>
      !control.matches(":disabled") &&
      control.tabIndex >= 0 &&
      control.getClientRects().length > 0,
  );
  if (!controls.length) {
    event.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
