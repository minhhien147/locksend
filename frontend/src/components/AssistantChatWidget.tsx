import { useEffect, useMemo, useRef, useState } from "react";

import Button from "./ui/Button";

import Alert from "./ui/Alert";

import { LoadingSpinner } from "./LoadingSpinner";

import {

  apiErrorDetail,

  getIntegrationsStatus,

  sendAssistantMessage,

  type IntegrationsStatus,

} from "../utils/api";

import { useT } from "../i18n/context";

import { inputBase, surfaceInset, text } from "../styles/theme";



type ChatMessage = { role: "user" | "assistant"; content: string };



export default function AssistantChatWidget() {

  const t = useT();

  const starters = useMemo(

    () => [t("assistant.starter1"), t("assistant.starter2"), t("assistant.starter3"), t("assistant.starter4")],

    [t]

  );

  const [open, setOpen] = useState(false);

  const [status, setStatus] = useState<IntegrationsStatus | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);



  useEffect(() => {

    void getIntegrationsStatus()

      .then(setStatus)

      .catch(() => setStatus({ virustotal: false, gemini: false, gemini_model: null }));

  }, []);



  useEffect(() => {

    if (!open) return;

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  }, [messages, loading, open]);



  useEffect(() => {

    if (!open) return;

    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);

    return () => window.clearTimeout(timer);

  }, [open]);



  useEffect(() => {

    if (!open) return;

    const onKey = (e: KeyboardEvent) => {

      if (e.key === "Escape") setOpen(false);

    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [open]);



  async function handleSend(textMsg?: string) {

    const msg = (textMsg ?? input).trim();

    if (!msg || loading) return;

    if (!status?.gemini) {

      setError(t("assistant.geminiOff"));

      return;

    }



    setError("");

    setInput("");

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: msg }];

    setMessages(nextMessages);

    setLoading(true);



    try {

      const reply = await sendAssistantMessage(

        msg,

        messages.map((m) => ({ role: m.role, content: m.content }))

      );

      setMessages([...nextMessages, { role: "assistant", content: reply }]);

    } catch (e) {

      setError(apiErrorDetail(e, t("assistant.sendFailed")));

      setMessages(messages);

      setInput(msg);

    } finally {

      setLoading(false);

    }

  }



  return (

    <div

      className="fixed bottom-5 right-5 z-[45] flex flex-col items-end gap-3"

      aria-live="polite"

    >

      {open && (

        <div

          role="dialog"

          aria-label={t("assistant.title")}

          className={

            "flex flex-col w-[min(calc(100vw-2.5rem),380px)] h-[min(calc(100vh-7rem),520px)] " +

            "rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15 " +

            "dark:border-slate-700/80 dark:bg-[#111318] dark:shadow-black/40 " +

            "overflow-hidden origin-bottom-right"

          }

        >

          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-indigo-600 text-white shrink-0">

            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">

              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

                <path

                  strokeLinecap="round"

                  strokeLinejoin="round"

                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z"

                />

              </svg>

            </div>

            <div className="flex-1 min-w-0">

              <p className="text-sm font-semibold leading-tight">{t("assistant.title")}</p>

              <p className="text-[11px] text-indigo-100/90 truncate">

                {status?.gemini ? t("assistant.subtitle") : t("assistant.geminiOff")}

              </p>

            </div>

            <button

              type="button"

              onClick={() => setOpen(false)}

              className="p-1.5 rounded-lg hover:bg-white/15 transition"

              aria-label={t("assistant.close")}

            >

              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />

              </svg>

            </button>

          </div>



          {status && !status.gemini && (

            <div className="px-3 pt-3 shrink-0">

              <Alert tone="warning">{t("assistant.geminiConfig")}</Alert>

            </div>

          )}



          {error && (

            <div className="px-3 pt-2 shrink-0">

              <Alert tone="error">{error}</Alert>

            </div>

          )}



          <div className={`flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0 ${surfaceInset} mx-3 my-2 rounded-xl border-0`}>

            {messages.length === 0 && (

              <div className="space-y-2.5">

                <p className={`text-xs ${text.muted}`}>{t("assistant.hello")}</p>

                <p className={`text-[11px] ${text.faint}`}>{t("assistant.suggestions")}</p>

                <div className="flex flex-col gap-1.5">

                  {starters.map((q) => (

                    <button

                      key={q}

                      type="button"

                      disabled={loading || !status?.gemini}

                      onClick={() => void handleSend(q)}

                      className="text-left text-[11px] px-2.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition"

                    >

                      {q}

                    </button>

                  ))}

                </div>

              </div>

            )}



            {messages.map((m, i) => (

              <div

                key={i}

                className={`text-[13px] leading-relaxed rounded-2xl px-3 py-2 max-w-[90%] whitespace-pre-wrap ${

                  m.role === "user"

                    ? "ml-auto bg-indigo-600 text-white rounded-br-md"

                    : "mr-auto bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-white/85 rounded-bl-md"

                }`}

              >

                {m.content}

              </div>

            ))}



            {loading && (

              <div className={`flex items-center gap-2 text-xs ${text.muted}`}>

                <LoadingSpinner size="sm" />

                {t("assistant.replying")}

              </div>

            )}

            <div ref={bottomRef} />

          </div>



          <form

            className="p-3 border-t border-slate-200 dark:border-white/10 flex gap-2 shrink-0 bg-white dark:bg-[#111318]"

            onSubmit={(e) => {

              e.preventDefault();

              void handleSend();

            }}

          >

            <input

              ref={inputRef}

              value={input}

              onChange={(e) => setInput(e.target.value)}

              disabled={loading || !status?.gemini}

              placeholder={t("assistant.placeholder")}

              className={`flex-1 text-sm ${inputBase}`}

            />

            <Button

              type="submit"

              className="shrink-0 px-3 py-2 text-sm"

              disabled={loading || !input.trim() || !status?.gemini}

            >

              {t("common.send")}

            </Button>

          </form>



          {status?.gemini && status.gemini_model && (

            <p className={`text-[10px] px-3 pb-2 -mt-1 ${text.faint}`}>

              {status.gemini_model}

            </p>

          )}

        </div>

      )}



      <button

        type="button"

        onClick={() => setOpen((v) => !v)}

        aria-label={open ? t("assistant.collapse") : t("assistant.open")}

        aria-expanded={open}

        className={

          "group relative w-14 h-14 rounded-full flex items-center justify-center " +

          "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 " +

          "hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all duration-200 " +

          "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 " +

          "dark:focus-visible:ring-offset-[#0b0d12]"

        }

      >

        {!open && messages.length > 0 && (

          <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-indigo-600" />

        )}

        {open ? (

          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />

          </svg>

        ) : (

          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>

            <path

              strokeLinecap="round"

              strokeLinejoin="round"

              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z"

            />

          </svg>

        )}

      </button>

    </div>

  );

}

