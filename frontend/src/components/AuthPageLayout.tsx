import FloatingCryptoIcons from "./FloatingCryptoIcons";
import { shell } from "../styles/theme";

/**
 * z-0 nền trái · z-8 icon (dưới UI) · z-20 shell login/register.
 */
export default function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ls-auth ${shell.auth}`}>
      <div
        className={`hidden lg:block absolute inset-y-0 left-0 lg:w-[42%] xl:w-[38%] z-0 pointer-events-none ${shell.authAsideBg}`}
        aria-hidden
      />

      <FloatingCryptoIcons containerClassName="fixed inset-0 z-[8] pointer-events-none overflow-hidden hidden lg:block" />

      <div className="ls-auth__shell">{children}</div>
    </div>
  );
}
