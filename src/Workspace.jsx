import { lazy, useCallback, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useInventory } from "./inventory/useInventory";
import AppNavigation from "./components/AppNavigation";
import AppHeader from "./components/AppHeader";
import RouteBoundary from "./components/RouteBoundary";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Categories = lazy(() => import("./pages/OtherPages").then(module => ({ default: module.Categories })));
const StockHistory = lazy(() => import("./pages/StockHistory"));
const Settings = lazy(() => import("./pages/Settings"));

export default function Workspace() {
  const { user, signOut, requestPasswordReset } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch {
      setSignOutError(
        "Unable to sign out. Check your connection and try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }
  const inventory = useInventory(user.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const location = useLocation();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppNavigation
        user={user}
        signingOut={signingOut}
        onSignOut={handleSignOut}
        open={menuOpen}
        onClose={closeMenu}
      />
      <div className="main-shell workspace-content">
        <AppHeader menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
        <main className="workspace-main" id="main-content" tabIndex={-1}>
          {signOutError && (
            <p role="alert" className="auth-message error">
              {signOutError}
            </p>
          )}
          <RouteBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={<Dashboard inventory={inventory} />}
              />
              <Route
                path="/products"
                element={
                  <Products
                    key={location.pathname + location.search}
                    inventory={inventory}
                  />
                }
              />
              <Route
                path="/products/:id"
                element={
                  <Products
                    key={location.pathname}
                    inventory={inventory}
                    detailMode
                  />
                }
              />
              <Route
                path="/categories"
                element={<Categories inventory={inventory} />}
              />
              <Route
                path="/history"
                element={
                  <StockHistory key={location.search} inventory={inventory} />
                }
              />
              <Route
                path="/settings"
                element={
                  <Settings
                    user={user}
                    onPasswordReset={requestPasswordReset}
                    onSignOut={handleSignOut}
                    signingOut={signingOut}
                  />
                }
              />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>Page not found</h1>
                    <Link to="/dashboard">Return to dashboard</Link>
                  </div>
                }
              />
            </Routes>
          </RouteBoundary>
        </main>
      </div>
    </div>
  );
}
