"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

interface CheckboxProps
	extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
}

function Checkbox({
	className,
	size = "sm",
	disabled = false,
	style,
	onCheckedChange,
	checked,
	...props
}: CheckboxProps) {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !disabled) {
			e.preventDefault();
			onCheckedChange?.(!checked);
		}
	};

	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			style={{ cursor: "default", ...style }}
			className={cn(
				"peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive  shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",

				!disabled && "hover:bg-hover-primary hover:border-primary",
				size === "sm" && "size-3.5",
				size === "md" && "size-4",
				size === "lg" && "size-4.5",

				className,
			)}
			checked={checked}
			onCheckedChange={onCheckedChange}
			onKeyDown={handleKeyDown}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="flex items-center justify-center text-current transition-none"
			>
				<CheckIcon
					className={cn(
						size === "sm" && "size-2.5",
						size === "md" && "size-3",
						size === "lg" && "size-3.5",
					)}
				/>
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
