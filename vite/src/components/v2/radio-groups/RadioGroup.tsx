import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as React from "react";

import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
	React.ElementRef<typeof RadioGroupPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-2", className)}
			{...props}
			ref={ref}
		/>
	);
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
	React.ElementRef<typeof RadioGroupPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, style, ...props }, ref) => {
	return (
		<RadioGroupPrimitive.Item
			ref={ref}
			data-slot="radio-group-item"
			style={{ cursor: "pointer", ...style }}
			className={cn(
				"w-[13px] h-[13px] px-0.5 py-[3px] rounded-xl inline-flex flex-col justify-center items-center gap-2.5 overflow-hidden transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",

				"bg-interactive-secondary shadow-[0px_2px_4px_0px_rgba(0,0,0,0.02)] border-[0.70px] border",
				"data-[state=checked]:bg-violet-600 data-[state=checked]:shadow-none data-[state=checked]:border-none",

				// Custom
				"hover:bg-interactive-secondary-hover hover:border-primary hover:border-[1px]",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="flex items-center justify-center"
			>
				<div className="w-1 h-1 bg-white rounded-full" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
