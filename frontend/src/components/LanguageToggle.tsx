import { useLanguage } from "../i18n/context";

type Props = {
  className?: string;
  showLabel?: boolean;
};

export default function LanguageToggle({ className = "", showLabel = false }: Props) {
  const { locale, setLocale, t } = useLanguage();
  const isEn = locale === "en";

  return (
    <div
      className={`inline-flex items-center rounded-lg border overflow-hidden
        border-slate-300/55 bg-[#e4e7ee] dark:border-white/10 dark:bg-white/[0.04]
        ${className}`}
      role="group"
      aria-label={t("lang.toggle")}
    >
      <button
        type="button"
        onClick={() => setLocale("en")}
        title={t("lang.switchToEn")}
        className={`px-2 py-1.5 text-[11px] font-semibold transition ${
          isEn
            ? "bg-blue-700 text-white"
            : "text-slate-600 hover:bg-slate-300/40 dark:text-white/50 dark:hover:bg-white/[0.08]"
        }`}
      >
        {t("lang.en")}
      </button>
      <button
        type="button"
        onClick={() => setLocale("vi")}
        title={t("lang.switchToVi")}
        className={`px-2 py-1.5 text-[11px] font-semibold transition ${
          !isEn
            ? "bg-blue-700 text-white"
            : "text-slate-600 hover:bg-slate-300/40 dark:text-white/50 dark:hover:bg-white/[0.08]"
        }`}
      >
        {t("lang.vi")}
      </button>
      {showLabel && (
        <span className="sr-only">{t("lang.toggle")}</span>
      )}
    </div>
  );
}
