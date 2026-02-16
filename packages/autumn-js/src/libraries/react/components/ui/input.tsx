import * as React from "react";

import { cn } from "../../lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
	({ className, type, onClick, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"file:au-text-foreground placeholder:au-text-muted-foreground selection:au-bg-primary selection:au-text-primary-foreground dark:au-bg-input/30 au-border-input au-flex au-h-9 au-w-full au-min-w-0 au-rounded-md au-border au-bg-transparent au-px-3 au-py-1 au-text-base au-shadow-xs au-transition-[color,box-shadow] au-outline-none file:au-inline-flex file:au-h-7 file:au-border-0 file:au-bg-transparent file:au-text-sm file:au-font-medium disabled:au-pointer-events-none disabled:au-cursor-not-allowed disabled:au-opacity-50 md:au-text-sm focus-visible:au-border-ring focus-visible:au-ring-ring/50 focus-visible:au-ring-[3px] aria-invalid:au-ring-destructive/20 dark:aria-invalid:au-ring-destructive/40 aria-invalid:au-border-destructive",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
