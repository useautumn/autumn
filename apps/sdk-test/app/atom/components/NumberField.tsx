import { Input } from "@autumn/ui";

export const NumberField = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <label className="flex w-24 flex-col gap-1">
    <span className="text-xs text-tertiary-foreground">{label}</span>
    <Input
      inputMode="decimal"
      className="font-mono tabular-nums"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);
