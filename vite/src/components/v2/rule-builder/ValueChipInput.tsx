import type { ReactNode } from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useDraftValue } from "./useDraftValue";
import { ValueChip } from "./ValueChip";

const CHIP_SUBMIT_KEYS = ["Enter", ",", " "];

interface ValueChipInputProps {
	values: string[];
	onAdd: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder?: string;
	leading?: ReactNode;
	trailing?: ReactNode;
	className?: string;
	"aria-label"?: string;
}

/** The ValuePicker trigger with an inline input instead of a list: type, press enter, it becomes a chip. */
export function ValueChipInput({
	values,
	onAdd,
	onRemove,
	placeholder = "Type and press enter...",
	leading,
	trailing,
	className,
	"aria-label": ariaLabel,
}: ValueChipInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const { draft, inputProps } = useDraftValue({
		onSubmit: (value) => {
			if (!values.includes(value)) onAdd(value);
		},
		submitKeys: CHIP_SUBMIT_KEYS,
	});

	const removeLastChipOnBackspace = (
		event: React.KeyboardEvent<HTMLInputElement>,
	) => {
		inputProps.onKeyDown(event);
		const removesLastChip =
			event.key === "Backspace" && draft === "" && values.length > 0;
		if (removesLastChip) onRemove(values[values.length - 1]);
	};

	return (
		<div
			className={cn(
				"flex items-center gap-1.5 h-8 px-3 rounded-xl input-base input-state-focus-within cursor-text min-w-0 w-full text-sm overflow-hidden",
				className,
			)}
			onClick={() => inputRef.current?.focus()}
		>
			{leading}
			{values.map((value) => (
				<ValueChip key={value} label={value} onRemove={() => onRemove(value)} />
			))}
			<input
				{...inputProps}
				ref={inputRef}
				aria-label={ariaLabel}
				type="text"
				className="flex-1 min-w-16 bg-transparent outline-none placeholder:text-tertiary-foreground"
				placeholder={values.length === 0 ? placeholder : ""}
				onKeyDown={removeLastChipOnBackspace}
				autoComplete="off"
				autoCorrect="off"
				autoCapitalize="off"
				spellCheck={false}
			/>
			{trailing}
		</div>
	);
}
