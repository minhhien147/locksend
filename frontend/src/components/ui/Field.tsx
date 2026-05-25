import { label } from "../../styles/theme";

export default function Field({
  label: labelText,
  hint,
  required,
  children,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {labelText && (
        <label className={label}>
          {labelText}
          {required && <span className="text-rose-600 dark:text-rose-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
