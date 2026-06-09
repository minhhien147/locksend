import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import ProfileAccountSettings from "../components/ProfileAccountSettings";
import { VaultPanel } from "./VaultPage";
import { HistoryPanel } from "./HistoryPage";
import { useT } from "../i18n/context";
import { badge, btn, surfaceCard, tabs, text } from "../styles/theme";

type ProfileTab = "vault" | "history";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  recipient: "Recipient",
  admin: "Admin",
};

const ROLE_BADGE: Record<string, string> = {
  owner: badge.info,
  recipient: badge.success,
  admin: badge.danger,
};

export default function ProfilePage() {
  const t = useT();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isRecipient = user?.role === "recipient";

  const tabConfig: { id: ProfileTab; label: string; ownerOnly?: boolean }[] = [
    { id: "vault", label: t("profile.tabVault"), ownerOnly: true },
    { id: "history", label: t("profile.tabHistory") },
  ];

  const visibleTabs = tabConfig.filter((tab) => !tab.ownerOnly || !isRecipient);

  const tab: ProfileTab = useMemo(() => {
    const raw = searchParams.get("tab");
    if (raw === "history") return "history";
    if (raw === "vault" && !isRecipient) return "vault";
    return isRecipient ? "history" : "vault";
  }, [searchParams, isRecipient]);

  function setTab(next: ProfileTab) {
    setSearchParams(next === "vault" ? {} : { tab: next }, { replace: true });
  }

  const initials = (user?.display_name || user?.email || "U")
    .slice(0, 2)
    .toUpperCase();
  const role = user?.role ?? "owner";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className={`${surfaceCard} p-5 sm:p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="w-14 h-14 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-lg font-bold text-indigo-600 dark:text-indigo-300 shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className={`text-lg font-bold tracking-tight ${text.primary}`}>
              {user?.display_name || t("profile.title")}
            </h1>
            <p className={`text-sm truncate ${text.secondary}`}>{user?.email}</p>
            <span className={`inline-block mt-1 ${ROLE_BADGE[role] ?? badge.info}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link
              to="/keys"
              className="px-3 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              {t("profile.manageKeys")}
            </Link>
            {!isRecipient && (
              <Link
                to="/"
                className={btn.primary}
              >
                {t("profile.uploadFile")}
              </Link>
            )}
          </div>
        </div>
      </section>

      <ProfileAccountSettings key={user?.user_id ?? "guest"} />

      <div className={tabs.wrap}>
        {visibleTabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={`${tabs.item} ${tab === tabItem.id ? tabs.itemActive : ""}`}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      {tab === "vault" && !isRecipient && <VaultPanel embedded />}
      {tab === "history" && <HistoryPanel embedded />}
    </div>
  );
}
