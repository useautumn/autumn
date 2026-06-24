import { Select, SelectContent, SelectItem, SelectTrigger } from "@autumn/ui";

interface FilterOption<T extends string> {
	value: T;
	label: string;
}

export const WorkbenchFilterSelect = <T extends string>({
	value,
	options,
	onChange,
	placeholder,
}: {
	value: T;
	options: readonly FilterOption<T>[];
	onChange: (next: T) => void;
	placeholder: string;
}) => {
	const label = options.find((o) => o.value === value)?.label ?? placeholder;

	return (
		<Select value={value} onValueChange={(v) => onChange(v as T)}>
			<SelectTrigger
				size="sm"
				className="!h-7 !text-xs !min-w-[120px] px-2.5 cursor-pointer"
			>
				<span className="truncate">{label}</span>
			</SelectTrigger>
			<SelectContent align="end">
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value} className="cursor-pointer">
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};
