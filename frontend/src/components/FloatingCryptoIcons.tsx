/**
 * Icon crypto bay khắp màn hình (khóa, mây, chìa, shield).
 */

const ICON_BOX =
  "rounded-lg border border-slate-300/90 bg-white shadow-md flex items-center justify-center " +
  "dark:border-slate-600 dark:bg-slate-800/90 dark:shadow-lg dark:shadow-black/20";

/** Layer icon — trên nền trang, dưới nội dung (z-20). */
export const FLOATING_ICONS_LAYER =
  "fixed inset-0 z-[12] pointer-events-none overflow-hidden";

type Props = {
  containerClassName?: string;
};

export default function FloatingCryptoIcons({
  containerClassName = `${FLOATING_ICONS_LAYER} hidden lg:block`,
}: Props) {
  return (
    <div className={containerClassName} aria-hidden>
      <div className="ls-float-icon ls-float-drift-1">
        <div className={`w-14 h-14 p-3.5 ${ICON_BOX}`}>
          <svg className="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-2">
        <div className={`w-12 h-12 p-3 ${ICON_BOX}`}>
          <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-3">
        <div className={`w-11 h-11 p-2.5 ${ICON_BOX}`}>
          <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
      </div>

      <div className="ls-float-icon ls-float-drift-4">
        <div className={`w-10 h-10 p-2 ${ICON_BOX}`}>
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
