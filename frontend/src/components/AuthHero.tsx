import { brand, label, text } from "../styles/theme";

type Variant = "login" | "register";

const COPY: Record<Variant, { eyebrow: string; lead: string; accent: string }> = {
  login: {
    eyebrow: "Secure file sharing",
    lead: "Only you",
    accent: "hold the key.",
  },
  register: {
    eyebrow: "Create your workspace",
    lead: "Security",
    accent: "by design.",
  },
};

export default function AuthHero({ variant }: { variant: Variant }) {
  const { eyebrow, lead, accent } = COPY[variant];

  return (
    <div className="max-w-md">
      <div className="space-y-4">
        <p className={label}>{eyebrow}</p>
        <h2 className="text-3xl xl:text-[2.35rem] font-semibold leading-[1.12] tracking-tight">
          <span className={`block text-xl xl:text-2xl font-normal mb-1 ${text.muted}`}>{lead}</span>
          <span className={text.primary}>
            <span className={brand.send}>{accent}</span>
          </span>
        </h2>
        <div
          className="h-px w-10 bg-sky-500/50 dark:bg-sky-400/40"
          aria-hidden
        />
      </div>
    </div>
  );
}
