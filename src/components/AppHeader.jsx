import { Link } from "react-router-dom";
import Brand from "./Brand";
import { Menu } from "lucide-react";

export default function AppHeader({ menuOpen, onOpenMenu }) {
  return (
    <header className="workspace-topbar">
      <Link className="workspace-brand" to="/products">
        <Brand />
      </Link>
      <button
        type="button"
        className="mobile-menu-trigger"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <Menu size={18} aria-hidden="true" />
        Menu
      </button>
    </header>
  );
}
