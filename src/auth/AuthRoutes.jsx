import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle, Settings2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { Button, Card } from "../components/ui";
import Brand, { BrandSymbol } from "../components/Brand";
import "../auth-screens.css";

export function AuthLayout({ title, description, children }) {
  const { pathname } = useLocation();
  const showReturn = ["/register", "/forgot-password", "/reset-password"].includes(
    pathname,
  );
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Link to="/dashboard" className="auth-home" aria-label="Qoima home">
          <Brand tagline />
        </Link>
        {showReturn && (
          <Link className="auth-return" to="/login">
            Back to sign in
          </Link>
        )}
      </header>
      <main className="auth-main">
        <Card className="auth-card">
          <div className="auth-form-heading">
            <h1 tabIndex={-1}>{title}</h1>
            {description && <p className="auth-description">{description}</p>}
          </div>
          {children}
        </Card>
      </main>
    </div>
  );
}
export function SetupScreen() {
  return (
    <AuthLayout
      title="Connect your workspace"
      description="Qoima needs a connection before you can continue."
    >
      <Settings2 className="auth-setup-icon" size={28} />
      <p role="alert" className="auth-message error">
        The application connection is not configured correctly. Follow the
        environment setup instructions in the project README, then restart the
        application.
      </p>
    </AuthLayout>
  );
}
export function SessionLoading() {
  return (
    <div className="session-loading" role="status">
      <BrandSymbol label="Qoima" />
      <LoaderCircle size={25} className="spinner" />
      <p>Loading your session...</p>
    </div>
  );
}
export function AuthGate() {
  const { loading, recovery, error, session } = useAuth();
  const location = useLocation();
  if (loading) return <SessionLoading />;
  if (
    error &&
    !session &&
    !["/login", "/register", "/forgot-password", "/reset-password"].includes(
      location.pathname,
    )
  ) {
    return (
      <AuthLayout
        title="Session unavailable"
        description="We could not restore your session."
      >
        <p role="alert" className="auth-message error">
          {error}
        </p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
        <Link className="auth-link" to="/login">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }
  if (recovery && location.pathname !== "/reset-password")
    return <Navigate to="/reset-password" replace />;
  return <Outlet />;
}
export function RequireAuth() {
  const { session } = useAuth();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
export function GuestOnly() {
  const { session } = useAuth();
  return session ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
