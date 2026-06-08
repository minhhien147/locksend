import { useCallback, useEffect, useState } from "react";
import api from "../utils/api";
import { useDraftState } from "../hooks/useDraftState";

const ADMIN_TOKEN_PAGE_KEY = "admin-token-security";
import PageLoader, { LoadingSpinner } from "../components/LoadingSpinner";

import { admin, surfaceCard } from "../styles/theme";

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

interface AiTokenResult {
  token_id?: string;
  token_type?: string;
  risk_score_pct: number;
  risk_score_raw: number;
  risk_level: string;
  ai_level_raw: string;
  decision: string;
  is_attack: boolean;
  explanation: {
    summary: string;
    top_features: ShapFeature[];
  };
  error?: string;
}

type Tab = "overview" | "tokens" | "ai-report";

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminTokenSecurityPage() {
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
      flash("err", "Không tải được dữ liệu token security");
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
      setAiHealth({ ready: false, error: "Không kết nối được backend" });
    } finally {
      setAiHealthLoading(false);
    }
  }, []);

  useEffect(() => { void loadAiHealth(); }, [loadAiHealth]);

  // ── Load token list ─────────────────────────────────────────────────────────

  const loadTokens = useCallback(async (type: "all" | "jwt" | "sas" = tokenType) => {
    setTokensLoading(true);
    try {
      const res = await api.get<{ tokens: TokenMetric[] }>(
        `/auth/admin/token-security/tokens?token_type=${type}`
      );
      setTokens(res.data.tokens);
    } catch {
      flash("err", "Không tải được danh sách token");
    } finally {
      setTokensLoading(false);
    }
  }, [tokenType]);

  useEffect(() => {
    if (activeTab === "tokens") void loadTokens();
  }, [activeTab, loadTokens]);

  // ── AI analysis ─────────────────────────────────────────────────────────────

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
      flash("ok", `LockSend AI đã phân tích ${res.data.analyzed} token`);
    } catch {
      setAiError("Phân tích AI thất bại — kiểm tra model đã train chưa");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const revokeJwt = async (userId: string, email: string | null) => {
    if (!confirm(`Thu hồi toàn bộ phiên JWT của "${email ?? userId}"?`)) return;
    setBusyId(userId);
    try {
      const res = await api.post<{ revoked_sessions: number }>(
        `/auth/admin/token-security/revoke/jwt/${userId}`,
        { reason: "Admin manual revoke" }
      );
      flash("ok", `Đã thu hồi ${res.data.revoked_sessions} phiên`);
      void loadOverview();
    } catch {
      flash("err", "Thu hồi JWT thất bại");
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
      flash("ok", "SAS token đã bị thu hồi");
      void loadTokens();
    } catch {
      flash("err", "Thu hồi SAS thất bại");
    } finally {
      setBusyId(null);
    }
  };

  const triggerAutoRevoke = async () => {
    if (!confirm("Tự động thu hồi tất cả token có risk score cao? Hành động không thể hoàn tác.")) return;
    try {
      const res = await api.post<{ revoked_jwt_sessions: number; revoked_sas_tokens: number }>(
        "/auth/admin/token-security/auto-revoke"
      );
      flash("ok", `Auto-revoke: ${res.data.revoked_jwt_sessions} JWT, ${res.data.revoked_sas_tokens} SAS`);
      void loadOverview();
    } catch {
      flash("err", "Auto-revoke thất bại");
    }
  };

  const cleanup = async () => {
    try {
      const res = await api.post<{ deleted_sas_records: number; deleted_access_logs: number }>(
        "/auth/admin/token-security/cleanup"
      );
      flash("ok", `Đã xóa ${res.data.deleted_sas_records} SAS records, ${res.data.deleted_access_logs} access logs cũ`);
    } catch {
      flash("err", "Cleanup thất bại");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && !overview) {
    return <PageLoader title="Đang tải Token Security…" />;
  }

  const topRisk = overview?.top_risk_tokens ?? [];
  const aiReady = aiHealth?.ready === true;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className={admin.title}>Token Security</h2>
          <p className={admin.desc}>
            LockSend AI · Rule engine · Auto-revoke · Không truy cập plaintext
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className={`${admin.btnGhost} disabled:opacity-40`}
          >
            Làm mới
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
                : "model chưa sẵn sàng"}
            </span>
          )}
        </div>

        <div className={`h-4 w-px ${admin.dividerLight}`} />

        {/* Rule engine */}
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">● Rule engine</span>
        <span className="text-xs text-slate-500 dark:text-white/30">
          Ngưỡng auto-revoke: {overview?.config.auto_revoke_score_threshold ?? 80}
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
        {(["overview", "tokens", "ai-report"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              activeTab === t ? admin.tabActive : admin.tabInactive
            }`}>
            {t === "overview" ? "Overview" : t === "tokens" ? "Token List" : "AI Report"}
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
                ⚠ {overview.risk_summary.critical_tokens} token CRITICAL — khuyến nghị revoke ngay
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
              <h3 className={`${admin.sectionTitle} mb-3`}>Top rủi ro (rule engine)</h3>
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
            <h3 className={`${admin.sectionTitle} mb-2`}>Phân tích bằng LockSend AI</h3>
            <p className="text-xs text-slate-600 dark:text-white/35 mb-4">
              Random Forest (CIC-IDS2017) · SHAP explanation · Top 20 token theo risk score
              {!aiReady && (
                <span className="text-amber-300/60 ml-2">
                  — {aiHealth?.mode === "remote"
                    ? (aiHealth.error ?? aiHealth.hint ?? "AI remote chưa kết nối được")
                    : (aiHealth?.hint ?? "model chưa sẵn sàng — set LOCKSEND_AI_URL trên Railway BE")}
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
              {analyzing ? "Đang phân tích AI…" : "Chạy LockSend AI"}
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
                {tokensLoading ? "Đang tải…" : "Không có token nào"}
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
                      <th className="px-4 py-3 font-medium text-right">Hành động</th>
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

      {/* ── Tab: AI Report ── */}
      {activeTab === "ai-report" && (
        <div className="space-y-4">

          {/* Empty state */}
          {!aiResults.length && !aiError && (
            <div className={`${surfaceCard} p-8 text-center`}>
              <p className="text-slate-600 dark:text-white/35 text-sm mb-4">
                Chưa có báo cáo AI. Nhấn "Chạy LockSend AI" ở tab Overview.
              </p>
              <button type="button" onClick={() => void runAiAnalyze()} disabled={analyzing || !aiReady}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm text-white transition disabled:opacity-50">
                {analyzing ? <LoadingSpinner size="sm" /> : null}
                {aiReady ? "Chạy LockSend AI" : "Model chưa sẵn sàng"}
              </button>
            </div>
          )}

          {/* Error */}
          {aiError && !aiResults.length && (
            <div className={`${surfaceCard} p-5`}>
              <p className="text-sm text-amber-300/90">
                <span className="font-medium">LockSend AI lỗi:</span> {aiError}
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
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-emerald-300">Kết quả LockSend AI</h3>
                  <span className="text-xs text-slate-500 dark:text-white/30">{aiResults.length} token được phân tích</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: "Tấn công phát hiện", value: aiResults.filter(r => r.is_attack).length, color: "text-rose-400" },
                    { label: "REVOKE",  value: aiResults.filter(r => r.decision === "REVOKE").length,  color: "text-rose-300" },
                    { label: "MONITOR", value: aiResults.filter(r => r.decision === "MONITOR").length, color: "text-amber-300" },
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
                  <h4 className="text-xs font-semibold text-slate-600 dark:text-white/50 uppercase tracking-wide">Chi tiết từng token</h4>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {aiResults.map((r, i) => {
                    const rule = aiRuleMetrics[i];
                    if (r.error) return (
                      <div key={r.token_id ?? i} className="px-5 py-3 text-xs text-rose-300/60">
                        {r.token_id?.slice(0, 12)}… — lỗi: {r.error}
                      </div>
                    );
                    return (
                      <div key={r.token_id ?? i} className="px-5 py-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-700 dark:text-white/60 font-mono">
                            {rule?.email ?? r.token_id?.slice(0, 16) ?? "—"}…
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            r.token_type === "jwt" ? "bg-indigo-500/15 text-indigo-300" : "bg-sky-500/15 text-sky-300"
                          }`}>{(r.token_type ?? "jwt").toUpperCase()}</span>
                          <RiskBadge level={r.risk_level} />
                          <span className="text-xs text-slate-600 dark:text-white/50">
                            AI: {r.risk_score_pct}% ({r.ai_level_raw})
                          </span>
                          <RecBadge rec={r.decision} />
                          {r.is_attack && (
                            <span className="text-[10px] text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full">
                              ATTACK
                            </span>
                          )}
                        </div>
                        {/* Explanation */}
                        <p className="text-[11px] text-slate-600 dark:text-white/40 leading-relaxed">
                          {r.explanation?.summary}
                        </p>
                        {/* SHAP top features */}
                        {r.explanation?.top_features?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {r.explanation.top_features.slice(0, 3).map((f, fi) => (
                              <span key={fi} className={`text-[10px] px-2 py-0.5 rounded-full ${
                                f.impact > 0 ? "bg-rose-500/10 text-rose-300/70" : "bg-emerald-500/10 text-emerald-300/70"
                              }`}>
                                {f.feature} {f.impact > 0 ? "↑" : "↓"}{Math.abs(f.impact).toFixed(3)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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
