import { Minus, Plus } from "lucide-react";
import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";
import SmallSpinner from "../../SmallSpinner";

export function QuantityField({
	label,
	placeholder,
	textAfter,
	min = 1,
	max,
	step = 1,
	className,
	hideFieldInfo,
	compact,
}: {
	label: string;
	placeholder?: string;
	textAfter?: string;
	min?: number;
	max?: number;
	step?: number;
	className?: string;
	hideFieldInfo?: boolean;
	compact?: boolean;
}) {
	const field = useFieldContext<number>();
	const stepSize = step > 0 ? step : 1;
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

	const handleIncrement = () => {
		const currentValue = field.state.value ?? 0;
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
		<div className={className}>
			{label && <Label>{label}</Label>}
			<div className="relative flex items-center">
				<div
					className={cn(
						"inline-flex rounded-lg overflow-hidden border border-border w-fit h-6 items-center",
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

					<div className="relative border-x border-border">
						<Input
							variant="headless"
							className={cn(
								"text-sm text-center h-input p-2",
								compact ? "w-10" : "w-16",
							)}
							onChange={handleInputChange}
							type="number"
							value={field.state.value ?? ""}
							placeholder={placeholder}
							min={min}
							max={max}
							step={stepSize}
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
						disabled={max !== undefined && (field.state.value ?? 0) >= max}
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
