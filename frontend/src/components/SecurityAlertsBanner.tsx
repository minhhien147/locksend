import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "./ui/Alert";
import {
  fetchSecurityAlerts,
  markSecurityAlertsRead,
  type UserSecurityAlert,
} from "../utils/api";
import { useLanguage, useT } from "../i18n/context";

function resolveAlertText(
  alert: UserSecurityAlert,
  locale: "en" | "vi",
  t: ReturnType<typeof useT>
): { title: string; message: string } {
  if (locale === "vi") {
    return { title: alert.title_vi, message: alert.message_vi };
  }

  const d = alert.detail_json ?? {};
  const date =
    typeof d.expires_at === "string"
      ? d.expires_at.slice(0, 10)
      : "";

  switch (alert.alert_type) {
    case "multi_ip_access":
      return {
        title: t("alerts.multiIp.title"),
        message: t("alerts.multiIp.message", {
          name: alert.file_name ?? "file",
          count: String(d.unique_ips ?? "?"),
          days: String(d.window_days ?? 30),
          threshold: String(d.threshold ?? 3),
        }),
      };
    case "keypair_expiring":
      return {
        title: t("alerts.keypairExpiring.title"),
        message: t("alerts.keypairExpiring.message", {
          days: String(d.days_left ?? "?"),
          date,
        }),
      };
    case "keypair_expired":
      return {
        title: t("alerts.keypairExpired.title"),
        message: t("alerts.keypairExpired.message", { date }),
      };
    case "admin_notify":
      return {
        title: t("alerts.adminNotify.title"),
        message: t("alerts.adminNotify.message"),
      };
    default:
      return { title: alert.title_vi, message: alert.message_vi };
  }
}

export default function SecurityAlertsBanner() {
  const t = useT();
  const { locale } = useLanguage();
  const [alerts, setAlerts] = useState<UserSecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchSecurityAlerts(10, true);
      setAlerts(res.alerts.slice(0, 3));
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function dismissOne(alert: UserSecurityAlert) {
    await markSecurityAlertsRead([alert.id]).catch(() => undefined);
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  }

  async function dismissAll() {
    if (!alerts.length) return;
    await markSecurityAlertsRead(alerts.map((a) => a.id)).catch(() => undefined);
    setAlerts([]);
  }

  if (loading || alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {alerts.map((a) => {
        const { title, message } = resolveAlertText(a, locale, t);
        return (
          <Alert
            key={a.id}
            tone={
              a.alert_type === "keypair_expired" || a.alert_type === "multi_ip_access"
                ? "error"
                : a.alert_type === "keypair_expiring"
                  ? "warning"
                  : "warning"
            }
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-sm mt-0.5 opacity-90">{message}</p>
                {(a.alert_type === "multi_ip_access" ||
                  a.alert_type === "admin_notify" ||
                  a.alert_type.startsWith("keypair")) && (
                  <Link
                    to="/keys"
                    className="inline-block mt-2 text-xs font-medium underline underline-offset-2"
                  >
                    {t("alerts.keysLink")}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => void dismissOne(a)}
                className="shrink-0 text-xs opacity-70 hover:opacity-100 px-2 py-1 rounded"
              >
                {t("common.understood")}
              </button>
            </div>
          </Alert>
        );
      })}
      {alerts.length > 1 && (
        <button
          type="button"
          onClick={() => void dismissAll()}
          className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-white/70"
        >
          {t("common.dismissAll")}
        </button>
      )}
    </div>
  );
}
