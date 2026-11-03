import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LogOut, Mail } from "lucide-react";
import { Button, Card, PageHeading } from "../components/ui";
import AppearanceSettings from "../appearance/AppearanceSettings";

export default function Settings({
  user,
  onPasswordReset,
  onSignOut,
  signingOut,
}) {
  const [state, setState] = useState({ busy: false, error: "", success: "" });
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function resetPassword() {
    if (pending.current || !user.email) return;
    pending.current = true;
    setState({ busy: true, error: "", success: "" });
    try {
      const message = await onPasswordReset(user.email);
      if (active.current)
        setState({ busy: false, error: "", success: message });
    } catch (error) {
      if (active.current)
        setState({ busy: false, error: error.message, success: "" });
    } finally {
      pending.current = false;
    }
  }
  return (
    <>
      <PageHeading title="Settings" />
      <Card className="settings-card">
        <div className="card-heading">
          <div>
            <h2>Your account</h2>
            <p>Your inventory belongs to this account.</p>
          </div>
        </div>
        <div className="account-settings-body">
          <dl className="account-email">
            <dt>Email address</dt>
            <dd>{user.email || "Email unavailable"}</dd>
          </dl>
          <div className="settings-note">
            <h3>Password recovery</h3>
            <p>
              Request a link at your account email, then follow it to set a new
              password.
            </p>
          </div>
          {state.success && (
            <p role="status" className="auth-message success">
              {state.success}
            </p>
          )}
          {state.error && (
            <p role="alert" className="auth-message error">
              {state.error}
            </p>
          )}
          <div className="account-settings-actions">
            <Button
              type="button"
              onClick={resetPassword}
              disabled={state.busy || signingOut || !user.email}
            >
              {state.busy ? (
                <LoaderCircle size={16} className="spinner" />
              ) : (
                <Mail size={16} />
              )}
              {state.busy ? "Sending request..." : "Send password reset email"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onSignOut}
              disabled={signingOut || state.busy}
            >
              <LogOut size={16} />
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>
      </Card>
      <AppearanceSettings />
    </>
  );
}
