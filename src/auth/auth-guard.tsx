import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./auth-context";

export function AuthGuard() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-dark">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
