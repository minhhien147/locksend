import { badge } from "../../styles/theme";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={`${badge[tone]} ${className}`.trim()}>{children}</span>;
}
