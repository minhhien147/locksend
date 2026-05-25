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
      <PageLoader
        variant="fullscreen"
        title="Đang kiểm tra phiên đăng nhập…"
        description="Đang xác thực phiên làm việc với máy chủ."
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          Không có quyền truy cập
        </h2>
        <p className="text-gray-500 text-sm">
          Trang này yêu cầu quyền{" "}
          <span className="font-semibold text-indigo-600">{requiredRole}</span>
          . Tài khoản của bạn đang có quyền{" "}
          <span className="font-semibold">{user?.role}</span>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
