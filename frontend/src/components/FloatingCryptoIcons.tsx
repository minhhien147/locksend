/**
 * Ba icon (khóa, mây, chìa) bay nhẹ — dùng chung login/register và App shell.
 * CSS animation: index.css (.animate-orbit-1/2/3)
 */

type Props = {
  /**
   * Vị trí khung chứa. Mặc định: full viewport (z-0), ẩn dưới breakpoint lg.
   * Trong panel: truyền `absolute inset-0` (cha cần `relative overflow-hidden`).
   */
  containerClassName?: string;
};

export default function FloatingCryptoIcons({
  containerClassName = "fixed inset-0 z-0 pointer-events-none overflow-hidden hidden lg:block",
}: Props) {
  return (
    <div className={containerClassName} aria-hidden>
      <div className="absolute right-[18%] top-[32%] animate-orbit-1">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/[0.10] border border-indigo-400/[0.15] flex items-center justify-center shadow-lg shadow-indigo-500/10">
          <svg className="w-7 h-7 text-indigo-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </div>

      <div className="absolute left-[12%] top-[52%] animate-orbit-2">
        <div className="w-12 h-12 rounded-xl bg-violet-500/[0.10] border border-violet-400/[0.14] flex items-center justify-center shadow-lg shadow-violet-500/10">
          <svg className="w-6 h-6 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
      </div>

      <div className="absolute right-[28%] bottom-[26%] animate-orbit-3">
        <div className="w-11 h-11 rounded-xl bg-sky-500/[0.09] border border-sky-400/[0.13] flex items-center justify-center shadow-lg shadow-sky-500/10">
          <svg className="w-5 h-5 text-sky-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
