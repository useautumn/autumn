import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const inputVariants = cva(
	`file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 w-full min-w-0 rounded-lg border bg-transparent text-base outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm placeholder:select-none shadow-sm transition-none p-2
	
	// Custom classes
	h-input input-base input-shadow-default input-state-focus
	`,
	{
		variants: {
			variant: {
				default: "",
				destructive: "input-destructive-base input-destructive-shadow",
				headless: "!border-0 !shadow-none !ring-0 !bg-transparent !p-0 !px-0.5",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface InputProps
	extends React.ComponentProps<"input">,
		VariantProps<typeof inputVariants> {}

function Input({
	className,
	type,
	variant,
	onFocus,
	onBlur,
	...props
}: InputProps) {
	const [isFocused, setIsFocused] = React.useState(false);
	return (
		<input
			type={type}
			data-slot="input"
			onFocus={(e) => {
				setIsFocused(true);
				onFocus?.(e);
			}}
			onBlur={(e) => {
				setIsFocused(false);
				onBlur?.(e);
			}}
			data-state={isFocused ? "open" : "closed"}
			className={cn(inputVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Input };
