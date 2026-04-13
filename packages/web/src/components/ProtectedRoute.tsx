import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Wraps routes that require authentication.
 * Redirects unauthenticated users to /login (Req 5.7).
 */
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
