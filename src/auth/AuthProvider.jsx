import { observeSession } from "./sessionLifecycle.js";
import { useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import { requestPasswordReset } from "./passwordReset.js";
import { supabase, authRedirectError, authRedirectUrl } from "../lib/supabase";

export default function AuthProvider({ children }) {
  const [state, setState] = useState({
    session: null,
    loading: true,
    error: "",
    recovery: false,
  });
  useEffect(() => {
    if (!supabase) return;
    return observeSession(supabase.auth, setState, authRedirectError);
  }, []);

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setState({ session: null, loading: false, error: "", recovery: false });
  }
  function finishRecovery() {
    setState((previous) => ({ ...previous, recovery: false }));
  }
  return (
    <AuthContext.Provider
      value={{
        ...state,
        user: state.session?.user ?? null,
        signOut,
        requestPasswordReset: (email) =>
          requestPasswordReset(
            supabase.auth,
            email,
            authRedirectUrl("/reset-password"),
          ),
        finishRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
