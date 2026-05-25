import { alert } from "../../styles/theme";

type Tone = "info" | "warning" | "error" | "success";

export default function Alert({
  children,
  tone = "info",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <div className={`${alert[tone]} ${className}`.trim()}>{children}</div>;
}
