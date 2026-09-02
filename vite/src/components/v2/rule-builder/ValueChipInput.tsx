import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ValueChip } from "./ValueChip";

const SUBMIT_KEYS = new Set(["Enter", ",", " "]);

interface ValueChipInputProps {
	values: string[];
	onAdd: (value: string) => void;
	onRemove: (value: string) => void;
	placeholder?: string;
	className?: string;
	"aria-label"?: string;
}

/** The ValuePicker trigger with an inline input instead of a list: type, press enter, it becomes a chip. */
export function ValueChipInput({
	values,
	onAdd,
	onRemove,
	placeholder = "Type and press enter...",
	className,
	"aria-label": ariaLabel,
}: ValueChipInputProps) {
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const submitDraft = () => {
		const value = draft.trim();
		if (value && !values.includes(value)) onAdd(value);
		setDraft("");
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (SUBMIT_KEYS.has(event.key)) {
			event.preventDefault();
			submitDraft();
			return;
		}
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
			{values.map((value) => (
				<ValueChip key={value} label={value} onRemove={() => onRemove(value)} />
			))}
			<input
				ref={inputRef}
				aria-label={ariaLabel}
				type="text"
				className="flex-1 min-w-16 bg-transparent outline-none placeholder:text-tertiary-foreground"
				placeholder={values.length === 0 ? placeholder : ""}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={submitDraft}
				autoComplete="off"
				autoCorrect="off"
				autoCapitalize="off"
				spellCheck={false}
			/>
		</div>
	);
}
