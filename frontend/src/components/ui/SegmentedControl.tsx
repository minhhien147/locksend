import { tabs } from "../../styles/theme";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export default function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={tabs.wrap} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`${tabs.item} ${value === opt.value ? tabs.itemActive : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
