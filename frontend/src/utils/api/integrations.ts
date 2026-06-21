/** integrations.ts — VirusTotal, Gemini assistant API. */

import { api } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrationsStatus {
  virustotal: boolean;
  gemini: boolean;
  gemini_model: string | null;
}

export interface VirusTotalHashResult {
  sha256: string;
  known: boolean;
  reputation: "clean" | "suspicious" | "malicious" | "unknown";
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  total_engines: number;
  message: string;
  permalink: string | null;
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
  const res = await api.get<IntegrationsStatus>("/integrations/status");
  return res.data;
}

export async function checkHashVirusTotal(sha256: string): Promise<VirusTotalHashResult> {
  const res = await api.post<VirusTotalHashResult>("/integrations/virustotal/hash", {
    sha256,
  });
  return res.data;
}

export async function sendAssistantMessage(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await api.post<{ reply: string }>("/integrations/assistant/chat", {
    message,
    history,
  });
  return res.data.reply;
}
