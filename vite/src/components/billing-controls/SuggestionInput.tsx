import { Input } from "@autumn/ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Free-text input with an app-styled suggestion panel (native datalist
 *  renders with browser chrome, which clashes with the design system). */
export function SuggestionInput({
	value,
	onChange,
	placeholder,
	options,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	options: string[];
	className?: string;
}) {
	const [focused, setFocused] = useState(false);

	const MAX_RENDERED = 50;
	const query = value.trim().toLowerCase();
	const matches = options.filter((option) =>
		option.toLowerCase().includes(query),
	);
	const filtered = matches.slice(0, MAX_RENDERED);
	const open = focused && filtered.length > 0;

	return (
		<div className={cn("relative min-w-0 flex-1", className)}>
			<Input
				className="text-sm"
				onBlur={() => setFocused(false)}
				onChange={(e) => onChange(e.target.value)}
				onFocus={() => setFocused(true)}
				placeholder={placeholder}
				value={value}
			/>
			{open && (
				<div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-interactive-secondary p-1 shadow-md ring-1 ring-foreground/10">
					{filtered.map((option) => (
						<button
							className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-foreground text-sm hover:bg-accent"
							key={option}
							onMouseDown={(e) => {
								e.preventDefault();
								onChange(option);
								setFocused(false);
							}}
							type="button"
						>
							{option}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
