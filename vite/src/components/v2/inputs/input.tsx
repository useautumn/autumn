import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-lg border bg-transparent text-base shadow-sm outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				// "hover:border-purple-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",

				// Custom classes
				// "placeholder:text-form-placeholder text-form-text rounded-lg px-2 py-1 input-border transition-none",
				"form-input",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
