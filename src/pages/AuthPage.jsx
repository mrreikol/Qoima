import PasswordField from "../components/PasswordField";
import { authFieldErrors } from "../data/authForm";
import { useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { AuthLayout } from "../auth/AuthRoutes";
import { useAuth } from "../auth/AuthContext";
import { supabase, authRedirectUrl } from "../lib/supabase";
import { Button } from "../components/ui";

const content = {
  login: ["Sign in", "", "Sign in"],
  register: ["Create account", "", "Create account"],
  forgot: [
    "Reset your password",
    "Enter your email to request a password reset link.",
    "Send reset link",
  ],
  reset: ["Set a new password", "", "Update password"],
};

export default function AuthPage({ mode }) {
  const {
    session,
    error: sessionError,
    finishRecovery,
    requestPasswordReset,
  } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const emailId = useId();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [title, description, action] = content[mode];
  const newPassword = mode === "register" || mode === "reset";
  const canReset = mode !== "reset" || (session && !sessionError);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const email = data.get("email")?.trim();
    const password = data.get("password");
    const errors = authFieldErrors(mode, {
      email,
      password,
      confirmPassword: data.get("confirmPassword"),
    });
    const emailInput = event.currentTarget.elements.namedItem("email");
    if (emailInput && !emailInput.validity.valid && !errors.email)
      errors.email = "Enter a valid email address.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      event.currentTarget.elements
        .namedItem(
          ["email", "password", "confirmPassword"].find((name) => errors[name]),
        )
        ?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/dashboard", { replace: true });
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl("/dashboard") },
        });
        if (error) throw error;
        if (data.session) navigate("/dashboard", { replace: true });
        else setConfirmationEmail(email);
      } else if (mode === "forgot") {
        setSuccess(await requestPasswordReset(email));
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        finishRecovery();
        setSuccess(
          "Your password has been updated. You can now return to your dashboard.",
        );
        event.target.reset();
      }
    } catch (failure) {
      if (mode === "forgot") setError(failure.message);
      else if (mode === "login")
        setError(
          "Unable to sign in. Check your email and password, confirm your email, and try again.",
        );
      else if (mode === "reset")
        setError(
          "Unable to update your password. Use a different password or request a new reset link.",
        );
      else
        setError(
          failure.code === "weak_password"
            ? "Choose a stronger password that meets the password requirements."
            : "Unable to create your account. Please try again or sign in if you already have an account.",
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const pendingLabel = {
    login: "Signing in...",
    register: "Creating account...",
    forgot: "Sending reset link...",
    reset: "Updating password...",
  }[mode];
  return (
    <AuthLayout
      title={confirmationEmail ? "Check your email" : title}
      description={confirmationEmail ? "" : description}
    >
      {sessionError && (
        <p className="auth-message error" role="alert">
          {sessionError}
        </p>
      )}
      {confirmationEmail ? (
        <div className="email-confirmation" role="status">
          <p>
            Check{" "}
            <strong>{confirmationEmail}</strong> for a confirmation link.
          </p>
          <ol>
            <li>Open the email and follow the confirmation link.</li>
            <li>Continue to your inventory, or sign in when prompted.</li>
          </ol>
          <p>
            No email? Check your spam folder and the address above. If you
            already have an account, sign in or reset your password.
          </p>
          <Link className="button primary" to="/login">
            Back to sign in
          </Link>
          <button
            type="button"
            className="auth-link-button"
            onClick={() => {
              setConfirmationEmail("");
              setFieldErrors({});
            }}
          >
            Use a different email
          </button>
          <Link className="auth-link" to="/forgot-password">
            Reset password
          </Link>
        </div>
      ) : mode === "reset" && !canReset ? (
        <div className="auth-message error" role="alert">
          <p>
            This password reset link is invalid or has expired. Request a new
            link to continue.
          </p>
          <Link to="/forgot-password" className="auth-link">
            Request a new reset link
          </Link>
        </div>
      ) : mode === "reset" && success ? (
        <div role="status" className="auth-message success">
          <p>{success}</p>
          <Link className="button primary" to="/dashboard">
            Return to dashboard
          </Link>
        </div>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          onInput={(event) => {
            const name = event.target.name;
            setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
          }}
        >
          <fieldset disabled={busy}>
            {mode !== "reset" && (
              <div className="auth-field">
                <label htmlFor={emailId}>Email address</label>
                <input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  maxLength={254}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={
                    fieldErrors.email ? `${emailId}-error` : undefined
                  }
                />
                {fieldErrors.email && (
                  <p
                    className="field-error"
                    id={`${emailId}-error`}
                    role="alert"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>
            )}
            {mode !== "forgot" && (
              <PasswordField
                label={mode === "reset" ? "New password" : "Password"}
                name="password"
                autoComplete={newPassword ? "new-password" : "current-password"}
                minLength={newPassword ? 8 : 1}
                guidance={
                  newPassword ? "Use at least 8 characters." : undefined
                }
                error={fieldErrors.password}
                recoveryLink={mode === "login"}
              />
            )}
            {newPassword && (
              <PasswordField
                label="Confirm password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                error={fieldErrors.confirmPassword}
              />
            )}
            {error && (
              <p role="alert" className="auth-message error">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="auth-message success">
                {success}
              </p>
            )}
            <Button
              type="submit"
              className="auth-submit"
              disabled={busy}
              aria-busy={busy}
            >
              {busy && <LoaderCircle size={16} className="spinner" />}
              {busy ? pendingLabel : action}
            </Button>
          </fieldset>
        </form>
      )}
      {!confirmationEmail && !(mode === "reset" && success) && (
        <div className="auth-alternative">
          {mode === "login" ? (
            <>
              New to Qoima? <Link to="/register">Create account</Link>
            </>
          ) : mode === "register" ? (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <Link to="/login">Back to sign in</Link>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
