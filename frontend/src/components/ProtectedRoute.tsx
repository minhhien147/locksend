import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "./LoadingSpinner";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requiredRole?: string;
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Đang kiểm tra session (silent refresh on mount) → hiện spinner
  // Tránh flash redirect về /login trước khi biết session còn hạn không
  if (isLoading) {
    return (
      <PageLoader variant="fullscreen" title="Đang tải…" />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200">
          Không có quyền truy cập
        </h2>
      </div>
    );
  }

  return <>{children}</>;
}
