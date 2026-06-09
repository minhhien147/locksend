import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageLoader from "./LoadingSpinner";
import { useT } from "../i18n/context";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  requiredRole?: string;
  allowUnverified?: boolean;
}

export default function ProtectedRoute({
  children,
  requiredRole,
  allowUnverified = false,
}: Props) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();
  const t = useT();

  if (isLoading) {
    return <PageLoader variant="fullscreen" title={t("common.loading")} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allowUnverified && user?.email_verified === false) {
    return <Navigate to="/verify-email" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-200">
          {t("common.accessDenied")}
        </h2>
      </div>
    );
  }

  return <>{children}</>;
}
