import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/v2/inputs/Input";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export function NumberField({
	label,
	placeholder,
	min,
	max,
	className,
	hideFieldInfo,
	disabled,
}: {
	label: string;
	placeholder?: string;
	min?: number;
	max?: number;
	className?: string;
	hideFieldInfo?: boolean;
	disabled?: boolean;
}) {
	const field = useFieldContext<number | null>();

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		if (value === "") {
			field.handleChange(null);
			return;
		}
		const numValue = Number.parseInt(value, 10);
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
			<Input
				type="number"
				min={min}
				max={max}
				placeholder={placeholder}
				value={field.state.value ?? ""}
				onChange={handleChange}
				className="text-sm"
				disabled={disabled}
			/>
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
