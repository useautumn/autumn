import { Button, Input, Label, SmallSpinner } from "@autumn/ui";
import { Minus, Plus } from "lucide-react";
import { FieldInfo } from "@/components/general/form/field-info";
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
	const stepSize = step > 0 ? step : 1;
	const tierStops = stops ?? [];
	const usesStops = tierStops.length > 0;
	const lastStop = tierStops.at(-1);
	const getPositiveModulo = ({
		value,
		divisor,
	}: {
		value: number;
		divisor: number;
	}) => ((value % divisor) + divisor) % divisor;

	const getSteppedIncrementValue = ({
		currentValue,
	}: {
		currentValue: number;
	}) => {
		if (stepSize === 1) {
			return currentValue + 1;
		}

		const remainder = getPositiveModulo({
			value: currentValue,
			divisor: stepSize,
		});
		if (remainder === 0) {
			return currentValue + stepSize;
		}

		return currentValue + (stepSize - remainder);
	};

	const getSteppedDecrementValue = ({
		currentValue,
	}: {
		currentValue: number;
	}) => {
		if (stepSize === 1) {
			return currentValue - 1;
		}

		const remainder = getPositiveModulo({
			value: currentValue,
			divisor: stepSize,
		});
		if (remainder === 0) {
			return currentValue - stepSize;
		}

		return currentValue - remainder;
	};

	const getNextStop = ({ currentValue }: { currentValue: number }) =>
		tierStops.find((stop) => stop > currentValue);

	const getPreviousStop = ({ currentValue }: { currentValue: number }) =>
		[...tierStops].reverse().find((stop) => stop < currentValue);

	const handleIncrement = () => {
		const currentValue = field.state.value ?? 0;
		if (usesStops) {
			const nextStop = getNextStop({ currentValue });
			if (nextStop === undefined) return;
			field.handleChange(
				max !== undefined ? Math.min(nextStop, max) : nextStop,
			);
			return;
		}
		const newValue = getSteppedIncrementValue({ currentValue });
		if (max !== undefined) {
			field.handleChange(Math.min(newValue, max));
			return;
		}
		field.handleChange(newValue);
	};

	const handleDecrement = () => {
		const currentValue = field.state.value ?? min;
		if (currentValue <= min) {
			return;
		}
		if (usesStops) {
			const previousStop = getPreviousStop({ currentValue });
			field.handleChange(Math.max(min, previousStop ?? min));
			return;
		}
		const steppedValue = getSteppedDecrementValue({ currentValue });
		const newValue = Math.max(min, steppedValue);
		field.handleChange(newValue);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		// if (value === "") {
		// 	field.handleChange(min);
		// 	return;
		// }
		if (value === "") {
			// Allow empty state temporarily - could use undefined or a special value
			field.handleChange(undefined as unknown as number);
			return;
		}
		const numValue = Number.parseInt(value);
		if (!Number.isNaN(numValue)) {
			if (max !== undefined && numValue > max) {
				field.handleChange(max);
			} else if (numValue < min) {
				field.handleChange(min);
			} else {
				field.handleChange(numValue);
			}
		}
	};

	return (
		<div className={cn(fullWidth && "w-full", className)}>
			{label && <Label>{label}</Label>}
			<div className="relative flex items-center">
				<div
					className={cn(
						"inline-flex rounded-lg overflow-hidden border border-border h-6 items-center",
						fullWidth ? "w-full" : "w-fit",
					)}
				>
					<Button
						type="button"
						aria-label="Decrease quantity"
						className={cn(
							"disabled:pointer-events-none disabled:opacity-50 rounded-none border-none h-input",
							compact ? "px-2" : "px-3",
						)}
						disabled={(field.state.value ?? min) <= min}
						onClick={handleDecrement}
						size="sm"
						variant="secondary"
					>
						<Minus aria-hidden="true" size={14} />
					</Button>

					<div
						className={cn(
							"relative border-x border-border",
							fullWidth && "min-w-0 flex-1",
						)}
					>
						<Input
							variant="headless"
							className={cn(
								"text-sm text-center h-input p-2",
								fullWidth ? "w-full" : compact ? "w-10" : "w-16",
							)}
							onChange={handleInputChange}
							type="number"
							value={field.state.value ?? ""}
							placeholder={placeholder}
							min={min}
							max={max}
							step={usesStops ? "any" : stepSize}
						/>
						{field.state.meta.isValidating && (
							<div className="pointer-events-none absolute inset-y-0 end-0 flex items-center justify-center pe-3 text-muted-foreground/80">
								<SmallSpinner aria-hidden="true" size={16} />
							</div>
						)}
					</div>

					<Button
						type="button"
						aria-label="Increase quantity"
						className={cn(
							"disabled:pointer-events-none disabled:opacity-50 rounded-none border-none h-input",
							compact ? "px-2" : "px-3",
						)}
						disabled={
							(max !== undefined && (field.state.value ?? 0) >= max) ||
							(usesStops &&
								lastStop !== undefined &&
								(field.state.value ?? 0) >= lastStop)
						}
						onClick={handleIncrement}
						size="sm"
						variant="secondary"
					>
						<Plus aria-hidden="true" size={14} />
					</Button>
				</div>
			</div>
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
