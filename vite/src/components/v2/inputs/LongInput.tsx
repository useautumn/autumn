import * as React from "react";

import { cn } from "@/lib/utils";

function LongInput({ className, ...props }: React.ComponentProps<"textarea">) {
	const [isFocused, setIsFocused] = React.useState(false);
	return (
		<textarea
			data-slot="textarea"
			onFocus={() => setIsFocused(true)}
			onBlur={() => setIsFocused(false)}
			data-state={isFocused ? "open" : "closed"}
			className={cn(
				"selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-lg border text-base px-2 py-1 shadow-sm outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y min-h-[70px]",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",

				// Custom classes
				"placeholder:text-t6 placeholder:select-none input-base input-shadow form-input bg-input-background transition-none",
				className,
			)}
			{...props}
		/>
	);
}

export { LongInput };
