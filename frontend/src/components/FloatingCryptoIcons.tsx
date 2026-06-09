/**
 * Icon crypto bay khắp màn hình (khóa, mây, chìa, shield).
 */

const ICON_BOX =
  "rounded-md border border-white/25 bg-[#0d1118]/40 flex items-center justify-center " +
  "dark:border-white/[0.08]";

/** Layer trang trí — tối giản (Security Console) */
export const FLOATING_ICONS_LAYER =
  "fixed inset-0 z-[8] pointer-events-none overflow-hidden opacity-[0.22] dark:opacity-[0.18]";

type Props = {
  containerClassName?: string;
};

export default function FloatingCryptoIcons({
  containerClassName = `${FLOATING_ICONS_LAYER} hidden xl:block`,
}: Props) {
  return (
    <div className={containerClassName} aria-hidden>
      <div className="ls-float-icon ls-float-drift-1">
        <div className={`w-14 h-14 p-3.5 ${ICON_BOX}`}>
          <svg className="w-7 h-7 text-blue-500/80 dark:text-blue-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-2">
        <div className={`w-12 h-12 p-3 ${ICON_BOX}`}>
          <svg className="w-6 h-6 text-sky-500/80 dark:text-sky-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-3">
        <div className={`w-11 h-11 p-2.5 ${ICON_BOX}`}>
          <svg className="w-5 h-5 text-slate-400/80 dark:text-slate-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-4">
        <div className={`w-10 h-10 p-2 ${ICON_BOX}`}>
          <svg className="w-5 h-5 text-emerald-500/70 dark:text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
