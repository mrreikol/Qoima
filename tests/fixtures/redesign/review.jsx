import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "/src/fonts.css";
import "/src/index.css";
import "/src/workspace.css";
import "/src/precision.css";
import Products from "/src/pages/Products";
import Dashboard from "/src/pages/Dashboard";
import { Categories } from "/src/pages/OtherPages";
import StockHistory from "/src/pages/StockHistory";
import Settings from "/src/pages/Settings";
import AuthPage from "/src/pages/AuthPage";
import AppNavigation from "/src/components/AppNavigation";
import AppHeader from "/src/components/AppHeader";
import { AuthContext } from "/src/auth/AuthContext";
import { RESET_CONFIRMATION } from "/src/auth/passwordReset";
import { stockRequestError } from "/src/data/stockOperations";
import { user, products, categories, movements } from "./data.js";

export default function Review() {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = useCallback(() => setMenuOpen(false), []);
  const [revision, setRevision] = useState(0);
  const rejectWrite = async () => {
    throw new Error(
      "This isolated review rejects inventory writes. No data was changed.",
    );
  };
  const inventory = {
    deleteCategory: rejectWrite,
    userId: user.id,
    products,
    categories,
    recentMovements: movements,
    revision,
    loading: false,
    error: "",
    refresh: () => setRevision((value) => value + 1),
    createProduct: rejectWrite,
    updateProduct: rejectWrite,
    archiveProduct: rejectWrite,
    createCategory: rejectWrite,
    renameCategory: rejectWrite,
    changeStock: async () => {
      throw stockRequestError(null);
    },
  };
  const auth = {
    session: { user },
    user,
    error: "",
    finishRecovery() {},
    requestPasswordReset: async () => RESET_CONFIRMATION,
  };
  return (
    <>
      <style>{`.review-fixture-note { margin-left: 0; } @media(max-width:900px) { .review-fixture-note { margin-left: 0; } }`}</style>
      <aside
        className="review-fixture-note"
        style={{
          padding: "8px 16px",
          background: "var(--warning-surface)",
          color: "var(--warning-text)",
          fontSize: 12,
        }}
      >
        Isolated UI review · Fictional data · No remote writes ·{" "}
        <Link to="/login">Auth previews</Link>
      </aside>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthContext.Provider value={{ ...auth, session: null }}>
              <AuthPage mode="login" />
            </AuthContext.Provider>
          }
        />
        <Route
          path="/register"
          element={
            <AuthContext.Provider value={{ ...auth, session: null }}>
              <AuthPage mode="register" />
            </AuthContext.Provider>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthContext.Provider value={auth}>
              <AuthPage mode="forgot" />
            </AuthContext.Provider>
          }
        />
        <Route
          path="/reset-password"
          element={
            <AuthContext.Provider value={auth}>
              <AuthPage mode="reset" />
            </AuthContext.Provider>
          }
        />
        <Route
          path="*"
          element={
            <div className="app-shell">
              <AppNavigation
                user={user}
                signingOut={false}
                onSignOut={rejectWrite}
                open={menuOpen}
                onClose={close}
              />
              <div className="main-shell">
                <AppHeader
                  menuOpen={menuOpen}
                  onOpenMenu={() => setMenuOpen(true)}
                />
                <main className="workspace-main">
                  <Routes>
                    <Route
                      path="/products"
                      element={<Products inventory={inventory} />}
                    />
                    <Route
                      path="/products/:id"
                      element={<Products inventory={inventory} detailMode />}
                    />
                    <Route
                      path="/dashboard"
                      element={<Dashboard inventory={inventory} />}
                    />
                    <Route
                      path="/categories"
                      element={<Categories inventory={inventory} />}
                    />
                    <Route
                      path="/history"
                      element={<StockHistory inventory={inventory} />}
                    />
                    <Route
                      path="/settings"
                      element={
                        <Settings
                          user={user}
                          onPasswordReset={auth.requestPasswordReset}
                          onSignOut={rejectWrite}
                          signingOut={false}
                        />
                      }
                    />
                  </Routes>
                </main>
              </div>
            </div>
          }
        />
      </Routes>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Review />
  </BrowserRouter>,
);
