export const RESET_CONFIRMATION =
  "If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.";

// Shared by Forgot password and Settings; never disclose account existence.
export async function requestPasswordReset(auth, email, redirectTo) {
  let response;
  try {
    response = await auth.resetPasswordForEmail(email, { redirectTo });
  } catch (error) {
    throw new Error(
      "We could not process the request. Please try again later.",
      { cause: error },
    );
  }
  const error = response.error;
  if (
    error &&
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code,
    )
  )
    throw new Error(
      "Too many requests. Please wait a few minutes before trying again.",
    );
  if (
    error &&
    (error.name === "AuthRetryableFetchError" || error.status >= 500)
  )
    throw new Error(
      "We could not process the request. Please check your connection and try again.",
    );
  return RESET_CONFIRMATION;
}
