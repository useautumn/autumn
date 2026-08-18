import { Button, Input, SmallSpinner } from "@autumn/ui";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const getPositiveModulo = ({
	value,
	divisor,
}: {
	value: number;
	divisor: number;
}) => ((value % divisor) + divisor) % divisor;

/** Controlled minus/input/plus stepper. `QuantityField` wraps this for forms. */
export function QuantityStepper({
	value,
	onChange,
	min = 1,
	max,
	step = 1,
	stops,
	placeholder,
	className,
	compact,
	fullWidth,
	isValidating,
}: {
	value: number | undefined;
	onChange: (value: number | undefined) => void;
	min?: number;
	max?: number;
	step?: number;
	/** Ascending quantities the buttons snap to instead of stepping by `step`,
	 * e.g. volume-tier bounds. Beyond the last stop the buttons are disabled. */
	stops?: number[];
	placeholder?: string;
	className?: string;
	compact?: boolean;
	/** Stretches the stepper to its container instead of sizing to its content. */
	fullWidth?: boolean;
	isValidating?: boolean;
}) {
	const stepSize = step > 0 ? step : 1;
	const tierStops = stops ?? [];
	const usesStops = tierStops.length > 0;
	const lastStop = tierStops.at(-1);

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
		const currentValue = value ?? 0;
		if (usesStops) {
			const nextStop = getNextStop({ currentValue });
			if (nextStop === undefined) return;
			onChange(max !== undefined ? Math.min(nextStop, max) : nextStop);
			return;
		}
		const newValue = getSteppedIncrementValue({ currentValue });
		if (max !== undefined) {
			onChange(Math.min(newValue, max));
			return;
		}
		onChange(newValue);
	};

	const handleDecrement = () => {
		const currentValue = value ?? min;
		if (currentValue <= min) {
			return;
		}
		if (usesStops) {
			const previousStop = getPreviousStop({ currentValue });
			onChange(Math.max(min, previousStop ?? min));
			return;
		}
		const steppedValue = getSteppedDecrementValue({ currentValue });
		onChange(Math.max(min, steppedValue));
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value;
		if (inputValue === "") {
			// Allow the field to sit empty while the user retypes a quantity.
			onChange(undefined);
			return;
		}
		const numValue = Number.parseInt(inputValue);
		if (Number.isNaN(numValue)) return;
		if (max !== undefined && numValue > max) {
			onChange(max);
		} else if (numValue < min) {
			onChange(min);
		} else {
			onChange(numValue);
		}
	};

	return (
		<div className={cn("relative flex items-center", className)}>
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
					disabled={(value ?? min) <= min}
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
						value={value ?? ""}
						placeholder={placeholder}
						min={min}
						max={max}
						step={usesStops ? "any" : stepSize}
					/>
					{isValidating && (
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
						(max !== undefined && (value ?? 0) >= max) ||
						(usesStops && lastStop !== undefined && (value ?? 0) >= lastStop)
					}
					onClick={handleIncrement}
					size="sm"
					variant="secondary"
				>
					<Plus aria-hidden="true" size={14} />
				</Button>
			</div>
		</div>
	);
}
