import { Minus, Plus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import { FAST_TRANSITION } from "@/lib/animations";

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
	const [inputValue, setInputValue] = useState(() => value.toString());
	const prevValue = useRef(value);

	const handleDecrement = () => {
		const newValue = Math.max(min, value - step);
		onChange(newValue);
		setInputValue(newValue.toString());
		prevValue.current = newValue;
	};

	const handleIncrement = () => {
		const newValue = Math.min(max, value + step);
		onChange(newValue);
		setInputValue(newValue.toString());
		prevValue.current = newValue;
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value;
		setInputValue(raw);

		const parsed = Number.parseInt(raw, 10);
		if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
			onChange(parsed);
			prevValue.current = parsed;
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

	const isAtMin = value <= min;
	const isAtMax = value >= max;

	return (
		<motion.div
			className="flex items-center border border-border rounded-lg overflow-hidden shadow-[0_4px_4px_0_rgba(0,0,0,0.02),inset_0_-3px_4px_0_rgba(0,0,0,0.04)]"
			animate={{
				opacity: disabled ? 0.6 : 1,
			}}
			transition={FAST_TRANSITION}
		>
			{/* Decrement button */}
			<motion.button
				type="button"
				className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-r border-border"
				onClick={handleDecrement}
				disabled={disabled || isAtMin}
				whileTap={{ scale: 0.9 }}
				transition={FAST_TRANSITION}
			>
				<Minus className="h-2.5 w-2.5" weight="bold" />
			</motion.button>

			{/* Number display */}
			<div className="w-10 h-6 flex items-center justify-center overflow-hidden relative">
				<input
					type="text"
					inputMode="numeric"
					pattern="[0-9]*"
					className="w-full h-full text-center text-xs font-medium tabular-nums text-foreground bg-transparent border-none focus:outline-none focus:ring-0 disabled:opacity-50"
					value={inputValue}
					onChange={handleInputChange}
					onBlur={handleBlur}
					disabled={disabled}
				/>
			</div>

			{/* Increment button */}
			<motion.button
				type="button"
				className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-l border-border"
				onClick={handleIncrement}
				disabled={disabled || isAtMax}
				whileTap={{ scale: 0.9 }}
				transition={FAST_TRANSITION}
			>
				<Plus className="h-2.5 w-2.5" weight="bold" />
			</motion.button>
		</motion.div>
	);
}
