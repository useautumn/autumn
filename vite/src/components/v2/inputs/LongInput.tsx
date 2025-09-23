import type * as React from "react";

import { cn } from "@/lib/utils";

function LongInput({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-lg border bg-transparent px-3 py-2 text-base shadow-sm outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y min-h-[70px]",
				"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",

				// Custom classes
				"form-input",
				className,
			)}
			{...props}
		/>
	);
}

export { LongInput };
