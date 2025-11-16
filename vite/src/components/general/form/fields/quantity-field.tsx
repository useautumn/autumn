import { Minus, Plus } from "lucide-react";
import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useFieldContext } from "@/hooks/form/form-context";
import SmallSpinner from "../../SmallSpinner";

export function QuantityField({
	label,
	placeholder,
	textAfter,
	min = 1,
	max,
	className,
}: {
	label: string;
	placeholder?: string;
	textAfter?: string;
	min?: number;
	max?: number;
	className?: string;
}) {
	const field = useFieldContext<number>();

	const handleIncrement = () => {
		const newValue = (field.state.value || 0) + 1;
		if (max === undefined || newValue <= max) {
			field.handleChange(newValue);
		}
	};

	const handleDecrement = () => {
		const newValue = (field.state.value || 0) - 1;
		if (newValue >= min) {
			field.handleChange(newValue);
		}
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		if (value === "") {
			field.handleChange(min);
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
				<div className="inline-flex rounded-lg overflow-hidden border border-border w-fit">
					<Button
						type="button"
						aria-label="Decrease quantity"
						className="disabled:pointer-events-none disabled:opacity-50 rounded-none border-none h-input px-3"
						disabled={field.state.value <= min}
						onClick={handleDecrement}
						size="sm"
						variant="secondary"
					>
						<Minus aria-hidden="true" size={14} />
					</Button>

					<div className="relative border-x border-border">
						<Input
							variant="headless"
							className="text-sm text-center w-16 h-input p-2"
							onChange={handleInputChange}
							placeholder={placeholder}
							type="number"
							value={field.state.value}
							min={min}
							max={max}
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
						className="disabled:pointer-events-none disabled:opacity-50 rounded-none border-none h-input px-3"
						disabled={max !== undefined && field.state.value >= max}
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
			<FieldInfo field={field} />
		</div>
	);
}
