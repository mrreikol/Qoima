// Match the existing client requirements; Supabase may enforce additional policy.
export function authFieldErrors(mode, { email, password, confirmPassword }) {
  const errors = {};
  if (mode !== "reset" && !email?.trim())
    errors.email = "Enter your email address.";
  if (mode !== "forgot" && !password) errors.password = "Enter your password.";
  if (mode === "register" || mode === "reset") {
    if (!password || password.length < 8)
      errors.password = "Use at least 8 characters for your password.";
    if (!confirmPassword) errors.confirmPassword = "Confirm your password.";
    else if (password !== confirmPassword)
      errors.confirmPassword = "The passwords do not match.";
  }
  return errors;
}
