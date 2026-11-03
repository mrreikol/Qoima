import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
let configurationError = "";
let client = null;

// Capture redirect errors before the auth client processes the URL.
const redirectParams = new URLSearchParams(window.location.hash.slice(1));
export const authRedirectError =
  redirectParams.has("error") ||
  new URLSearchParams(window.location.search).has("error")
    ? "This email link is invalid or has expired. Please request a new link."
    : "";

try {
  if (!url || !publishableKey) {
    throw new Error(
      "Add the Supabase project URL and publishable key to .env.local.",
    );
  }
  const parsedUrl = new URL(url);
  if (
    !["https:", "http:"].includes(parsedUrl.protocol) ||
    !publishableKey.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "Use a valid Supabase project URL and a publishable key beginning with sb_publishable_.",
    );
  }
  client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });
} catch (error) {
  configurationError = error.message;
}

export const supabase = client;
export const supabaseConfigurationError = configurationError;
export const authRedirectUrl = (path) =>
  new URL(path, window.location.origin).toString();
