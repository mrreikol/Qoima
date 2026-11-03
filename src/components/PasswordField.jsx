import { useId, useState } from "react";
import { Link } from "react-router-dom";

export default function PasswordField({
  name,
  label,
  autoComplete,
  minLength = 1,
  guidance,
  error,
  recoveryLink = false,
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const describedBy =
    [guidance && `${id}-help`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={id}>{label}</label>
        {recoveryLink && <Link to="/forgot-password">Forgot password?</Link>}
      </div>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {guidance && (
        <small className="auth-field-help" id={`${id}-help`}>
          {guidance}
        </small>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
