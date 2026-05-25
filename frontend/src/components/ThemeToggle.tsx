import { useTheme } from "../contexts/ThemeContext";

type Props = {
  className?: string;
  showLabel?: boolean;
};

export default function ThemeToggle({ className = "", showLabel = false }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
      aria-label={isDark ? "Bật chế độ sáng" : "Bật chế độ tối"}
      className={`inline-flex items-center gap-2 p-2 rounded-lg border transition
        border-slate-300/55 bg-[#e4e7ee] text-slate-600 hover:bg-slate-300/40 hover:text-slate-800
        dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50 dark:hover:bg-white/[0.08] dark:hover:text-white/90
        ${className}`}
    >
      {isDark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
      {showLabel && (
        <span className="text-xs font-medium hidden sm:inline">
          {isDark ? "Sáng" : "Tối"}
        </span>
      )}
    </button>
  );
}
