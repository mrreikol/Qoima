import assert from "node:assert/strict";
import test from "node:test";
import {
  requestPasswordReset,
  RESET_CONFIRMATION,
} from "../src/auth/passwordReset.js";

test("Settings and forgot-password reset helper preserves email, recovery redirect and generic confirmation", async () => {
  const calls = [];
  const auth = {
    async resetPasswordForEmail(...args) {
      calls.push(args);
      return { error: null };
    },
  };
  assert.equal(
    await requestPasswordReset(
      auth,
      "account@example.test",
      "http://localhost:5173/reset-password",
    ),
    RESET_CONFIRMATION,
  );
  assert.deepEqual(calls, [
    [
      "account@example.test",
      { redirectTo: "http://localhost:5173/reset-password" },
    ],
  ]);
  for (const error of [
    { code: "user_not_found" },
    { status: 400, message: "Private account detail" },
  ])
    assert.equal(
      await requestPasswordReset(
        { resetPasswordForEmail: async () => ({ error }) },
        "a@example.test",
        "/reset-password",
      ),
      RESET_CONFIRMATION,
    );
});
test("reset rate/network errors are useful without exposing raw provider details", async () => {
  for (const error of [
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
  ])
    await assert.rejects(
      requestPasswordReset(
        { resetPasswordForEmail: async () => ({ error }) },
        "a@example.test",
        "/reset-password",
      ),
      /Too many requests/,
    );
  for (const error of [{ name: "AuthRetryableFetchError" }, { status: 503 }])
    await assert.rejects(
      requestPasswordReset(
        { resetPasswordForEmail: async () => ({ error }) },
        "a@example.test",
        "/reset-password",
      ),
      /check your connection/,
    );
  await assert.rejects(
    requestPasswordReset(
      {
        resetPasswordForEmail: async () => {
          throw new Error("Private detail");
        },
      },
      "a@example.test",
      "/reset-password",
    ),
    { message: "We could not process the request. Please try again later." },
  );
});
