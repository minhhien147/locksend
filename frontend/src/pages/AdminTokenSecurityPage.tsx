import { useCallback, useEffect, useState } from "react";
import api from "../utils/api";
import { useDraftState } from "../hooks/useDraftState";

const ADMIN_TOKEN_PAGE_KEY = "admin-token-security";
import PageLoader, { LoadingSpinner } from "../components/LoadingSpinner";

import { admin, surfaceCard } from "../styles/theme";
import { useT } from "../i18n/context";

const RISK_BADGE: Record<string, string> = {
  low:
    "bg-slate-900 text-emerald-200 ring-1 ring-slate-600 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
  medium:
    "bg-slate-900 text-amber-200 ring-1 ring-slate-600 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
  high:
    "bg-slate-900 text-orange-200 ring-1 ring-slate-600 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/25",
  critical:
    "bg-slate-900 text-rose-200 ring-1 ring-slate-600 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
};

const REC_BADGE: Record<string, string> = {
  ALLOW:
    "bg-slate-900 text-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400",
  MONITOR:
    "bg-slate-900 text-amber-200 dark:bg-amber-500/10 dark:text-amber-400",
  REVOKE:
    "bg-slate-900 text-rose-200 dark:bg-rose-500/10 dark:text-rose-400",
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${RISK_BADGE[level] ?? RISK_BADGE.medium}`}>
      {level}
    </span>
  );
}

function RecBadge({ rec }: { rec: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${REC_BADGE[rec] ?? REC_BADGE.MONITOR}`}>
      {rec}
    </span>
  );
}

const BEHAVIOR_BADGE: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25",
  medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25",
  low: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/20",
};

const AGREEMENT_BADGE: Record<string, string> = {
  agree: "bg-emerald-500/10 text-emerald-300",
  partial: "bg-amber-500/10 text-amber-300",
  disagree: "bg-rose-500/10 text-rose-300",
};

