import { GroupedTabButton } from "@autumn/ui";

export const OptionToggle = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<T>;
  onChange: (value: T) => void;
}) => (
  <GroupedTabButton
    value={value}
    onValueChange={(next) => onChange(next as T)}
    options={options.map((option) => ({ value: option, label: option }))}
    buttonClassName="[&_span]:text-xs"
  />
);
