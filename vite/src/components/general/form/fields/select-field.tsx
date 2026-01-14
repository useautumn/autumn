import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFieldContext } from "@/hooks/form/form-context";

export type SelectFieldOption<T extends string | number = string> = {
	label: string;
	value: T;
	disabledValue?: string;
};

export function SelectField<T extends string | number = string>({
	label,
	options,
	placeholder,
	textAfter,
	className,
	hideFieldInfo,
	selectValueAfter,
}: {
	label: string;
	options: SelectFieldOption<T>[];
	placeholder: string;
	textAfter?: string;
	className?: string;
	hideFieldInfo?: boolean;
	selectValueAfter?: React.ReactNode;
}) {
	const field = useFieldContext<T>();

	// Convert value to string for the Select component (which only accepts strings)
	const stringValue = String(field.state.value);
	const handleChange = (value: string) => {
		// Convert back to the original type
		const typedValue = (
			typeof field.state.value === "number" ? Number(value) : value
		) as T;
		field.handleChange(typedValue);
	};

	return (
		<div className={className}>
			<Label>{label}</Label>
			<Select value={stringValue} onValueChange={handleChange}>
				<SelectTrigger className="w-full h-7">
					<div className="flex items-center gap-2">
						<SelectValue placeholder={placeholder} />
						{selectValueAfter && selectValueAfter}
					</div>
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem
							key={String(option.value)}
							value={String(option.value)}
							className={
								option.disabledValue ? "text-t4 pointer-events-none" : ""
							}
						>
							{option.label}
							{option.disabledValue && (
								<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
									{option.disabledValue}
								</span>
							)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
