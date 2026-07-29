import { Input, Label } from "@autumn/ui";
import { FieldInfo } from "@/components/general/form/field-info";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export function NumberField({
	label,
	description,
	placeholder,
	min,
	max,
	className,
	inputClassName,
	hideFieldInfo,
	disabled,
	float,
}: {
	label: string;
	description?: string;
	placeholder?: string;
	min?: number;
	max?: number;
	className?: string;
	inputClassName?: string;
	hideFieldInfo?: boolean;
	disabled?: boolean;
	/** Use parseFloat instead of parseInt */
	float?: boolean;
}) {
	const field = useFieldContext<number | null>();

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		if (value === "") {
			field.handleChange(null);
			return;
		}
		const numValue = float
			? Number.parseFloat(value)
			: Number.parseInt(value, 10);
		if (!Number.isNaN(numValue)) {
			if (max !== undefined && numValue > max) {
				field.handleChange(max);
			} else if (min !== undefined && numValue < min) {
				field.handleChange(min);
			} else {
				field.handleChange(numValue);
			}
		}
	};

	return (
		<div className={cn("*:not-first:mt-2", className)}>
			{label && <Label>{label}</Label>}
			{description && (
				<p className="text-tertiary-foreground text-xs">{description}</p>
			)}
			<Input
				type="number"
				min={min}
				max={max}
				placeholder={placeholder}
				value={field.state.value ?? ""}
				onChange={handleChange}
				className={cn("text-sm", inputClassName)}
				disabled={disabled}
			/>
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