function BehaviorBadge({ label, severity }: { label: string; severity?: string }) {
  const cls = BEHAVIOR_BADGE[severity ?? "medium"] ?? BEHAVIOR_BADGE.medium;
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function AgreementBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${AGREEMENT_BADGE[status] ?? AGREEMENT_BADGE.partial}`}>
      {label}
    </span>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TokenMetric {
  token_id: string;
  token_type: "jwt" | "sas";
  user_id?: string;
  email?: string | null;
  role?: string | null;
  blob_name?: string;
  risk_score: number;
  risk_level: string;
  recommendation: string;
  reasons: string[];
  active_sessions?: number;
  ip_count: number;
  accesses_per_hour?: number;
  downloads_per_hour?: number;
  token_age_hours: number;
  is_revoked?: boolean;
  is_expired?: boolean;
}

interface Overview {
  generated_at: string;
  jwt: { active: number; revoked: number; expired: number; total: number };
  sas: { active: number; revoked: number; expired: number; total: number };
  risk_summary: {
    high_risk_tokens: number;
    critical_tokens: number;
    auto_revoke_candidates: number;
    access_events_24h: number;
  };
  config: {
    access_token_ttl_minutes: number;
    refresh_token_ttl_days: number;
    auto_revoke_score_threshold: number;
  };
  top_risk_tokens?: TokenMetric[];
}

interface AiHealth {
  ready: boolean;
  realtime_enabled?: boolean;
  mode?: "local" | "remote";
  ai_url?: string;
  version?: string;
  trained_at?: string;
  metrics?: {
    accuracy?: number;
    f1?: number;
    roc_auc?: number;
    precision?: number;
    recall?: number;
    train_size?: number;
  };
  error?: string;
  ai_dir?: string;
  hint?: string;
}

interface ShapFeature {
  feature: string;
  impact: number;
  direction: string;
}

interface BehaviorBadgeData {
  id: string;
  label: string;
  severity: string;
}

interface RuleAiAgreement {
  status: string;
  label: string;
  rule_level?: string;
  ai_level?: string;
  delta?: number;
}

interface AiTokenResult {
  token_id?: string;
  token_type?: string;
  risk_score_pct: number;
  risk_score_raw: number;
  risk_level: string;
  ai_level_raw: string;
  decision: string;
  is_attack: boolean;
  rule_score?: number;
  rule_level?: string;
  rule_recommendation?: string;
  behavior_badges?: BehaviorBadgeData[];
  summary_vi?: string;
  agreement?: RuleAiAgreement;
  explanation: {
    summary: string;
    summary_vi?: string;
    top_features: ShapFeature[];
  };
  error?: string;
}

type Tab = "overview" | "tokens" | "ai-report" | "trends" | "files";

interface SecurityAlert {
  id: string;
  token_type: string;
  file_id?: string | null;
  file_name?: string | null;
  subject_label?: string;
  rule_score: number;
  ai_score_pct: number;
  decision: string;
  agreement_status?: string;
  behavior_badges?: BehaviorBadgeData[];
  summary_vi?: string;
  is_read: boolean;
  created_at: string;
}

interface TrendData {
  days: number;
  labels: string[];
  access_events: number[];
  ai_alerts: number[];
  ai_high_scores: number[];
  rule_ai_disagree: number[];
  totals: Record<string, number>;
}

interface TopFileRow {
  file_id: string | null;
  file_name: string;
  downloads: number;
  unique_ips: number;
  unique_users: number;
  active_sas_links: number;
  ai_alerts: number;
  suspicious: boolean;
  owner_email?: string | null;
  owner_email_valid?: boolean;
  owner_id?: string | null;
  storage_mode?: string | null;
}

interface FileActivityData {
  days: number;
  labels: string[];
  summary: {
    uploads: number;
    downloads: number;
    unique_files_downloaded: number;
    suspicious_files: number;
  };
  trend: {
    uploads_per_day: number[];
    downloads_per_day: number[];
  };
  top_file_trends: { file_id: string; file_name: string; downloads_per_day: number[] }[];
  top_files: TopFileRow[];
}

interface FileDetailData {
  file_id: string;
  file_name: string;
  owner_email?: string | null;
  owner_email_valid?: boolean;
  owner_id?: string | null;
  storage_mode?: string | null;
  file_size_bytes: number;
  created_at: string;
  stats: {
    downloads: number;
    uploads: number;
    unique_ips: number;
    active_sas_links: number;
    suspicious: boolean;
  };
  recent_downloads: { user_id?: string | null; ip_address?: string | null; created_at: string }[];
  recent_alerts: { id: string; ai_score_pct: number; decision: string; summary_vi?: string; created_at: string }[];
}

function MiniBarChart({
  labels,
  series,
  colorClass,
}: {
  labels: string[];
  series: number[];
  colorClass: string;
}) {
  const max = Math.max(1, ...series);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {series.map((v, i) => (
        <div key={labels[i]} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[9px] text-slate-500 dark:text-white/30">{v || ""}</span>
          <div
            className={`w-full rounded-t ${colorClass} transition-all`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`${labels[i]}: ${v}`}
          />
          <span className="text-[8px] text-slate-500 dark:text-white/25 truncate w-full text-center">
            {labels[i].slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminTokenSecurityPage() {
  const t = useT();
  const [activeTab, setActiveTab] = useDraftState<Tab>(
    ADMIN_TOKEN_PAGE_KEY,
    "activeTab",
    "overview"
  );
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [aiHealthLoading, setAiHealthLoading] = useState(false);

  const [tokens, setTokens] = useState<TokenMetric[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenType, setTokenType] = useDraftState<"all" | "jwt" | "sas">(
    ADMIN_TOKEN_PAGE_KEY,
    "tokenType",
    "all"
  );

  const [aiResults, setAiResults] = useState<AiTokenResult[]>([]);
  const [aiRuleMetrics, setAiRuleMetrics] = useState<TokenMetric[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const [fileActivity, setFileActivity] = useState<FileActivityData | null>(null);
  const [fileActivityLoading, setFileActivityLoading] = useState(false);
  const [fileDetail, setFileDetail] = useState<FileDetailData | null>(null);
  const [fileDetailLoading, setFileDetailLoading] = useState(false);
  const [notifyOwnerBusy, setNotifyOwnerBusy] = useState(false);

  const flash = (type: "ok" | "err", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  // ── Load overview ───────────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ overview: Overview }>(
        "/auth/admin/token-security/overview"
      );
      setOverview(res.data.overview);
    } catch {
      flash("err", t("admin.tokenSecurity.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  // ── Load AI health ──────────────────────────────────────────────────────────

  const loadAiHealth = useCallback(async () => {
    setAiHealthLoading(true);
    try {
      const res = await api.get<AiHealth>("/auth/admin/token-security/ai/health");
      setAiHealth(res.data);
    } catch {
      setAiHealth({ ready: false, error: t("admin.tokenSecurity.backendFailed") });
    } finally {
      setAiHealthLoading(false);
    }
  }, []);

  useEffect(() => { void loadAiHealth(); }, [loadAiHealth]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get<{ alerts: SecurityAlert[]; unread_count: number }>(
        "/auth/admin/token-security/alerts?limit=15"
      );
      setAlerts(res.data.alerts ?? []);
      setUnreadAlerts(res.data.unread_count ?? 0);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    if (aiHealth?.realtime_enabled === false) return;
    if (aiHealth == null) return;
    void loadAlerts();
    const t = setInterval(() => void loadAlerts(), 30_000);
    return () => clearInterval(t);
  }, [loadAlerts, aiHealth?.realtime_enabled]);

  const loadTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const res = await api.get<TrendData>("/auth/admin/token-security/ai/trends?days=7");
      setTrends(res.data);
    } catch {
      flash("err", t("admin.tokenSecurity.trendFailed"));
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "trends") void loadTrends();
  }, [activeTab, loadTrends]);

  const loadFileActivity = useCallback(async () => {
    setFileActivityLoading(true);
    try {
      const res = await api.get<FileActivityData>(
        "/auth/admin/token-security/files/activity?days=7&limit=20"
      );
      setFileActivity(res.data);
    } catch {
      flash("err", t("admin.tokenSecurity.fileActivityFailed"));
    } finally {
      setFileActivityLoading(false);
    }
  }, []);

  const loadFileDetail = useCallback(async (fileId: string) => {
    setFileDetailLoading(true);
    try {
      const res = await api.get<FileDetailData>(
        `/auth/admin/token-security/files/${fileId}/activity?days=7`
      );
      setFileDetail(res.data);
    } catch {
      flash("err", t("admin.tokenSecurity.fileDetailFailed"));
      setFileDetail(null);
    } finally {
      setFileDetailLoading(false);
    }
  }, []);

  const notifyFileOwner = useCallback(async (fileId: string) => {
    setNotifyOwnerBusy(true);
    try {
      const res = await api.post<{
        owner_email?: string;
        email_sent?: boolean;
      }>(`/auth/admin/token-security/files/${fileId}/notify-owner`);
      const email = res.data.owner_email;
      flash(
        "ok",
        res.data.email_sent && email
          ? t("admin.notifySentEmail", { email })
          : t("admin.notifySent")
      );
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        t("admin.notifyFailed");
      flash("err", msg);
    } finally {
      setNotifyOwnerBusy(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "files") {
      void loadFileActivity();
      setFileDetail(null);
    }
  }, [activeTab, loadFileActivity]);

  const openFileTab = (fileId: string) => {
    setActiveTab("files");
    void loadFileDetail(fileId);
  };

  const markAlertRead = async (id: string) => {
    try {
      await api.post(`/auth/admin/token-security/alerts/${id}/read`);
      void loadAlerts();
    } catch {
      flash("err", t("admin.tokenSecurity.alertUpdateFailed"));
    }
  };

  const markAllAlertsRead = async () => {
    try {
      await api.post("/auth/admin/token-security/alerts/read-all");
      void loadAlerts();
    } catch {
      flash("err", t("admin.tokenSecurity.alertUpdateFailed"));
    }
  };

  // ── Load token list ─────────────────────────────────────────────────────────

  const loadTokens = useCallback(async (type: "all" | "jwt" | "sas" = tokenType) => {
    setTokensLoading(true);
    try {
      const res = await api.get<{ tokens: TokenMetric[] }>(
        `/auth/admin/token-security/tokens?token_type=${type}`
      );
      setTokens(res.data.tokens);
    } catch {
      flash("err", t("admin.tokenSecurity.tokenListFailed"));
    } finally {
      setTokensLoading(false);
    }
  }, [tokenType]);

  useEffect(() => {
    if (activeTab === "tokens") void loadTokens();
  }, [activeTab, loadTokens]);

  // ── AI analysis ─────────────────────────────────────────────────────────────

  const exportAiCsv = () => {
    if (!aiResults.length) return;
    const header = [
      "token_id", "token_type", "email", "rule_score", "rule_level", "rule_rec",
      "ai_score_pct", "ai_level", "decision", "agreement", "behaviors", "summary_vi",
    ];
    const rows = aiResults.map((r, i) => {
      const rule = aiRuleMetrics[i];
      const esc = (v: string | number | undefined) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        r.token_id, r.token_type, rule?.email ?? "",
        r.rule_score ?? rule?.risk_score, r.rule_level ?? rule?.risk_level, r.rule_recommendation ?? rule?.recommendation,
        r.risk_score_pct, r.ai_level_raw, r.decision,
        r.agreement?.label ?? "", (r.behavior_badges ?? []).map((b) => b.label).join("; "),
        r.summary_vi ?? r.explanation?.summary_vi ?? "",
      ].map(esc).join(",");
    });
    const blob = new Blob([header.join(",") + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `locksend-ai-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runAiAnalyze = async () => {
    setAnalyzing(true);
    setAiResults([]);
    setAiError(null);
    try {
      const res = await api.post<{
        analyzed: number;
        ai_results: AiTokenResult[];
        ai_error: string | null;
        rule_metrics: TokenMetric[];
      }>("/auth/admin/token-security/ai/analyze", {
        token_type: "all",
        top_n: 20,
      });
      setAiResults(res.data.ai_results ?? []);
      setAiRuleMetrics(res.data.rule_metrics ?? []);
      if (res.data.ai_error) setAiError(res.data.ai_error);
      setActiveTab("ai-report");
      flash("ok", t("admin.tokenSecurity.aiAnalyzed", { count: res.data.analyzed }));
    } catch {
      setAiError(t("admin.tokenSecurity.aiAnalyzeFailed"));
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const revokeJwt = async (userId: string, email: string | null) => {
    if (!confirm(t("admin.tokenSecurity.revokeJwtConfirm", { email: email ?? userId }))) return;
    setBusyId(userId);
    try {
      const res = await api.post<{ revoked_sessions: number }>(
        `/auth/admin/token-security/revoke/jwt/${userId}`,
        { reason: "Admin manual revoke" }
      );
      flash("ok", t("admin.tokenSecurity.revokeJwtOk", { count: res.data.revoked_sessions }));
      void loadOverview();
    } catch {
      flash("err", t("admin.tokenSecurity.revokeJwtFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const revokeSas = async (tokenId: string) => {
    if (!confirm(`Soft-revoke SAS token ${tokenId.slice(0, 8)}…?`)) return;
    setBusyId(tokenId);
    try {
      await api.post(`/auth/admin/token-security/revoke/sas/${tokenId}`, {
        reason: "Admin manual revoke",
      });
      flash("ok", t("admin.tokenSecurity.revokeSasOk"));
      void loadTokens();
    } catch {
      flash("err", t("admin.tokenSecurity.revokeSasFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const triggerAutoRevoke = async () => {
    if (!confirm(t("admin.tokenSecurity.autoRevokeConfirm"))) return;
    try {
      const res = await api.post<{ revoked_jwt_sessions: number; revoked_sas_tokens: number }>(
        "/auth/admin/token-security/auto-revoke"
      );
      flash("ok", `Auto-revoke: ${res.data.revoked_jwt_sessions} JWT, ${res.data.revoked_sas_tokens} SAS`);
      void loadOverview();
    } catch {
      flash("err", t("admin.tokenSecurity.autoRevokeFailed"));
    }
  };

  const cleanup = async () => {
    try {
      const res = await api.post<{ deleted_sas_records: number; deleted_access_logs: number }>(
        "/auth/admin/token-security/cleanup"
      );
      flash("ok", t("admin.tokenSecurity.cleanupOk", {
        sas: res.data.deleted_sas_records,
        logs: res.data.deleted_access_logs,
      }));
    } catch {
      flash("err", t("admin.tokenSecurity.cleanupFailed"));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && !overview) {
    return <PageLoader title={t("admin.tokenSecurity.loading")} />;
  }

  const topRisk = overview?.top_risk_tokens ?? [];
  const aiReady = aiHealth?.ready === true;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className={admin.title}>Token Security</h2>
          <p className={admin.desc}>{t("admin.tokenSecurity.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className={`${admin.btnGhost} disabled:opacity-40`}
          >
            {t("admin.refresh")}
          </button>
          <button type="button" onClick={triggerAutoRevoke}
            className="px-3 py-2 rounded-xl border border-rose-500/30 text-sm text-rose-400 hover:bg-rose-500/10 transition">
            Auto-revoke
          </button>
          <button type="button" onClick={cleanup} className={admin.btnGhost}>
            Cleanup
          </button>
        </div>
      </div>

      {/* Realtime alerts (chỉ khi LOCKSEND_AI_REALTIME_ENABLED=true) */}
      {aiHealth?.realtime_enabled !== false && unreadAlerts > 0 && (
        <div className={`${surfaceCard} px-5 py-4 border-amber-500/20`}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-amber-300">
              {t("admin.tokenSecurity.realtimeAlerts", { count: unreadAlerts })}
            </span>
            <button
              type="button"
              onClick={() => void markAllAlertsRead()}
              className="ml-auto text-[11px] text-slate-400 hover:text-white"
            >
              {t("admin.tokenSecurity.markAllRead")}
            </button>
          </div>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.filter((a) => !a.is_read).slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-700 dark:text-white/70 truncate max-w-[180px]">
                  {a.file_name ? (
                    a.file_id ? (
                      <button
                        type="button"
                        onClick={() => openFileTab(a.file_id!)}
                        className="text-sky-400 hover:underline truncate max-w-[180px] text-left"
                        title={a.file_name}
                      >
                        {a.file_name}
                      </button>
                    ) : (
                      a.file_name
                    )
                  ) : (
                    a.subject_label ?? a.id.slice(0, 8)
                  )}
                </span>
                {a.token_type === "sas" && a.file_name && (
                  <span className="text-[10px] text-slate-500">SAS</span>
                )}
                <span className="text-slate-500">Rule {a.rule_score} → AI {a.ai_score_pct}%</span>
                <RecBadge rec={a.decision} />
                {a.behavior_badges?.slice(0, 1).map((b) => (
                  <BehaviorBadge key={b.id} label={b.label} severity={b.severity} />
                ))}
                <button
                  type="button"
                  onClick={() => void markAlertRead(a.id)}
                  className="text-[10px] text-slate-500 hover:text-white ml-auto"
                >
                  {t("admin.tokenSecurity.markRead")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <p className={`text-sm px-4 py-2.5 rounded-xl border ${
          feedback.type === "ok"
            ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
            : "text-rose-300 bg-rose-500/10 border-rose-500/20"
        }`}>
          {feedback.msg}
        </p>
      )}

      {/* AI + Rule engine status banner */}
      <div className={`${surfaceCard} px-5 py-3.5 flex flex-wrap items-center gap-5`}>
        {/* LockSend AI status */}
        <div className="flex items-center gap-2.5">
          {aiHealthLoading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <span className={`text-sm font-semibold ${aiReady ? "text-emerald-400" : "text-amber-400"}`}>
              {aiReady ? "● LockSend AI" : "○ LockSend AI"}
            </span>
          )}
          {aiHealth && (
            <span className="text-xs text-slate-600 dark:text-white/35">
              {aiReady
                ? `v${aiHealth.version ?? "?"} · ROC-AUC ${((aiHealth.metrics?.roc_auc ?? 0) * 100).toFixed(1)}%`
                : t("admin.tokenSecurity.modelNotReady")}
            </span>
          )}
        </div>

        <div className={`h-4 w-px ${admin.dividerLight}`} />

        {/* Rule engine */}
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">● Rule engine</span>
        <span className="text-xs text-slate-500 dark:text-white/30">
          {t("admin.tokenSecurity.autoRevokeThreshold", {
            score: overview?.config.auto_revoke_score_threshold ?? 80,
          })}
        </span>

        {/* Hint nếu AI chưa sẵn */}
        {aiHealth && !aiReady && (
          <span className="text-xs text-amber-300/60 ml-auto hidden sm:block">
            {aiHealth.hint ?? `cd ${aiHealth.ai_dir} && python train.py`}
          </span>
        )}
      </div>

      {/* Stat cards */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "JWT Active",  value: overview.jwt.active,                     color: "text-indigo-400" },
            { label: "SAS Active",  value: overview.sas.active,                     color: "text-sky-400" },
            { label: "High Risk",   value: overview.risk_summary.high_risk_tokens,  color: "text-orange-400" },
            { label: "Access/24h",  value: overview.risk_summary.access_events_24h, color: "text-violet-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`${surfaceCard} p-4 text-center`}>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-[11px] text-slate-600 dark:text-white/35 uppercase tracking-wide mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className={`${surfaceCard} p-1.5 inline-flex gap-1`}>
        {(["overview", "tokens", "ai-report", "trends", "files"] as Tab[]).map((tabId) => (
          <button key={tabId} type="button" onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              activeTab === tabId ? admin.tabActive : admin.tabInactive
            }`}>
            {tabId === "overview"
              ? t("admin.tokenSecurity.tabOverview")
              : tabId === "tokens"
                ? t("admin.tokenSecurity.tabTokens")
                : tabId === "ai-report"
                  ? t("admin.tokenSecurity.tabAiReport")
                  : tabId === "trends"
                    ? t("admin.tokenSecurity.tabTrends")
                    : t("admin.tokenSecurity.tabFiles")}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {activeTab === "overview" && overview && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {/* JWT */}
            <div className={`${surfaceCard} p-5`}>
              <h3 className={`${admin.sectionTitle} mb-3`}>JWT / Refresh Tokens</h3>
              <div className="space-y-1.5 text-sm">
                {[
                  ["Active",  overview.jwt.active,  "text-indigo-400"],
                  ["Revoked", overview.jwt.revoked,  "text-rose-400"],
                  ["Expired", overview.jwt.expired,  "text-slate-600 dark:text-white/35"],
                  ["Total",   overview.jwt.total,    "text-slate-700 dark:text-white/60"],
                ].map(([label, val, cls]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="text-slate-600 dark:text-white/45">{label}</span>
                    <span className={String(cls)}>{val}</span>
                  </div>
                ))}
                <div className={`pt-2 border-t ${admin.divider} text-xs text-slate-500 dark:text-white/30`}>
                  Access token TTL: {overview.config.access_token_ttl_minutes}m · Refresh TTL: {overview.config.refresh_token_ttl_days}d
                </div>
              </div>
            </div>
            {/* SAS */}
            <div className={`${surfaceCard} p-5`}>
              <h3 className={`${admin.sectionTitle} mb-3`}>SAS URL Tokens</h3>
              <div className="space-y-1.5 text-sm">
                {[
                  ["Active",  overview.sas.active,  "text-sky-400"],
                  ["Revoked", overview.sas.revoked,  "text-rose-400"],
                  ["Expired", overview.sas.expired,  "text-slate-600 dark:text-white/35"],
                  ["Total",   overview.sas.total,    "text-slate-700 dark:text-white/60"],
                ].map(([label, val, cls]) => (
                  <div key={String(label)} className="flex justify-between">
                    <span className="text-slate-600 dark:text-white/45">{label}</span>
                    <span className={String(cls)}>{val}</span>
                  </div>
                ))}
                <div className={`pt-2 border-t ${admin.divider} text-xs text-slate-500 dark:text-white/30`}>
                  Auto-revoke candidates: {overview.risk_summary.auto_revoke_candidates}
                </div>
              </div>
            </div>
          </div>

          {overview.risk_summary.critical_tokens > 0 && (
            <div className={`${surfaceCard} p-4 border-rose-500/20`}>
              <p className="text-xs text-rose-400 font-medium">
                {t("admin.tokenSecurity.criticalTokens", {
                  count: overview.risk_summary.critical_tokens,
                })}
              </p>
            </div>
          )}

          {/* LockSend AI model info */}
          {aiHealth && aiReady && aiHealth.metrics && (
            <div className={`${surfaceCard} p-5`}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-emerald-300">LockSend AI — Random Forest</h3>
                <span className="text-xs text-slate-500 dark:text-white/30">{aiHealth.version}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[
                  { label: "Accuracy",  val: aiHealth.metrics.accuracy },
                  { label: "F1",        val: aiHealth.metrics.f1 },
                  { label: "ROC-AUC",   val: aiHealth.metrics.roc_auc },
                  { label: "Precision", val: aiHealth.metrics.precision },
                  { label: "Recall",    val: aiHealth.metrics.recall },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <p className="text-sm font-bold text-emerald-300">{val != null ? (val * 100).toFixed(1) + "%" : "—"}</p>
                    <p className="text-[10px] text-slate-500 dark:text-white/30 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-white/20 mt-3">
                Train: {aiHealth.metrics.train_size?.toLocaleString()} samples · Dataset: CIC-IDS2017 (brute-force, DoS, Bot, DDoS)
              </p>
            </div>
          )}

          {/* Top risk */}
          {topRisk.length > 0 && (
            <div className={`${surfaceCard} p-5`}>
              <h3 className={`${admin.sectionTitle} mb-3`}>{t("admin.tokenSecurity.topRisk")}</h3>
              <ul className="space-y-2">
                {topRisk.slice(0, 5).map((t) => (
                  <li key={t.token_id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-white/55">
                    <RiskBadge level={t.risk_level} />
                    <span className="truncate flex-1">{t.email ?? t.blob_name ?? t.token_id}</span>
                    <span className="text-slate-600 dark:text-white/35">{t.risk_score}</span>
                    <RecBadge rec={t.recommendation} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Analyze button */}
          <div className={`${surfaceCard} p-5`}>
            <h3 className={`${admin.sectionTitle} mb-2`}>{t("admin.tokenSecurity.aiAnalyzeTitle")}</h3>
            <p className="text-xs text-slate-600 dark:text-white/35 mb-4">
              {t("admin.tokenSecurity.aiAnalyzeDesc")}
              {!aiReady && (
                <span className="text-amber-300/60 ml-2">
                  — {aiHealth?.mode === "remote"
                    ? (aiHealth.error ?? aiHealth.hint ?? t("admin.tokenSecurity.aiRemoteNotConnected"))
                    : (aiHealth?.hint ?? t("admin.tokenSecurity.aiNotReadyHint"))}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => void runAiAnalyze()}
              disabled={analyzing || !aiReady}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-white/10 text-sm font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? <LoadingSpinner size="sm" /> : null}
              {analyzing ? t("admin.tokenSecurity.analyzing") : t("admin.tokenSecurity.runAi")}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Token List ── */}
      {activeTab === "tokens" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {(["all", "jwt", "sas"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setTokenType(t); void loadTokens(t); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  tokenType === t ? admin.tabActive : admin.tabInactive
                }`}>
                {t.toUpperCase()}
              </button>
            ))}
            {tokensLoading && <LoadingSpinner size="sm" />}
          </div>

          <div className={`${surfaceCard} overflow-hidden`}>
            {!tokens.length ? (
              <p className="px-5 py-10 text-sm text-slate-500 dark:text-white/30 text-center">
                {tokensLoading ? t("common.loading") : t("admin.tokenSecurity.noTokens")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={admin.tableHeadInner}>
                      <th className="px-4 py-3 font-medium">Token / User</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">Score</th>
                      <th className="px-3 py-3 font-medium">IPs</th>
                      <th className="px-3 py-3 font-medium">Age (h)</th>
                      <th className="px-3 py-3 font-medium">Rec</th>
                      <th className="px-4 py-3 font-medium text-right">{t("admin.tokenSecurity.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t) => (
                      <tr key={t.token_id} className={admin.rowInner}>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="text-slate-900 dark:text-white/80 text-xs truncate">{t.email ?? t.blob_name ?? t.token_id.slice(0, 12) + "…"}</p>
                          <p className="text-[10px] text-slate-500 dark:text-white/30">{t.role ?? t.token_type}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            t.token_type === "jwt" ? "bg-indigo-500/15 text-indigo-300" : "bg-sky-500/15 text-sky-300"
                          }`}>{t.token_type.toUpperCase()}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-800 dark:text-white/70 text-xs w-5">{t.risk_score}</span>
                            <RiskBadge level={t.risk_level} />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-white/50 text-xs">{t.ip_count}</td>
                        <td className="px-3 py-3 text-slate-600 dark:text-white/50 text-xs">{t.token_age_hours}</td>
                        <td className="px-3 py-3"><RecBadge rec={t.recommendation} /></td>
                        <td className="px-4 py-3 text-right">
                          {t.token_type === "jwt" && t.user_id && (
                            <button type="button" disabled={busyId === t.user_id || t.active_sessions === 0}
                              onClick={() => void revokeJwt(t.user_id!, t.email ?? null)}
                              className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-30">
                              {busyId === t.user_id ? "…" : "Revoke"}
                            </button>
                          )}
                          {t.token_type === "sas" && !t.is_revoked && (
                            <button type="button" disabled={busyId === t.token_id}
                              onClick={() => void revokeSas(t.token_id)}
                              className="text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-30">
                              {busyId === t.token_id ? "…" : "Revoke"}
                            </button>
                          )}
                          {t.is_revoked && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white/70 dark:bg-transparent dark:text-white/25">
                              Revoked
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Trends ── */}
      {activeTab === "trends" && (
        <div className="space-y-4">
          {trendsLoading && (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          )}
          {trends && !trendsLoading && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t("admin.tokenSecurity.trendTokenAccess"), value: trends.totals.access_events, color: "text-violet-400" },
                  { label: t("admin.tokenSecurity.trendAiAlerts"), value: trends.totals.ai_alerts, color: "text-amber-400" },
                  { label: "Score AI ≥50%", value: trends.totals.ai_high_scores, color: "text-rose-400" },
                  { label: "Rule ≠ AI", value: trends.totals.rule_ai_disagree, color: "text-orange-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`${surfaceCard} p-4 text-center`}>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-[11px] text-slate-600 dark:text-white/35 mt-1">{label}</p>
                    <p className="text-[10px] text-slate-500 dark:text-white/25">{t("admin.tokenSecurity.days", { count: trends.days })}</p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { title: t("admin.tokenSecurity.chartTokenPerDay"), data: trends.access_events, color: "bg-violet-500/70" },
                  { title: t("admin.tokenSecurity.chartAiAlertsPerDay"), data: trends.ai_alerts, color: "bg-amber-500/70" },
                  { title: t("admin.tokenSecurity.chartAiHighPerDay"), data: trends.ai_high_scores, color: "bg-rose-500/70" },
                  { title: t("admin.tokenSecurity.chartRuleDisagreePerDay"), data: trends.rule_ai_disagree, color: "bg-orange-500/70" },
                ].map(({ title, data, color }) => (
                  <div key={title} className={`${surfaceCard} p-5`}>
                    <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 mb-4">{title}</h4>
                    <MiniBarChart labels={trends.labels} series={data} colorClass={color} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: File Activity ── */}
      {activeTab === "files" && (
        <div className="space-y-4">
          {fileActivityLoading && (
            <div className="flex justify-center py-10"><LoadingSpinner /></div>
          )}
          {fileActivity && !fileActivityLoading && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Upload", value: fileActivity.summary.uploads, color: "text-indigo-400" },
                  { label: "Download", value: fileActivity.summary.downloads, color: "text-sky-400" },
                  { label: t("admin.tokenSecurity.filesDownloaded"), value: fileActivity.summary.unique_files_downloaded, color: "text-violet-400" },
                  { label: t("admin.tokenSecurity.suspiciousFiles"), value: fileActivity.summary.suspicious_files, color: "text-rose-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`${surfaceCard} p-4 text-center`}>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-[11px] text-slate-600 dark:text-white/35 mt-1">{label}</p>
                    <p className="text-[10px] text-slate-500 dark:text-white/25">{t("admin.tokenSecurity.days", { count: fileActivity.days })}</p>
                  </div>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { title: t("admin.tokenSecurity.chartUploadPerDay"), data: fileActivity.trend.uploads_per_day, color: "bg-indigo-500/70" },
                  { title: t("admin.tokenSecurity.chartDownloadPerDay"), data: fileActivity.trend.downloads_per_day, color: "bg-sky-500/70" },
                ].map(({ title, data, color }) => (
                  <div key={title} className={`${surfaceCard} p-5`}>
                    <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 mb-4">{title}</h4>
                    <MiniBarChart labels={fileActivity.labels} series={data} colorClass={color} />
                  </div>
                ))}
              </div>

              {fileActivity.top_file_trends.length > 0 && (
                <div className={`${surfaceCard} p-5`}>
                  <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 mb-4">
                    {t("admin.tokenSecurity.topFileTrend")}
                  </h4>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fileActivity.top_file_trends.map((f) => (
                      <div key={f.file_id} className="rounded-xl border border-slate-200/10 p-3">
                        <button
                          type="button"
                          onClick={() => void loadFileDetail(f.file_id)}
                          className="text-xs font-medium text-sky-400 hover:underline truncate block max-w-full mb-2 text-left"
                          title={f.file_name}
                        >
                          {f.file_name}
                        </button>
                        <MiniBarChart
                          labels={fileActivity.labels}
                          series={f.downloads_per_day}
                          colorClass="bg-emerald-500/70"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`${surfaceCard} overflow-hidden`}>
                <div className="px-5 py-3 border-b border-slate-200/10 flex items-center justify-between">
                  <h3 className={admin.sectionTitle}>{t("admin.tokenSecurity.topFilesByDl")}</h3>
                  <button type="button" onClick={() => void loadFileActivity()} className={admin.btnGhost}>
                    {t("admin.refresh")}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 dark:text-white/35 border-b border-slate-200/10">
                        <th className="px-4 py-2 font-medium">File</th>
                        <th className="px-4 py-2 font-medium">Owner</th>
                        <th className="px-4 py-2 font-medium text-right">DL</th>
                        <th className="px-4 py-2 font-medium text-right">IP</th>
                        <th className="px-4 py-2 font-medium text-right">SAS</th>
                        <th className="px-4 py-2 font-medium text-right">AI</th>
                        <th className="px-4 py-2 font-medium">Risk</th>
                        <th className="px-4 py-2 font-medium"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fileActivity.top_files.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                            {t("admin.tokenSecurity.noDownloadsInDays", { days: fileActivity.days })}
                          </td>
                        </tr>
                      )}
                      {fileActivity.top_files.map((f) => (
                        <tr
                          key={`${f.file_id}-${f.file_name}`}
                          className="border-b border-slate-200/5 hover:bg-slate-500/5"
                        >
                          <td className="px-4 py-2.5 max-w-[200px]">
                            {f.file_id ? (
                              <button
                                type="button"
                                onClick={() => void loadFileDetail(f.file_id!)}
                                className="text-sky-400 hover:underline truncate block max-w-full text-left"
                                title={f.file_name}
                              >
                                {f.file_name}
                              </button>
                            ) : (
                              <span className="truncate block">{f.file_name}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-white/45 truncate max-w-[140px]">
                            <span className={f.owner_email_valid === false ? "text-amber-600 dark:text-amber-400" : ""}>
                              {f.owner_email ?? "—"}
                            </span>
                            {f.owner_email_valid === false && (
                              <span className="block text-[9px] text-amber-600 dark:text-amber-400">
                                {t("admin.ownerEmailInvalid")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">{f.downloads}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{f.unique_ips}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{f.active_sas_links}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{f.ai_alerts || "—"}</td>
                          <td className="px-4 py-2.5">
                            {f.suspicious || f.ai_alerts > 0 ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">
                                {f.ai_alerts > 0 ? "AI" : "IP"}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {f.suspicious && f.file_id ? (
                              <button
                                type="button"
                                onClick={() => void notifyFileOwner(f.file_id!)}
                                disabled={notifyOwnerBusy || f.owner_email_valid === false}
                                title={
                                  f.owner_email_valid === false
                                    ? t("admin.ownerEmailInvalidHint")
                                    : undefined
                                }
                                className="text-[10px] px-2 py-1 rounded bg-rose-600/80 text-white hover:bg-rose-500 disabled:opacity-50"
                              >
                                {t("admin.tokenSecurity.warn")}
                              </button>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {(fileDetailLoading || fileDetail) && (
            <div className={`${surfaceCard} p-5`}>
              {fileDetailLoading && <LoadingSpinner size="sm" />}
              {fileDetail && !fileDetailLoading && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white/90">
                        {fileDetail.file_name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Owner: {fileDetail.owner_email ?? "—"}
                        {fileDetail.owner_email_valid === false && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {" "}
                            ({t("admin.ownerEmailInvalid")})
                          </span>
                        )}
                        {" · "}
                        {fileDetail.storage_mode ?? "share"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFileDetail(null)}
                      className="ml-auto text-xs text-slate-500 hover:text-white"
                    >
                      {t("admin.close")}
                    </button>
                    {fileDetail.stats.suspicious && (
                      <button
                        type="button"
                        disabled={notifyOwnerBusy || fileDetail.owner_email_valid === false}
                        title={
                          fileDetail.owner_email_valid === false
                            ? t("admin.ownerEmailInvalidHint")
                            : undefined
                        }
                        onClick={() => void notifyFileOwner(fileDetail.file_id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-600/90 text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        {notifyOwnerBusy ? t("admin.notifying") : t("admin.notifyOwner")}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                    {[
                      ["Download", fileDetail.stats.downloads],
                      ["Upload", fileDetail.stats.uploads],
                      ["IP", fileDetail.stats.unique_ips],
                      ["SAS active", fileDetail.stats.active_sas_links],
                      [t("admin.tokenSecurity.risk"), fileDetail.stats.suspicious ? t("admin.tokenSecurity.riskYes") : t("admin.tokenSecurity.riskNo")],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="rounded-lg bg-slate-500/5 py-2">
                        <p className="font-mono font-semibold">{val}</p>
                        <p className="text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                  {fileDetail.recent_alerts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-amber-300 mb-2">{t("admin.tokenSecurity.relatedAiAlerts")}</h4>
                      <ul className="space-y-1.5 text-xs">
                        {fileDetail.recent_alerts.map((a) => (
                          <li key={a.id} className="flex flex-wrap gap-2 text-slate-600 dark:text-white/60">
                            <RecBadge rec={a.decision} />
                            <span>AI {a.ai_score_pct}%</span>
                            <span className="text-slate-500">{a.summary_vi ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {fileDetail.recent_downloads.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 mb-2">
                        {t("admin.tokenSecurity.recentDownloads")}
                      </h4>
                      <ul className="space-y-1 text-[11px] font-mono text-slate-500">
                        {fileDetail.recent_downloads.map((d, i) => (
                          <li key={i}>
                            {d.created_at.slice(0, 16)} · {d.ip_address ?? "?"} · user {d.user_id?.slice(0, 8) ?? "?"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: AI Report ── */}
      {activeTab === "ai-report" && (
        <div className="space-y-4">

          {/* Empty state */}
          {!aiResults.length && !aiError && (
            <div className={`${surfaceCard} p-8 text-center`}>
              <p className="text-slate-600 dark:text-white/35 text-sm mb-4">
                {t("admin.tokenSecurity.noAiReport")}
              </p>
              <button type="button" onClick={() => void runAiAnalyze()} disabled={analyzing || !aiReady}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm text-white transition disabled:opacity-50">
                {analyzing ? <LoadingSpinner size="sm" /> : null}
                {aiReady ? t("admin.tokenSecurity.runAi") : t("admin.tokenSecurity.modelNotReadyBtn")}
              </button>
            </div>
          )}

          {/* Error */}
          {aiError && !aiResults.length && (
            <div className={`${surfaceCard} p-5`}>
              <p className="text-sm text-amber-300/90">
                <span className="font-medium">{t("admin.tokenSecurity.aiError")}</span> {aiError}
              </p>
              {aiHealth && !aiHealth.ready && (
                <p className="text-xs text-slate-500 dark:text-white/30 mt-2 font-mono">
                  {aiHealth.hint ?? `cd ${aiHealth.ai_dir} && python train.py`}
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {aiResults.length > 0 && (
            <>
              {/* Summary stats */}
              <div className={`${surfaceCard} p-5`}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-emerald-300">{t("admin.tokenSecurity.aiResults")}</h3>
                  <span className="text-xs text-slate-500 dark:text-white/30">{t("admin.tokenSecurity.tokensAnalyzed", { count: aiResults.length })}</span>
                  <button
                    type="button"
                    onClick={exportAiCsv}
                    className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition"
                  >
                    {t("admin.tokenSecurity.exportCsv")}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                  {[
                    { label: t("admin.tokenSecurity.monitor"), value: aiResults.filter(r => r.decision === "MONITOR").length, color: "text-amber-300" },
                    { label: t("admin.tokenSecurity.revoke"), value: aiResults.filter(r => r.decision === "REVOKE").length, color: "text-rose-300" },
                    { label: t("admin.tokenSecurity.ruleDisagree"), value: aiResults.filter(r => r.agreement?.status === "disagree").length, color: "text-orange-300" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-[11px] text-slate-600 dark:text-white/35 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-token results */}
              <div className={`${surfaceCard} overflow-hidden`}>
                <div className={`px-5 py-3 border-b ${admin.divider}`}>
                  <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 uppercase tracking-wide">{t("admin.tokenSecurity.perTokenDetails")}</h4>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {aiResults.map((r, i) => {
                    const rule = aiRuleMetrics[i];
                    if (r.error) return (
                      <div key={r.token_id ?? i} className="px-5 py-3 text-xs text-rose-300/60">
                        {r.token_id?.slice(0, 12)}… — {t("admin.tokenSecurity.tokenError")} {r.error}
                      </div>
                    );
                    const ruleScore = r.rule_score ?? rule?.risk_score ?? "—";
                    const showDisagree = r.agreement?.status === "disagree";
                    return (
                      <details key={r.token_id ?? i} className="group px-5 py-3.5">
                        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span className="text-xs text-slate-800 dark:text-white/75 truncate max-w-[200px] sm:max-w-xs">
                              {rule?.email ?? r.token_id?.slice(0, 20) ?? "—"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                              r.token_type === "jwt" ? "bg-indigo-500/15 text-indigo-300" : "bg-sky-500/15 text-sky-300"
                            }`}>{(r.token_type ?? "jwt").toUpperCase()}</span>
                            <span className="text-xs font-medium text-slate-600 dark:text-white/55 shrink-0">
                              Rule {ruleScore} → AI {r.risk_score_pct}%
                            </span>
                            <RecBadge rec={r.decision} />
                            {showDisagree && r.agreement && (
                              <AgreementBadge status={r.agreement.status} label={r.agreement.label} />
                            )}
                            <span className="text-[10px] text-slate-500 dark:text-white/25 ml-auto hidden sm:inline group-open:hidden">
                              {t("admin.tokenSecurity.details")}
                            </span>
                          </div>
                          {(r.behavior_badges?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {r.behavior_badges!.slice(0, 2).map((b) => (
                                <BehaviorBadge key={b.id} label={b.label} severity={b.severity} />
                              ))}
                            </div>
                          )}
                        </summary>
                        <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-2 text-[11px] text-slate-500 dark:text-white/40">
                          <p>{r.summary_vi ?? r.explanation?.summary_vi}</p>
                          {r.explanation?.top_features?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {r.explanation.top_features.slice(0, 3).map((f, fi) => (
                                <span key={fi} className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  f.impact > 0 ? "bg-rose-500/10 text-rose-300/60" : "bg-emerald-500/10 text-emerald-300/60"
                                }`}>
                                  {f.feature} {f.impact > 0 ? "↑" : "↓"}{Math.abs(f.impact).toFixed(3)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
