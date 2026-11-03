import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { trapDialogFocus } from "./dialogFocus";
import Brand from "./Brand";
import { X, LogOut, LoaderCircle } from "lucide-react";

const navigation = [
  { to: "/products", label: "Products" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/history", label: "History" },
  { to: "/categories", label: "Categories" },
];
function NavigationContent({
  user,
  signingOut,
  onSignOut,
  onNavigate,
  mobile = false,
}) {
  return (
    <>
      <div className="workspace-brand-row">
        <Link className="workspace-brand" to="/products" onClick={onNavigate}>
          <Brand />
        </Link>
        {mobile && (
          <button
            type="button"
            className="shell-icon-button"
            aria-label="Close navigation"
            onClick={onNavigate}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <nav
        className="workspace-navigation"
        aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      >
        {navigation.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to !== "/products"}
            onClick={onNavigate}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="workspace-nav-footer">
        <NavLink to="/settings" onClick={onNavigate}>
          Settings
        </NavLink>
        <div className="navigation-account">
          <Link
            to="/settings"
            onClick={onNavigate}
            aria-label={`Account settings for ${user?.email || "your account"}`}
          >
            {user?.email}
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut ? (
              <LoaderCircle size={15} className="spinner" />
            ) : (
              <LogOut size={15} />
            )}{" "}
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function AppNavigation({
  user,
  signingOut,
  onSignOut,
  open,
  onClose,
}) {
  const drawer = useRef(null);
  useEffect(() => {
    if (!open) return;
    const element = drawer.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    // A desktop resize must not leave the page inert behind an invisible modal.
    const breakpoint = window.matchMedia("(min-width: 901px)");
    function closeOnDesktop(event) {
      if (event.matches) onClose();
    }
    breakpoint.addEventListener("change", closeOnDesktop);
    return () => {
      breakpoint.removeEventListener("change", closeOnDesktop);
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, onClose]);
  return (
    <>
      <header className="workspace-sidebar">
        <NavigationContent
          user={user}
          signingOut={signingOut}
          onSignOut={onSignOut}
        />
      </header>
      <dialog
        ref={drawer}
        className="workspace-drawer"
        aria-label="Workspace navigation"
        onKeyDown={trapDialogFocus}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX > bounds.right) onClose();
          }
        }}
      >
        <NavigationContent
          user={user}
          signingOut={signingOut}
          onSignOut={onSignOut}
          mobile
          onNavigate={onClose}
        />
      </dialog>
    </>
  );
}
