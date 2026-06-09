import { useEffect, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import axios from "axios";
import { useT } from "../i18n/context";
import { text } from "../styles/theme";

function resolveApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/api";
  return "";
}

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void | Promise<void>;
  onError?: () => void;
  disabled?: boolean;
}

function GoogleLoginInner({ onSuccess, onError, disabled }: GoogleSignInButtonProps) {
  const t = useT();

  const handleSuccess = (response: CredentialResponse) => {
    if (!response.credential) {
      onError?.();
      return;
    }
    void onSuccess(response.credential);
  };

  return (
    <div className={`space-y-3 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`flex-1 h-px ${text.faint} bg-current opacity-20`} />
        <span className={`text-[11px] uppercase tracking-wide ${text.faint}`}>
          {t("auth.orContinueWith")}
        </span>
        <div className={`flex-1 h-px ${text.faint} bg-current opacity-20`} />
      </div>
      <div className="flex justify-center [&>div]:w-full">
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => onError?.()}
          theme="outline"
          size="large"
          text="continue_with"
          shape="rectangular"
          width="340"
        />
      </div>
    </div>
  );
}

export default function GoogleSignInButton(props: GoogleSignInButtonProps) {
  const [clientId, setClientId] = useState(
    () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ""
  );

  useEffect(() => {
    if (clientId) return;
    const base = resolveApiBaseUrl();
    if (!base) return;

    axios
      .get<{ enabled: boolean; client_id: string }>(`${base}/auth/google/config`)
      .then((res) => {
        if (res.data.enabled && res.data.client_id) {
          setClientId(res.data.client_id);
        }
      })
      .catch(() => {
        /* Google sign-in optional */
      });
  }, [clientId]);

  if (!clientId) return null;

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleLoginInner {...props} />
    </GoogleOAuthProvider>
  );
}
