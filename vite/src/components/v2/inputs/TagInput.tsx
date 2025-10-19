import { X } from "lucide-react";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { cn } from "@/lib/utils";

interface TagInputProps
	extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
	value: string[];
	onChange: (tags: string[]) => void;
	inputValue?: string;
	onInputChange?: (value: string) => void;
	placeholder?: string;
	onTagAdd?: () => void;
	onTagRemove?: (index: number) => void;
}

function TagInput({
	className,
	value = [],
	onChange,
	inputValue: controlledInputValue,
	onInputChange,
	placeholder = "Add a tag...",
	onTagAdd,
	onTagRemove,
	...props
}: TagInputProps) {
	const [internalInputValue, setInternalInputValue] = React.useState("");
	const [isFocused, setIsFocused] = React.useState(false);
	const inputRef = React.useRef<HTMLInputElement>(null);

	const inputValue =
		controlledInputValue !== undefined
			? controlledInputValue
			: internalInputValue;
	const setInputValue = onInputChange || setInternalInputValue;

	const addTag = React.useCallback(() => {
		const trimmedValue = inputValue.trim();
		if (trimmedValue && !value.includes(trimmedValue)) {
			onChange([...value, trimmedValue]);
			setInputValue("");
			onTagAdd?.();
		}
	}, [inputValue, value, onChange, setInputValue, onTagAdd]);

	const removeTag = React.useCallback(
		(index: number) => {
			const newTags = value.filter((_, i) => i !== index);
			onChange(newTags);
			onTagRemove?.(index);
		},
		[value, onChange, onTagRemove],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;

		// Check if space was added at the end
		if (newValue.endsWith(" ")) {
			const trimmedValue = newValue.trim();
			if (trimmedValue && !value.includes(trimmedValue)) {
				onChange([...value, trimmedValue]);
				setInputValue("");
				onTagAdd?.();
			}
		} else {
			setInputValue(newValue);
		}
	};

	useHotkeys("enter", addTag, {
		enableOnFormTags: ["input"],
		enabled: isFocused,
	});

	useHotkeys("backspace", () => removeTag(value.length - 1), {
		enableOnFormTags: ["input"],
		enabled: isFocused && inputValue === "",
	});

	return (
		<button
			type="button"
			className={cn(
				"file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-lg border bg-transparent outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
				"placeholder:text-t6 placeholder:select-none min-h-input",
				"flex items-center flex-wrap gap-2 p-2 cursor-text text-left",
				isFocused && "data-state-open",
				"input-base input-shadow-default input-state-focus-within",
				className,
			)}
			data-slot="input"
			data-state={isFocused ? "open" : "closed"}
			onClick={() => inputRef.current?.focus()}
		>
			{value.map((tag, index) => {
				const displayValue = typeof tag === "string" ? tag : String(tag);
				return (
					<div
						key={index}
						className="flex items-center gap-1 border border-zinc-300 bg-zinc-50 rounded-lg pl-3 pr-2 py-1 text-xs"
					>
						<span className="text-tiny">{displayValue}</span>
						<button type="button" className="" onClick={() => removeTag(index)}>
							<X size={12} className="size-3 text-t4" />
						</button>
					</div>
				);
			})}
			<input
				{...props}
				ref={inputRef}
				type="text"
				className="outline-none bg-transparent flex-grow min-w-[100px] text-base md:text-sm"
				placeholder={value.length === 0 ? placeholder : ""}
				value={inputValue}
				onChange={handleInputChange}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
			/>
		</button>
	);
}

export { TagInput };
