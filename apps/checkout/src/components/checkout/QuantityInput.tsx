import { Minus, Plus } from "@phosphor-icons/react";
import { useState } from "react";

interface QuantityInputProps {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
}

export function QuantityInput({
	value,
	onChange,
	min = 0,
	max = 999999,
	step = 1,
	disabled = false,
}: QuantityInputProps) {
	const [inputValue, setInputValue] = useState(value.toString());

	const handleDecrement = () => {
		const newValue = Math.max(min, value - step);
		onChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleIncrement = () => {
		const newValue = Math.min(max, value + step);
		onChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value;
		setInputValue(raw);

		const parsed = Number.parseInt(raw, 10);
		if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
			onChange(parsed);
		}
	};

	const handleBlur = () => {
		// On blur, sync input value with actual value
		setInputValue(value.toString());
	};

	// Sync external value changes
	if (
		value.toString() !== inputValue &&
		document.activeElement?.tagName !== "INPUT"
	) {
		setInputValue(value.toString());
	}

	return (
		<div className="flex items-center border border-border rounded-lg overflow-hidden shadow-[0_4px_4px_0_rgba(0,0,0,0.02),inset_0_-3px_4px_0_rgba(0,0,0,0.04)]">
			<button
				type="button"
				className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-border"
				onClick={handleDecrement}
				disabled={disabled || value <= min}
			>
				<Minus className="h-3.5 w-3.5" weight="bold" />
			</button>
			<input
				type="text"
				inputMode="numeric"
				pattern="[0-9]*"
				className="w-16 h-8 text-center text-sm font-medium tabular-nums text-foreground bg-transparent border-none focus:outline-none focus:ring-0 disabled:opacity-50"
				value={inputValue}
				onChange={handleInputChange}
				onBlur={handleBlur}
				disabled={disabled}
			/>
			<button
				type="button"
				className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-border"
				onClick={handleIncrement}
				disabled={disabled || value >= max}
			>
				<Plus className="h-3.5 w-3.5" weight="bold" />
			</button>
		</div>
	);
}
