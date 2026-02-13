import { CheckIcon } from "lucide-react";
import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import { useFieldContext } from "@/hooks/form/form-context";

export type SelectFieldOption<T extends string | number = string> = {
	label: string;
	value: T;
	disabledValue?: string;
	/** Shows a badge without disabling the option */
	badgeValue?: string;
};

export function SelectField<T extends string | number = string>({
	label,
	options,
	placeholder,
	textAfter,
	className,
	hideFieldInfo,
	selectValueAfter,
	disabled,
	searchable = false,
	searchPlaceholder = "Search...",
	emptyText = "No results found",
	defaultOpen = false,
}: {
	label: string;
	options: SelectFieldOption<T>[];
	placeholder: string;
	textAfter?: string;
	className?: string;
	hideFieldInfo?: boolean;
	selectValueAfter?: React.ReactNode;
	disabled?: boolean;
	searchable?: boolean;
	searchPlaceholder?: string;
	emptyText?: string;
	defaultOpen?: boolean;
}) {
	const field = useFieldContext<T>();
	const stringValue = String(field.state.value);

	const handleChange = (value: string) => {
		const typedValue = (
			typeof field.state.value === "number" ? Number(value) : value
		) as T;
		field.handleChange(typedValue);
	};

	return (
		<div className={className}>
			{label && <Label>{label}</Label>}
			<SearchableSelect
				value={stringValue}
				onValueChange={handleChange}
				options={options}
				getOptionValue={(opt) => String(opt.value)}
				getOptionLabel={(opt) => opt.label}
				getOptionDisabled={(opt) => !!opt.disabledValue}
				placeholder={placeholder}
				searchable={searchable}
				searchPlaceholder={searchPlaceholder}
				emptyText={emptyText}
				disabled={disabled}
				defaultOpen={defaultOpen}
				renderValue={(opt) => (
					<>
						<span className={!opt ? "text-t3" : undefined}>
							{opt?.label || placeholder}
						</span>
						{selectValueAfter && opt && (
							<span className="shrink-0">{selectValueAfter}</span>
						)}
					</>
				)}
				renderOption={(opt, isSelected) => (
					<>
						<span className="flex-1 truncate min-w-0">{opt.label}</span>
						{(opt.disabledValue || opt.badgeValue) && (
							<span className="shrink-0 text-xs text-t3 bg-muted px-1 py-0 rounded-md">
								{opt.disabledValue || opt.badgeValue}
							</span>
						)}
						{isSelected && !opt.disabledValue && !opt.badgeValue && (
							<CheckIcon className="size-4 shrink-0" />
						)}
					</>
				)}
			/>
			{textAfter && (
				<section
					aria-live="polite"
					className="mt-2 text-muted-foreground text-xs"
				>
					{textAfter}
				</section>
			)}
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
