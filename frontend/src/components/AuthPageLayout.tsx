import FloatingCryptoIcons from "./FloatingCryptoIcons";
import { shell } from "../styles/theme";

/**
 * Nền trái z-0 · icon z-12 · shell z-20 (2 cột login/register).
 */
export default function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ls-auth ${shell.auth}`}>
      <div
        className={`hidden lg:block absolute inset-y-0 left-0 lg:w-[42%] xl:w-[38%] z-0 pointer-events-none ${shell.authAsideBg}`}
        aria-hidden
      />

      <FloatingCryptoIcons containerClassName="fixed inset-0 z-[12] pointer-events-none overflow-hidden hidden lg:block [clip-path:polygon(0_0,42%_0,42%_100%,0_100%)] xl:[clip-path:polygon(0_0,38%_0,38%_100%,0_100%)]" />

      <div className="ls-auth__shell">{children}</div>
    </div>
  );
}
