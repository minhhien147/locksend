import { useState, useEffect, useRef } from "react";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  saveKeysToStorage,
  loadKeysFromStorage,
  clearKeysFromStorage,
  toBase64,
} from "../utils/crypto";

const surfaceCard =
  "rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 via-[#0c0e14]/95 to-violet-950/25 shadow-xl shadow-indigo-950/30";
const keyField =
  "rounded-xl border border-indigo-500/20 bg-[#0b0d12] px-3 py-2.5 text-[13px] sm:text-sm font-mono text-white/80 break-all leading-relaxed";

type DangerStep = null | "replace-keys" | "delete-keys";

export default function KeyManagement() {
  const [keys, setKeys] = useState<ReturnType<typeof loadKeysFromStorage>>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dangerStep, setDangerStep] = useState<DangerStep>(null);
  const statusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setKeys(loadKeysFromStorage());
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  function showStatus(msg: string) {
    setStatus(msg);
    setDangerStep(null);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4500);
  }

  function handleGenerate() {
    setDangerStep(null);
    const x25519Keys = generateX25519KeyPair();
    const ed25519Keys = generateEd25519KeyPair();
    saveKeysToStorage(x25519Keys, ed25519Keys);
    setKeys(loadKeysFromStorage());
    showStatus("Đã tạo keypair mới và lưu cục bộ trên trình duyệt.");
  }

  function handleClear() {
    setDangerStep(null);
    clearKeysFromStorage();
    setKeys(null);
    showStatus("Đã xóa keypair khỏi trình duyệt.");
  }

  function copyToClipboard(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2000);
  }

  function requestGenerate() {
    if (!keys) {
      handleGenerate();
      return;
    }
    setDangerStep("replace-keys");
    setStatus(null);
  }

  function requestDelete() {
    setDangerStep("delete-keys");
    setStatus(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight">Quản lý Keypair</h1>
      </header>

      {!keys ? (
        <div className={`${surfaceCard} p-8 sm:p-10 text-center space-y-5`}>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <p className="text-white/80 font-medium">Chưa có keypair</p>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Tạo Keypair
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-4">
            <KeyBlock
              title="X25519"
              accent="indigo"
              value={toBase64(keys.x25519.publicKey)}
              copied={copied === "x25519"}
              onCopy={() => copyToClipboard(toBase64(keys.x25519.publicKey), "x25519")}
            />
            <KeyBlock
              title="Ed25519"
              accent="violet"
              value={toBase64(keys.ed25519.publicKey)}
              copied={copied === "ed25519"}
              onCopy={() => copyToClipboard(toBase64(keys.ed25519.publicKey), "ed25519")}
            />
          </div>

          <div className={`${surfaceCard} p-4 sm:p-5 space-y-4`}>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={requestGenerate}
                disabled={dangerStep !== null}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/15 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Tạo Keypair mới
              </button>
              <button
                type="button"
                onClick={requestDelete}
                disabled={dangerStep !== null}
                className="sm:w-44 py-3 rounded-xl text-sm font-medium border border-rose-500/30 text-rose-400/95 hover:bg-rose-500/10 hover:border-rose-400/45 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Xóa keys…
              </button>
            </div>

            {dangerStep === "replace-keys" && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 space-y-3">
                <p className="text-sm text-amber-200/95">Ghi đè keypair trên trình duyệt này?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDangerStep(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-white/15 text-white/70 hover:bg-white/[0.06]"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleGenerate();
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30"
                  >
                    Xác nhận thay thế
                  </button>
                </div>
              </div>
            )}

            {dangerStep === "delete-keys" && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-950/30 px-4 py-3 space-y-3">
                <p className="text-sm text-rose-200/95">Xóa key khỏi trình duyệt này?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDangerStep(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-white/15 text-white/70 hover:bg-white/[0.06]"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleClear();
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600/90 text-white hover:bg-rose-600"
                  >
                    Xóa vĩnh viễn
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {status && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-200/95"
        >
          <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}

function KeyBlock({
  title,
  accent,
  value,
  copied,
  onCopy,
}: {
  title: string;
  accent: "indigo" | "violet";
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const ring = accent === "indigo" ? "ring-indigo-400/20" : "ring-violet-400/20";
  const dot = accent === "indigo" ? "bg-indigo-400" : "bg-violet-400";
  const labelColor = accent === "indigo" ? "text-indigo-300" : "text-violet-300";

  return (
    <div className={`${surfaceCard} p-4 sm:p-5 ring-1 ${ring}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{title}</span>
          <span className="text-[10px] text-white/30 font-medium normal-case">· public</span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition
            ${copied
              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
              : accent === "indigo"
                ? "border-indigo-500/25 text-indigo-400/90 hover:bg-indigo-500/15"
                : "border-violet-500/25 text-violet-400/90 hover:bg-violet-500/15"
            }`}
        >
          {copied ? "Đã copy" : "Copy"}
        </button>
      </div>
      <div className={keyField}>{value}</div>
    </div>
  );
}
