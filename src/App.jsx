import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AuthProvider from "./auth/AuthProvider";
import { useAuth } from "./auth/AuthContext";
import { AuthGate, GuestOnly, RequireAuth, SetupScreen } from "./auth/AuthRoutes";
import { supabaseConfigurationError } from "./lib/supabase";
import RouteBoundary from "./components/RouteBoundary";
// Auth and inventory screens share control styles; keep these eager.
import "./workspace.css";
import "./precision.css";

const Workspace = lazy(() => import("./Workspace"));
const AuthPage = lazy(() => import("./pages/AuthPage"));

function AuthenticatedWorkspace() {
  const { user } = useAuth();
  return <Workspace key={user.id} />;
}
export default function App() {
  return (
    <BrowserRouter>
      {supabaseConfigurationError ? (
        <SetupScreen />
      ) : (
        <AuthProvider>
          <RouteBoundary>
            <Routes>
              <Route element={<AuthGate />}>
                <Route element={<GuestOnly />}>
                  <Route
                    path="/login"
                    element={<AuthPage key="login" mode="login" />}
                  />
                  <Route
                    path="/register"
                    element={<AuthPage key="register" mode="register" />}
                  />
                </Route>
                <Route
                  path="/forgot-password"
                  element={<AuthPage key="forgot" mode="forgot" />}
                />
                <Route
                  path="/reset-password"
                  element={<AuthPage key="reset" mode="reset" />}
                />
                <Route element={<RequireAuth />}>
                  <Route path="/*" element={<AuthenticatedWorkspace />} />
                </Route>
              </Route>
            </Routes>
          </RouteBoundary>
        </AuthProvider>
      )}
    </BrowserRouter>
  );
}
