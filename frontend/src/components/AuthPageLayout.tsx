import FloatingCryptoIcons, { FLOATING_ICONS_LAYER } from "./FloatingCryptoIcons";
import { shell } from "../styles/theme";

/**
 * Nền trái (lớp z-0) · icon bay z-[12] · nội dung z-20.
 * Không tô nền phải ở z-0 — tránh che icon khi trôi sang panel login.
 */
export default function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${shell.auth} relative`}>
      <div
        className={`hidden lg:block absolute inset-y-0 left-0 lg:w-[42%] xl:w-[38%] z-0 pointer-events-none ${shell.authAsideBg}`}
        aria-hidden
      />

      <FloatingCryptoIcons containerClassName={`${FLOATING_ICONS_LAYER} hidden lg:block`} />

      {children}
    </div>
  );
}
