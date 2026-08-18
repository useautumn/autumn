import { Label } from "@autumn/ui";
import { FieldInfo } from "@/components/general/form/field-info";
import { QuantityStepper } from "@/components/general/form/fields/quantity-stepper";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export function QuantityField({
	label,
	placeholder,
	textAfter,
	min = 1,
	max,
	step = 1,
	stops,
	className,
	hideFieldInfo,
	compact,
	fullWidth,
}: {
	label: string;
	placeholder?: string;
	textAfter?: string;
	min?: number;
	max?: number;
	step?: number;
	/** Ascending quantities the buttons snap to instead of stepping by `step`,
	 * e.g. volume-tier bounds. Beyond the last stop the buttons are disabled. */
	stops?: number[];
	className?: string;
	hideFieldInfo?: boolean;
	compact?: boolean;
	/** Stretches the stepper to its container instead of sizing to its content. */
	fullWidth?: boolean;
}) {
	const field = useFieldContext<number>();

	return (
		<div className={cn(fullWidth && "w-full", className)}>
			{label && <Label>{label}</Label>}
			<QuantityStepper
				compact={compact}
				fullWidth={fullWidth}
				isValidating={field.state.meta.isValidating}
				max={max}
				min={min}
				onChange={(value) => field.handleChange(value as unknown as number)}
				placeholder={placeholder}
				step={step}
				stops={stops}
				value={field.state.value}
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
