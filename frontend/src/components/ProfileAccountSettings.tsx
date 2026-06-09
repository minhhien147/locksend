import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDraftState } from "../hooks/useDraftState";

function profileSettingsKey(userId: string | undefined): string {
  return userId ? `profile-settings-${userId}` : "profile-settings-guest";
}
import {
  fetchMyDisplayNameHistory,
  type DisplayNameHistoryItem,
} from "../utils/api";
import Alert from "./ui/Alert";
import { useLanguage, useT, translateError } from "../i18n/context";
import { isValidAlertEmail } from "../utils/email";
import { btn, inputBase, label, surfaceCard, table, text } from "../styles/theme";

function formatHistoryDate(iso: string, locale: "en" | "vi"): string {
  return new Date(iso).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProfileAccountSettings() {
  const t = useT();
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const { user, updateDisplayName, updateEmail, changePassword } = useAuth();
  const pageKey = profileSettingsKey(user?.user_id);

  const [contactEmail, setContactEmail] = useDraftState(
    pageKey,
    "contactEmail",
    user?.email ?? ""
  );
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [displayName, setDisplayName] = useDraftState(
    pageKey,
    "displayName",
    user?.display_name ?? ""
  );
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  const [currentPwd, setCurrentPwd] = useDraftState(pageKey, "currentPwd", "", "memory");
  const [newPwd, setNewPwd] = useDraftState(pageKey, "newPwd", "", "memory");
  const [confirmPwd, setConfirmPwd] = useDraftState(pageKey, "confirmPwd", "", "memory");
  const [pwdStatus, setPwdStatus] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const [nameHistory, setNameHistory] = useState<DisplayNameHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadNameHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setNameHistory(await fetchMyDisplayNameHistory(20));
    } catch {
      setNameHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const emailNeedsUpdate = !isValidAlertEmail(user?.email);

  useEffect(() => {
    void loadNameHistory();
  }, [loadNameHistory]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameStatus(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError(t("profile.nameRequired"));
      return;
    }
    if (trimmed === (user?.display_name ?? "").trim()) {
      setNameStatus(t("profile.nameUnchanged"));
      return;
    }
    setNameBusy(true);
    try {
      await updateDisplayName(trimmed);
      setNameStatus(t("profile.nameUpdated"));
      void loadNameHistory();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("profile.actionFailed");
      setNameError(translateError(t, typeof msg === "string" ? msg : t("profile.actionFailed")));
    } finally {
      setNameBusy(false);
    }
  }

  async function handleSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailStatus(null);
    const trimmed = contactEmail.trim().toLowerCase();
    if (!isValidAlertEmail(trimmed)) {
      setEmailError(t("profile.emailInvalid"));
      return;
    }
    if (trimmed === (user?.email ?? "").trim().toLowerCase()) {
      setEmailStatus(t("profile.emailUnchanged"));
      return;
    }
    setEmailBusy(true);
    try {
      const res = await updateEmail(trimmed);
      if (res.email_verified === false) {
        navigate("/verify-email");
        return;
      }
      setEmailStatus(t("profile.emailUpdated"));
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("profile.actionFailed");
      setEmailError(translateError(t, typeof msg === "string" ? msg : t("profile.actionFailed")));
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdStatus(null);
    if (newPwd.length < 8) {
      setPwdError(t("auth.passwordMin"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError(t("profile.confirmNewMismatch"));
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdStatus(t("profile.passwordChanged"));
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("profile.actionFailed");
      setPwdError(translateError(t, typeof msg === "string" ? msg : t("profile.actionFailed")));
    } finally {
      setPwdBusy(false);
    }
  }

  const compactInput = `${inputBase} !py-1.5 !px-2.5 !text-xs`;
  const compactBtn = `${btn.primary} !py-1.5 !px-3 !text-xs`;

  return (
    <section className={`${surfaceCard} p-3.5 sm:p-4 space-y-4 max-w-2xl`}>
      <h2 className={`text-[11px] font-semibold uppercase tracking-wide ${text.faint}`}>
        {t("profile.account")}
      </h2>

      {emailNeedsUpdate && (
        <Alert tone="warning">{t("profile.emailAlertHint")}</Alert>
      )}

      <form onSubmit={(e) => void handleSaveEmail(e)} className="space-y-2">
        <p className={`text-xs font-medium ${text.primary}`}>{t("profile.contactEmail")}</p>
        <p className={`text-[10px] ${text.muted}`}>{t("profile.contactEmailHint")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              setEmailError(null);
              setEmailStatus(null);
            }}
            autoComplete="email"
            disabled={emailBusy}
            placeholder="you@example.com"
            className={`flex-1 ${compactInput}`}
          />
          <button
            type="submit"
            disabled={emailBusy || !contactEmail.trim()}
            className={`sm:shrink-0 rounded-md font-semibold disabled:opacity-40 ${compactBtn}`}
          >
            {emailBusy ? t("profile.savingEmail") : t("profile.saveEmail")}
          </button>
        </div>
        {emailError && <Alert tone="error">{emailError}</Alert>}
        {emailStatus && !emailError && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{emailStatus}</p>
        )}
      </form>

      <hr className="border-slate-200 dark:border-slate-800" />

      <form onSubmit={(e) => void handleSaveName(e)} className="space-y-2">
        <p className={`text-xs font-medium ${text.primary}`}>{t("profile.displayName")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameError(null);
              setNameStatus(null);
            }}
            maxLength={128}
            autoComplete="name"
            disabled={nameBusy}
            placeholder={t("profile.displayNamePlaceholder")}
            className={`flex-1 ${compactInput}`}
          />
          <button
            type="submit"
            disabled={nameBusy || !displayName.trim()}
            className={`sm:shrink-0 rounded-md font-semibold disabled:opacity-40 ${compactBtn}`}
          >
            {nameBusy ? t("profile.savingName") : t("profile.saveName")}
          </button>
        </div>
        {nameError && <Alert tone="error">{nameError}</Alert>}
        {nameStatus && !nameError && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{nameStatus}</p>
        )}

        <div className="space-y-2 pt-1">
          <p className={`text-xs font-medium ${text.faint}`}>{t("profile.nameHistory")}</p>
          {historyLoading ? (
            <p className={`text-xs ${text.muted}`}>{t("common.loading")}</p>
          ) : nameHistory.length === 0 ? (
            <p className={`text-xs ${text.muted}`}>{t("profile.noNameHistory")}</p>
          ) : (
            <div className={table.wrap}>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>{t("profile.time")}</th>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>{t("profile.from")}</th>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>{t("profile.to")}</th>
                  </tr>
                </thead>
                <tbody>
                  {nameHistory.map((row) => (
                    <tr key={row.id} className={table.row}>
                      <td className={`${table.cell} px-2 py-1 text-[10px] whitespace-nowrap`}>
                        {formatHistoryDate(row.changed_at, locale)}
                      </td>
                      <td className={`${table.cell} px-2 py-1 text-[10px]`}>
                        {row.old_display_name ?? "—"}
                      </td>
                      <td className={`${table.cell} px-2 py-1 text-[10px] font-medium`}>
                        {row.new_display_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </form>

      <hr className="border-slate-200 dark:border-slate-800" />

      <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-2">
        <p className={`text-xs font-medium ${text.primary}`}>{t("profile.changePassword")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2">
            <label className={`${label} !text-[10px]`}>{t("profile.currentPassword")}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPwd}
              onChange={(e) => {
                setCurrentPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
          <div>
            <label className={`${label} !text-[10px]`}>{t("profile.newPasswordHint")}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(e) => {
                setNewPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
          <div>
            <label className={`${label} !text-[10px]`}>{t("profile.confirmNewPassword")}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => {
                setConfirmPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
        </div>
        {pwdError && <Alert tone="error">{pwdError}</Alert>}
        {pwdStatus && !pwdError && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{pwdStatus}</p>
        )}
        <button
          type="submit"
          disabled={pwdBusy || !currentPwd || !newPwd || !confirmPwd}
          className={`rounded-md font-semibold disabled:opacity-40 ${compactBtn}`}
        >
          {pwdBusy ? t("profile.savingName") : t("profile.changePassword")}
        </button>
      </form>
    </section>
  );
}
